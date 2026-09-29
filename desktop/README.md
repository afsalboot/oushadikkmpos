# Oushadhi POS desktop

## Local desktop backups

Use **POS > Select Backup Folder**, then **POS > Automatic Backup** to choose Daily, Weekly, or Off. Automatic backup is off initially. **POS > Back Up Now** creates and downloads an encrypted `.obak` archive; **POS > Backup Status** shows the last saved file and any failure. Each computer remembers its own folder and schedule. No server credentials or encryption keys are copied into the desktop app.

Keep the app open, online, and signed in as an owner. Due backups run on the next scheduler check (within a minute); missed intervals produce one catch-up backup. Failed attempts retry after 15 minutes. A completed manual backup also resets the schedule. Closing the app stops scheduling. The feature uses the existing owner-only server backup endpoints and creates a server archive before downloading it. Interrupted downloads retry that same archive where its name was saved successfully. Server encryption must already be configured.

Existing local files are not automatically removed. Keep enough disk space and retain the server backup encryption key separately for restoration. Archives are checked for the encrypted envelope format locally; decryption and restoration remain server operations in Settings > Backups. This menu does not restore data. Tests use mocked server responses; authenticated live backup/download and restoration must be verified separately.

Windows Electron client for https://oushadikkmpos.vercel.app. Internet and an available hosted POS server are required; this does not provide offline sales or a local database. Existing hosted releases appear in the desktop client without rebuilding its installer.

From the project root:

```powershell
npm run desktop:install
npm run desktop:start
npm run desktop:test
npm run desktop:smoke
npm run desktop:dist
```

The Windows x64 installer is written to `dist-desktop/Oushadhi-POS-Setup-<version>.exe`. Building requires internet on the first run to download Electron and the Windows installer tools. The desktop package has its own lockfile and no server dependencies. It bundles only its main process, receipt-print adapter, logo, URL policy, fallback page, and package metadata. Never copy `.env.local`, backups, or server credentials into it.

To update an installed copy, close Oushadhi POS and run the newer installer. Setup reuses the registered installation folder and, when exactly one installation scope exists, keeps that scope (including requesting administrator access for an existing all-users installation). Fresh installs still offer a user/all-users choice. If both scopes already contain an installation, setup retains its scope selector; it does not automatically delete either copy. Keep `build.appId` and the package name stable, and increment the desktop package version and lockfile for each distributed release. Do not uninstall first. User profile data is retained by the normal upgrade. Validate upgrades from 0.1.0 for both installation scopes on a Windows test machine before release.

For local development, run `npm run dev` in one terminal and `npm run desktop:dev` in another. The local client connects to `http://localhost:3000`. Installed builds always use the production URL in `desktop/policy.mjs`; changing that URL requires a new installer.

The POS menu provides Home / Reconnect (`Ctrl+R`). Login cookies persist in Electron's per-user application profile. Use the POS logout action on shared computers. Downloads use Electron's normal download handling. Complete Payment automatically prints the saved receipt silently to the selected printer. Receipt reprints also print directly. Use POS > Select Receipt Printer to save the exact installed printer for this computer (POS80, Helett, or any other name). With no saved choice, the Windows default is used. A missing saved printer produces an error instead of silently switching devices. Set the correct paper size in its driver preferences (80 mm for an 80 mm thermal printer). Other page printing keeps the normal dialog. If submission fails, an error explains how to reprint the saved invoice; do not repeat payment. Printer acceptance does not prove paper output, so check paper, connection, and the Windows queue. Camera access for barcode scanning asks for permission. External navigation and pop-up windows are blocked.

Renderer pages are sandboxed with context isolation, no Node integration, a narrowly scoped receipt-print preload bridge, and no production developer tools. The session denies permissions except confirmed video camera requests from the configured POS origin. TLS validation remains enabled.

`desktop:smoke` opens a hidden, temporary-running client and checks whether the production page loads, then exits. Smoke checks use an isolated temporary profile. Run `npm --prefix desktop run smoke:print` to verify receipt interception, duplicate-call suppression, IPC, and cleanup with physical printing mocked. It does not log in, create records, or verify checkout and printing.

Release acceptance: install on a Windows test machine; verify login/logout and session persistence, Retail/Wholesale checkout, barcode camera, downloads, receipt printing, reconnect after loss of internet, and uninstall. These require manual validation and a physical printer where applicable.

The installer is unsigned unless Windows code-signing credentials are configured for electron-builder in the release environment. Unsigned builds can trigger Windows SmartScreen. There is no automatic updater; rebuild and distribute the installer when Electron or the desktop shell changes. Keep Electron patched.


