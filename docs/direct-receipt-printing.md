# Direct receipt printing on the checkout computer

Use the command-file launchers below, not the installed Oushadhi app icon or a normal browser shortcut. They may look identical, but only the dedicated launch enables silent printing. The launcher now checks the running Chrome process for both required flags and reports a failure if they are absent; it never forcibly closes another browser session.

Double-click **Open POS Direct Print.cmd** for the hosted shop, or **Open Local POS Direct Print.cmd** for localhost:3000 (the local server must already be running).

The command window stays open to show the result. If the POS does not appear, copy the displayed error before pressing a key. On another computer, copy both the CMD file and the `scripts` folder containing `start-direct-print.ps1`; keep them together in the same parent folder. Updating files on this computer does not update a previously copied launcher on another computer.

The launcher verifies that POS80 is the Windows default printer and opens a dedicated Chrome app window with silent-print flags. Log in once in this separate browser profile. Use this window for checkout and receipt reprinting: successful checkout already invokes the same printer as the Print button. Browser processing and printer startup still take time; this removes the manual confirmation step.

Ordinary browser tabs keep their existing behaviour. The launcher does not modify browser policies, printer defaults, or driver feed/cut settings. To stop using direct printing, close the dedicated POS window and use the normal browser. If a different default printer is selected later, close the POS window and restore POS80 before reopening it.

For configuration checks without opening the app or printing:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-direct-print.ps1 -CheckOnly
```

Verify with one existing receipt on the actual H80i. Do not create a sale just to test printing. A print-preview window may briefly appear before Chrome submits the job automatically; if it stays open, close all dedicated POS windows and relaunch using the command file.

Production uses `%LOCALAPPDATA%\OushadhiPOS\DirectPrintChrome-Production`; localhost uses `DirectPrintChrome-Local` under the same folder. Their windows and login sessions are separate. The launcher checks the browser's startup address as well as its printing flags. The older shared `DirectPrintChrome` profile is no longer used or modified. After updating, sign in once in the new production window.

Chromium documents the flags in its [print-preview implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/ui/webui/print_preview/print_preview_utils.cc) and [system-default printer preference mapping](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/prefs/chrome_command_line_pref_store.cc).
