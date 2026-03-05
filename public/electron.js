const { app, BrowserWindow } = require("electron");
const path = require("path");
const { setupDatabase } = require("./db");
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true, // for electron-settings
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
  setupDatabase();
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
