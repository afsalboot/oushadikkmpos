import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Kept outside the business collections included in snapshots and replaced by restore.
export const BACKUP_BUCKET = "oushadiBackupArchives";

export async function listGridBackups(bucket, pattern) {
  const files = await bucket.find({ filename: { $regex: pattern } }).sort({ uploadDate: -1 }).toArray();
  return files.map((file) => ({
    name: file.filename,
    type: file.filename.startsWith("oushadi-auto-") ? "AUTOMATIC" : "MANUAL",
    createdAt: file.uploadDate.toISOString(),
    size: file.length,
  }));
}

export async function writeGridBackup(bucket, name, archive) {
  const upload = bucket.openUploadStream(name);
  try {
    await pipeline(Readable.from([Buffer.from(archive, "utf8")]), upload);
  } catch (error) {
    await upload.abort().catch(() => {});
    throw error;
  }
  return { size: Buffer.byteLength(archive, "utf8") };
}

export async function readGridBackup(bucket, name) {
  const [file] = await bucket.find({ filename: name }).sort({ uploadDate: -1 }).limit(1).toArray();
  if (!file) throw Object.assign(new Error("Backup file not found"), { status: 404 });
  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(file._id)) chunks.push(chunk);
  return Buffer.concat(chunks);
}
