import { app, BrowserWindow, WebContentsView, dialog, Menu, session, ipcMain } from "electron";
import { printReceipt } from "./receipt-print.mjs";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStartUrl, isTrustedUrl } from "./policy.mjs";
import { LocalBackup, backupDue } from "./local-backup.mjs";

const startUrl = getStartUrl(app.isPackaged, process.argv);
const printSmoke = !app.isPackaged && process.argv.includes("--print-smoke");
const smoke = !app.isPackaged && (process.argv.includes("--smoke") || printSmoke);
if (smoke) app.setPath("userData", mkdtempSync(join(tmpdir(), "oushadhi-desktop-check-")));
let smokePrintCount = 0;
const offlinePath = fileURLToPath(new URL("./offline.html", import.meta.url));
let mainWindow;
let appView;
let loading = false;
let localBackup;
async function backupAction(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { await action(); } catch (error) {
    await dialog.showMessageBox(mainWindow, { type: "error", title: "Desktop backup", message: error.message });
  }
}
async function selectBackupFolder() {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Select Backup Folder", properties: ["openDirectory", "createDirectory"],
    defaultPath: localBackup.state.directory || app.getPath("documents") });
  if (result.canceled) return;
  await localBackup.configure({ directory: result.filePaths[0], lastSuccess: 0, lastAttempt: 0 });
  await dialog.showMessageBox(mainWindow, { title: "Backup folder saved", message: "Desktop backups will be saved here.", detail: result.filePaths[0] });
}
async function configureAutomaticBackup() {
  const state = localBackup.state;
  const { response } = await dialog.showMessageBox(mainWindow, { title: "Automatic Desktop Backup",
    message: "Choose how often to save a local backup.",
    detail: `Current: ${state.enabled ? state.frequency : "Off"}\nRuns while this app is open, online, and signed in as an owner. The first backup runs when enabled.`,
    buttons: ["Daily", "Weekly", "Off", "Cancel"], defaultId: 3, cancelId: 3 });
  if (response === 3) return;
  if (response !== 2 && !state.directory) await selectBackupFolder();
  if (response !== 2 && !localBackup.state.directory) return;
  await localBackup.configure({ enabled: response !== 2, frequency: response === 1 ? "WEEKLY" : "DAILY" });
  void checkBackup();
}
async function checkBackup() {
  if (!localBackup.busy && backupDue(localBackup.state)) await localBackup.run().catch(() => {});
}
async function showBackupStatus() {
  const state = localBackup.state;
  await dialog.showMessageBox(mainWindow, { title: "Desktop Backup Status", message: localBackup.busy ? "Backup in progress" : "Desktop backup status",
    detail: `Folder: ${state.directory || "Not selected"}\nAutomatic: ${state.enabled ? state.frequency : "Off"}\nLast saved: ${state.lastSuccess ? new Date(state.lastSuccess).toLocaleString() : "Never"}\nFile: ${state.lastFile || "None"}\nLast error: ${state.lastError || "None"}\nFailed scheduled backups retry after 15 minutes. Existing files are never automatically deleted.` });
}
const printerSettingsPath = () => join(app.getPath("userData"), "receipt-printer.json");
function getSavedPrinter() {
  try {
    const value = JSON.parse(readFileSync(printerSettingsPath(), "utf8")).name;
    return typeof value === "string" ? value : "";
  } catch { return ""; }
}

async function selectReceiptPrinter() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const printers = await appView.webContents.getPrintersAsync();
    if (!printers.length) {
      await dialog.showMessageBox(mainWindow, { type: "warning", title: "Receipt printer",
        message: "No printers found.", detail: "Connect the printer and install its Windows driver, then try again." });
      return;
    }
    const saved = getSavedPrinter();
    const cancel = printers.length;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "question", title: "Select Receipt Printer",
      message: "Choose the receipt printer for this computer.",
      detail: `Current: ${saved || "Windows default"}\nThis choice is saved only on this computer. Set the correct paper size in the printer's Windows preferences.`,
      buttons: [...printers.map((printer) => printer.name.replaceAll("&", "&&")), "Cancel"],
      defaultId: Math.max(0, printers.findIndex((printer) => printer.name === saved)), cancelId: cancel, noLink: true,
    });
    if (response === cancel) return;
    writeFileSync(printerSettingsPath(), JSON.stringify({ name: printers[response].name }), "utf8");
    await dialog.showMessageBox(mainWindow, { type: "info", title: "Receipt printer saved",
      message: `Receipts will print to ${printers[response].name}.`,
      detail: "For the sale already saved, use Reprint Invoice. Do not complete payment again." });
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) await dialog.showMessageBox(mainWindow, {
      type: "error", title: "Printer selection failed", message: error.message,
    });
  }
}

async function loadPos() {
  if (loading || !mainWindow || mainWindow.isDestroyed()) return;
  loading = true;
  try {
    await appView.webContents.loadURL(startUrl);
    if (printSmoke) {
      await appView.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Receipt adapter timed out; bridge=' + Boolean(window.oushadhiDesktop) + '; print=' + frame.contentWindow.print.toString())), 10000);
        const frame = document.createElement('iframe');
        frame.title = 'Thermal receipt print';
        document.body.appendChild(frame);
        frame.contentDocument.open();
        frame.contentDocument.write('<html><body><div class="thermal-receipt">Desktop print verification</div></body></html>');
        frame.contentDocument.close();
        setTimeout(() => {
          frame.contentWindow.onafterprint = () => { clearTimeout(timeout); frame.remove(); resolve(); };
          frame.contentWindow.print();
          frame.contentWindow.print();
        }, 100);
      })`);
      if (smokePrintCount !== 1) throw new Error("Receipt adapter did not submit exactly one job.");
      console.log("Receipt adapter passed: one IPC request, afterprint cleanup, no physical printing.");
    }
    if (smoke) {
      const chromeColor = await mainWindow.webContents.executeJavaScript("getComputedStyle(document.body).backgroundColor");
      if (chromeColor !== "rgb(24, 61, 43)" || appView.getBounds().y !== 40) throw new Error("Desktop title bar layout failed.");
      console.log("Green title bar and reserved content area verified.");
      console.log(`Desktop smoke passed: ${new URL(appView.webContents.getURL()).origin}`);
      app.exit(0);
    }
  } catch (error) {
    if (smoke) {
      console.error("Desktop smoke failed:", error.message);
      app.exit(1);
      return;
    }
    if (!mainWindow.isDestroyed()) await appView.webContents.loadFile(offlinePath);
  } finally {
    loading = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Oushadhi POS",
    icon: fileURLToPath(new URL("./assets/icon.png", import.meta.url)),
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#183d2b",
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#183d2b", symbolColor: "#ffffff", height: 40 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: fileURLToPath(new URL("./chrome-preload.cjs", import.meta.url)),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  appView = new WebContentsView({
    webPreferences: {
      preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });
  mainWindow.contentView.addChildView(appView);
  const resizeContent = () => {
    const [width, height] = mainWindow.getContentSize();
    appView.setBounds({ x: 0, y: 40, width, height: Math.max(1, height - 40) });
  };
  resizeContent();
  mainWindow.on("resize", resizeContent);
  void mainWindow.loadFile(fileURLToPath(new URL("./chrome.html", import.meta.url)));
  mainWindow.once("ready-to-show", () => { if (!smoke) mainWindow.show(); });
  const contents = appView.webContents;
  for (const event of ["will-navigate", "will-redirect"]) {
    contents.on(event, (e, url) => {
      if (!isTrustedUrl(url, startUrl)) e.preventDefault();
    });
  }
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("render-process-gone", () => { void loadPos(); });
  mainWindow.on("closed", () => {
    if (appView && !appView.webContents.isDestroyed()) appView.webContents.close();
    appView = null;
    mainWindow = null;
  });
  void loadPos();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    ipcMain.on("chrome:menu", (event, label) => {
      if (event.sender !== mainWindow?.webContents || !["POS", "Edit", "View"].includes(label)) return;
      appView.webContents.focus();
      Menu.getApplicationMenu()?.items.find((item) => item.label === label)?.submenu?.popup({ window: mainWindow, y: 40 });
    });
    localBackup = new LocalBackup({
      configPath: join(app.getPath("userData"), `desktop-backup-${new URL(startUrl).host.replaceAll(":", "_")}.json`),
      request: (path, options) => session.defaultSession.fetch(new URL(path, startUrl).href, {
        ...options, credentials: "include", redirect: "error", headers: { Origin: new URL(startUrl).origin },
      }),
    });
    await localBackup.load();
    let printQueue = Promise.resolve();
    ipcMain.handle("receipt:print", (event, html) => {
      if (event.sender !== appView?.webContents || event.senderFrame !== event.sender.mainFrame ||
          !isTrustedUrl(event.senderFrame.url, startUrl)) throw new Error("Untrusted print request.");
      if (printSmoke) {
        if (!html.includes("Desktop print verification")) throw new Error("Unexpected test receipt.");
        smokePrintCount += 1;
        return { success: true };
      }
      const task = printQueue.then(() => printReceipt(html, new URL(startUrl).origin, getSavedPrinter()));
      printQueue = task.catch(() => {});
      return task.catch(async (error) => {
        if (mainWindow && !mainWindow.isDestroyed()) await dialog.showMessageBox(mainWindow, {
          type: "error", title: "Receipt could not print",
          message: "Your sale is saved. Do not complete payment again.",
          detail: `${error.message}\nCheck the printer, then use Reprint Invoice in Sales History.`,
        });
        return { success: false };
      });
    });
    app.setAppUserModelId("com.oushadhi.pos");
    session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) =>
      contents === appView?.webContents && permission === "media" &&
      details.mediaType === "video" && isTrustedUrl(origin, startUrl));
    session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
      const cameraOnly = permission === "media" && details.mediaTypes?.length > 0 &&
        details.mediaTypes.every((type) => type === "video");
      if (contents !== appView?.webContents || !cameraOnly ||
          !isTrustedUrl(details.requestingUrl, startUrl)) {
        callback(false);
        return;
      }
      const result = await dialog.showMessageBox(mainWindow, {
        type: "question", title: "Barcode camera", message: "Allow Oushadhi POS to use your camera for barcode scanning?",
        buttons: ["Allow camera", "Cancel"], defaultId: 1, cancelId: 1,
      });
      callback(result.response === 0);
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "POS", submenu: [
        { label: "Home / Reconnect", accelerator: "CmdOrCtrl+R", click: () => { void loadPos(); } },
        { label: "Select Backup Folder...", click: () => { void backupAction(selectBackupFolder); } },
        { label: "Automatic Backup...", click: () => { void backupAction(configureAutomaticBackup); } },
        { label: "Back Up Now", click: () => { void backupAction(async () => {
          const path = await localBackup.run();
          await dialog.showMessageBox(mainWindow, { title: "Backup saved", message: "Encrypted backup saved on this computer.", detail: path });
        }); } },
        { label: "Backup Status", click: () => { void backupAction(showBackupStatus); } },
        { label: "Select Receipt Printer...", click: () => { void selectReceiptPrinter(); } },
        { type: "separator" }, { role: "quit" },
      ] },
      { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { role: "togglefullscreen" }, ...(!app.isPackaged ? [{ role: "toggleDevTools" }] : [])] },
    ]));
    createWindow();
    if (!smoke) {
      setTimeout(() => { void checkBackup(); }, 15000).unref();
      const backupTimer = setInterval(() => { void checkBackup(); }, 60000);
      backupTimer.unref();
      app.on("before-quit", () => clearInterval(backupTimer));
    }
    if (smoke) setTimeout(() => app.exit(1), 45000).unref();
    app.on("activate", () => { if (!mainWindow) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
