"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Folder, HardDrive, LoaderCircle, X } from "lucide-react";

export default function BackupFolderPicker({ initialPath, onSelect, onClose }) {
  const dialog = useRef(null);
  const [location, setLocation] = useState(initialPath || "");
  const [listing, setListing] = useState(null);
  const [failure, setFailure] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setFailure("");
      setSearch("");
      try {
        const response = await fetch(
          `/api/backups/folders?path=${encodeURIComponent(location)}`,
          { signal: controller.signal },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not load folders");
        if (!controller.signal.aborted) setListing(result.data);
      } catch (error) {
        if (!controller.signal.aborted) {
          setListing(null);
          setFailure(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [location]);
  function navigate(target) {
    setListing(null);
    setLoading(true);
    setLocation(target);
  }
  const folders =
    listing?.folders.filter((folder) =>
      folder.name.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="backup-picker-title"
      aria-describedby="backup-picker-description"
      className="m-auto w-[calc(100%-24px)] max-w-xl rounded-2xl border border-[var(--line)] bg-white p-5 text-[var(--ink)] shadow-2xl backdrop:bg-black/45"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="backup-picker-title" className="text-xl font-extrabold">
          Choose backup folder
        </h2>
        <button
          type="button"
          className="btn"
          aria-label="Close folder picker"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p
        id="backup-picker-description"
        className="mt-2 text-sm text-[var(--muted)]"
      >
        Browse folders on the computer running the POS server.
      </p>
      <div className="my-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          disabled={!location || loading}
          onClick={() => navigate("")}
        >
          <HardDrive size={16} />
          Drives
        </button>
        <button
          type="button"
          className="btn"
          disabled={loading || listing?.parent == null}
          onClick={() => navigate(listing.parent)}
        >
          <ArrowUp size={16} />
          Up
        </button>
      </div>
      <p className="mb-3 break-all rounded-lg bg-slate-50 p-3 text-sm">
        {location || "Available drives"}
      </p>
      <input
        className="field mb-3"
        aria-label="Filter folders"
        placeholder="Filter folders…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        disabled={loading}
      />
      <div
        className="h-64 overflow-y-auto rounded-xl border border-[var(--line)] p-2"
        aria-busy={loading}
      >
        {loading ? (
          <p role="status" className="flex items-center gap-2 p-3">
            <LoaderCircle size={18} className="loading-shimmer-icon" />
            Loading folders…
          </p>
        ) : failure ? (
          <p role="alert" className="p-3 text-sm text-red-700">
            {failure}
          </p>
        ) : folders.length ? (
          folders.map((folder) => (
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-slate-50 focus-visible:outline-2"
              key={folder.path}
              onClick={() => navigate(folder.path)}
            >
              <Folder size={19} className="shrink-0 text-[var(--green)]" />
              <span className="break-all">{folder.name}</span>
            </button>
          ))
        ) : (
          <p className="p-3 text-sm text-[var(--muted)]">
            {search
              ? "No matching folders."
              : "No subfolders. You can select this folder."}
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || !listing?.directory || Boolean(failure)}
          onClick={() => onSelect(listing.directory)}
        >
          Select this folder
        </button>
      </div>
    </dialog>
  );
}
