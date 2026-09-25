# Direct receipt printing on the checkout computer

Use the command-file launchers below, not the installed Oushadhi app icon or a normal browser shortcut. They may look identical, but only the dedicated launch enables silent printing. The launcher now checks the running Edge process for both required flags and reports a failure if they are absent; it never forcibly closes another browser session.

Double-click **Open POS Direct Print.cmd** for the hosted shop, or **Open Local POS Direct Print.cmd** for localhost:3000 (the local server must already be running).

The launcher verifies that POS80 is the Windows default printer and opens a dedicated Edge app window with silent-print flags. Log in once in this separate browser profile. Use this window for checkout and receipt reprinting: successful checkout already invokes the same printer as the Print button. Browser processing and printer startup still take time; this removes the manual confirmation step.

Ordinary Edge tabs keep their existing behaviour. The launcher does not modify Edge policies, printer defaults, or driver feed/cut settings. To stop using direct printing, close the dedicated POS window and use the normal browser. If a different default printer is selected later, close the POS window and restore POS80 before reopening it.

For configuration checks without opening the app or printing:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-direct-print.ps1 -CheckOnly
```

Verify with one existing receipt on the actual H80i. Do not create a sale just to test printing. A print-preview window may briefly appear before Edge submits the job automatically; if it stays open, close all dedicated POS windows and relaunch using the command file.

The separate profile is stored at `%LOCALAPPDATA%\OushadhiPOS\DirectPrintEdge`. The launcher is restricted to the shop's hosted URL and localhost:3000.

Chromium documents the flags in its [print-preview implementation](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/ui/webui/print_preview/print_preview_utils.cc) and [system-default printer preference mapping](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/prefs/chrome_command_line_pref_store.cc).
