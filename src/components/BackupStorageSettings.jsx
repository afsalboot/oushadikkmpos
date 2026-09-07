"use client";
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import BackupFolderPicker from "./BackupFolderPicker";

export default function BackupStorageSettings({
  value,
  onChange,
  disabled,
  error,
  storage,
}) {
  const [choosing, setChoosing] = useState(false);
  if (storage === "mongodb")
    return (
      <section className="card p-5 sm:p-6">
        <h3 className="text-lg font-extrabold">Backup storage</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Encrypted backups are stored in your hosted database. Download a copy
          to a separate device for recovery if the database becomes unavailable.
        </p>
      </section>
    );
  return (
    <section className="card p-5 sm:p-6">
      <h3 className="text-lg font-extrabold">Backup storage location</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Choose a folder on the computer or server running the POS. For a hosted
        POS, this is a server folder, not a folder on this browser device.
      </p>
      <label className="mt-4 block" htmlFor="backup-storage-directory">
        <span className="label">Server folder path</span>
        <input
          id="backup-storage-directory"
          className="field"
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          maxLength={1024}
          placeholder="Full path to your backup folder"
          aria-invalid={Boolean(error)}
          aria-describedby="backup-storage-help backup-storage-error"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button
        type="button"
        className="btn mt-3"
        disabled={disabled}
        onClick={() => setChoosing(true)}
      >
        <FolderOpen size={18} />
        Choose folder
      </button>
      {choosing && (
        <BackupFolderPicker
          initialPath={value}
          onClose={() => setChoosing(false)}
          onSelect={(folder) => {
            onChange(folder);
            setChoosing(false);
          }}
        />
      )}
      <p
        id="backup-storage-error"
        role={error ? "alert" : undefined}
        className="mt-2 text-sm text-red-700"
      >
        {error}
      </p>
      <p id="backup-storage-help" className="mt-2 text-sm text-[var(--muted)]">
        For example, D:\Backups\Oushadhi on Windows or /mnt/backups/oushadhi on
        Linux. Leave blank to use the deployment default. Click Save Changes to
        check folder access and apply.
      </p>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        New backups and the backup history use the saved folder. Existing
        archives stay in their previous location and are not moved or deleted.
      </p>
    </section>
  );
}
