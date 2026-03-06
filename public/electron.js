const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const { setupDatabase, db, schema } = require("./db");
const registerAccountsHandlers = require("./ipc/accounts");
const isDev = !app.isPackaged;

let mainWindow;

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
app.whenReady().then(() => {
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

  setupDatabase();
  // Add IPC handlers for database operations
  ipcMain.handle("tasks:getAll", () => db.select().from(schema.tasks)); // FIXME: remove

  registerAccountsHandlers(ipcMain, db, schema);

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
