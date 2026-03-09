const { app, BrowserWindow, ipcMain, session, dialog } = require("electron");
const path = require("path");
const { setupDatabase, schema } = require("./db");
const registerAccountsHandlers = require("./ipc/accounts");
const registerCategoriesHandlers = require("./ipc/categories");
const registerTransactionsHandlers = require("./ipc/transactions");
const registerScheduledTransactionsHandlers = require("./ipc/scheduled-transactions");
const { processAutoPost } = require("./ipc/scheduled-transactions");
const registerAccountReconciliationsHandlers = require("./ipc/account-reconciliations");
const registerSettingsHandlers = require("./ipc/settings");
const registerBackupsHandlers = require("./ipc/backups");
const registerPayeesHandlers = require("./ipc/payees");
const { createBackupDirect, DEFAULT_BACKUP_FOLDER } = require("./ipc/backups");
const isDev = !app.isPackaged;

let mainWindow;
let skipAutoBackup = false;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  // Load the index.html from the app or from local dev server in development mode
  mainWindow.loadURL(
    isDev
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../build/index.html")}`,
  );

  // Open the DevTools in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Emitted when the window is closed.
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Create window when Electron is ready
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = isDev
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:* http://localhost:*; font-src 'self' data:;"
      : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  const { db, sqlite, dbPath } = setupDatabase();
  // Add IPC handlers for database operations
  registerAccountsHandlers(ipcMain, db, schema);
  registerCategoriesHandlers(ipcMain, db, schema);
  registerTransactionsHandlers(ipcMain, db, schema);
  registerScheduledTransactionsHandlers(ipcMain, db, schema);
  registerAccountReconciliationsHandlers(ipcMain, db, schema);
  registerSettingsHandlers(ipcMain, db, schema);
  registerBackupsHandlers(ipcMain, db, schema, sqlite, dbPath, dialog, () => {
    skipAutoBackup = true;
  });
  registerPayeesHandlers(ipcMain, db, schema);

  await processAutoPost(db, schema);

  // Auto-backup on quit (skip if triggered by a restore)
  app.on("before-quit", async (event) => {
    if (skipAutoBackup) return;
    event.preventDefault();
    skipAutoBackup = true;
    try {
      let backupFolder = DEFAULT_BACKUP_FOLDER;
      try {
        const row = sqlite
          .prepare("SELECT preferences FROM settings WHERE id = 1")
          .get();
        if (row) {
          const prefs = JSON.parse(row.preferences || "{}");
          if (prefs.backupFolder) backupFolder = prefs.backupFolder;
        }
      } catch {
        // use default folder
      }
      await createBackupDirect(sqlite, backupFolder);
    } catch (e) {
      console.error("Auto-backup failed:", e);
    }
    app.quit();
  });

  createWindow();
});

// Quit when all windows are closed except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// On macOS re-create window when dock icon is clicked
app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
