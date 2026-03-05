# Project Architecure

## Database Access

In 2026, the best practice for building an Electron app with a local SQLite database follows a "Main-as-Server" architecture. Because the Renderer process (your UI) is essentially a browser, it should never have direct access to the database for security and performance reasons.

## 1. Recommended Architecture: The Three-Layer Bridge

To keep your app secure and performant, you must separate your concerns into three distinct layers:

Main Process (The Controller): This is where your Node.js code lives. It owns the SQLite connection and executes all SQL queries.
+1

Preload Script (The Gatekeeper): A secure bridge that exposes a limited, safe API to the UI using contextBridge.

Renderer Process (The UI): Your React, Svelte, or SolidJS frontend. It "asks" the Main process for data via IPC (Inter-Process Communication) and receives a Promise in return.

## 2. Choosing Your SQLite Driver

Use better-sqlite3

## 3. Implementation Blueprint

Step A: The Main Process (main.js)
Initialize the database in the Main process and set up an ipcMain.handle listener.

```js
const { app, ipcMain } = require("electron");
const Database = require("better-sqlite3");
const path = require("path");

// Store DB in the user's local app data folder
const dbPath = path.join(app.getPath("userData"), "app.db");
const db = new Database(dbPath);

// Create a table if it doesn't exist
db.prepare(
  "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)",
).run();

// Handle requests from the UI
ipcMain.handle("get-users", async () => {
  return db.prepare("SELECT * FROM users").all();
});
```

Step B: The Preload Script (preload.js)
Expose only the necessary function to the window object. Do not expose the entire ipcRenderer for security.

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getUsers: () => ipcRenderer.invoke("get-users"),
});
```

Step C: The Renderer (Your Frontend)
Call the API as if it were a standard web service.

```js
// In your React/Svelte component
const users = await window.api.getUsers();
console.log(users);
```

## 4. Pro Tips for 2026

WAL Mode: Always enable Write-Ahead Logging (db.pragma('journal_mode = WAL')) to allow multiple readers and one writer simultaneously without locking the UI.

Externalize Native Modules: If using Vite or Webpack, ensure better-sqlite3 is marked as an "external" dependency, as it contains native C++ binaries that cannot be bundled into a single JS file.

Security: Never pass raw SQL strings from the Renderer to the Main process. This prevents "SQL Injection" within your own desktop app. Always use Prepared Statements in the Main process.
