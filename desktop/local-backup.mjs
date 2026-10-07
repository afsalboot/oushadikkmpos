import {
  readFile,
  writeFile,
  rename,
  unlink,
  access,
  link,
  copyFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";

export const frequencies = { DAILY: 86400000, WEEKLY: 604800000 };
const validName =
  /^oushadi-(manual|auto)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.obak$/;
export function backupDue(state, now = Date.now()) {
  return Boolean(
    state.enabled &&
    state.directory &&
    frequencies[state.frequency] &&
    (!state.lastSuccess ||
      now - state.lastSuccess >= frequencies[state.frequency]) &&
    (!state.lastAttempt || now - state.lastAttempt >= 900000),
  );
}

export class LocalBackup {
  constructor({ configPath, request, now = Date.now }) {
    Object.assign(this, { configPath, request, now, busy: false });
    this.state = {
      enabled: false,
      frequency: "DAILY",
      directory: "",
      lastSuccess: 0,
      lastAttempt: 0,
      lastError: "",
      lastFile: "",
      pending: "",
    };
  }
  async load() {
    try {
      const saved = JSON.parse(await readFile(this.configPath, "utf8"));
      if (
        saved &&
        typeof saved.directory === "string" &&
        (!saved.directory || isAbsolute(saved.directory)) &&
        frequencies[saved.frequency]
      ) {
        Object.assign(this.state, saved, { enabled: saved.enabled === true });
      }
    } catch (error) {
      if (error.code !== "ENOENT")
        this.state.lastError =
          "Backup settings could not be read. Select the folder and schedule again.";
    }
  }
  async save() {
    const temp = `${this.configPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(this.state), { flag: "wx" });
      await rename(temp, this.configPath);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  async configure(changes) {
    if (this.busy)
      throw new Error(
        "A backup is running. Wait before changing backup settings.",
      );
    if (changes.directory) {
      if (!isAbsolute(changes.directory))
        throw new Error("Choose an absolute folder path.");
      await access(changes.directory, constants.W_OK);
    }
    const previous = this.state;
    this.state = { ...previous, ...changes };
    try {
      await this.save();
    } catch (error) {
      this.state = previous;
      throw error;
    }
  }
  async response(path, method = "GET") {
    const result = await this.request(path, {
      method,
      signal: AbortSignal.timeout(180000),
    });
    if (!result.ok) {
      if ([401, 403].includes(result.status))
        throw new Error("Sign in as the owner to create and download backups.");
      throw new Error(
        `Backup server request failed (${result.status}). Check the connection and server backup configuration.`,
      );
    }
    return result;
  }
  async run() {
    if (this.busy) throw new Error("A backup is already running.");
    if (!this.state.directory)
      throw new Error("Choose POS > Select Backup Folder first.");
    this.busy = true;
    let temporary;
    try {
      this.state.lastAttempt = this.now();
      await this.save();
      await access(this.state.directory, constants.W_OK);
      if (!this.state.pending) {
        const response = await this.response("/api/backups", "POST");
        const data = (await response.json()).data;
        if (!validName.test(data?.name || ""))
          throw new Error("The server returned an invalid backup name.");
        this.state.pending = data.name;
        await this.save();
      }
      if (!validName.test(this.state.pending))
        throw new Error("Invalid pending backup name.");
      const response = await this.response(
        `/api/backups/${encodeURIComponent(this.state.pending)}`,
      );
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 100 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Backup exceeds the 100 MB restore limit.");
        }
        chunks.push(Buffer.from(value));
      }
      const bytes = Buffer.concat(chunks);
      const envelope = JSON.parse(bytes.toString("utf8"));
      if (
        envelope.format !== "oushadi-pos-backup" ||
        envelope.version !== 1 ||
        envelope.encryption !== "AES-256-GCM" ||
        !envelope.data ||
        !envelope.tag
      ) {
        throw new Error("The download is not an encrypted Oushadhi backup.");
      }
      // Exclusive final creation preserves earlier archives even on a retry.
      const target = join(this.state.directory, this.state.pending);
      temporary = `${target}.${randomUUID()}.partial`;
      await writeFile(temporary, bytes, { flag: "wx" });
      try {
        // link publishes a fully written file atomically without replacing an existing archive.
        try {
          await link(temporary, target);
        } catch (error) {
          if (!["EPERM", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(error.code))
            throw error;
          // FAT/exFAT destinations do not support hard links. Never overwrite there either.
          await copyFile(temporary, target, constants.COPYFILE_EXCL);
        }
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const existing = await readFile(target);
        if (!existing.equals(bytes))
          throw new Error(
            "A different archive already exists with this name. Choose another folder.",
          );
      }
      this.state.lastFile = target;
      this.state.lastSuccess = this.now();
      this.state.lastError = "";
      this.state.pending = "";
      await this.save();
      return target;
    } catch (error) {
      this.state.lastError = error.message;
      await this.save().catch(() => {});
      throw error;
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      this.busy = false;
    }
  }
}
