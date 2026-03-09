const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULT_BACKUP_FOLDER = path.join(os.homedir(), "Documents", "Budgie");
const RETENTION_DAYS = 30;
const BACKUP_PREFIX = "budgie-";
const BACKUP_EXT = ".db";

function makeBackupPath(folder) {
  // Format: budgie-2026-03-09T10-30-45.db
  const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  return path.join(folder, `${BACKUP_PREFIX}${ts}${BACKUP_EXT}`);
}

function sweepOldBackups(folder, retentionDays) {
  const days = retentionDays ?? RETENTION_DAYS;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let files;
  try {
    files = fs.readdirSync(folder);
  } catch {
    return;
  }
  for (const file of files) {
    if (file.startsWith(BACKUP_PREFIX) && file.endsWith(BACKUP_EXT)) {
      const fullPath = path.join(folder, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // ignore individual file errors
      }
    }
  }
}

async function createBackupDirect(sqlite, folder, retentionDays) {
  try {
    const stat = fs.statSync(folder);
    if (!stat.isDirectory()) {
      throw new Error(
        `Backup folder path already exists as a file: ${folder}`,
      );
    }
    // Directory already exists — nothing to do
  } catch (e) {
    if (e.code === "ENOENT") {
      fs.mkdirSync(folder, { recursive: true });
    } else {
      throw e;
    }
  }
  const destPath = makeBackupPath(folder);
  await sqlite.backup(destPath);
  sweepOldBackups(folder, retentionDays);
  return destPath;
}

module.exports = function registerBackupsHandlers(
  ipcMain,
  _db,
  _schema,
  sqlite,
  dbPath,
  appDialog,
  onBeforeRestore,
) {
  ipcMain.handle("backups:getDefaultFolder", () => DEFAULT_BACKUP_FOLDER);

  ipcMain.handle("backups:create", async (_, folder) => {
    const backupFolder = folder || DEFAULT_BACKUP_FOLDER;
    const destPath = await createBackupDirect(sqlite, backupFolder);
    return { path: destPath };
  });

  ipcMain.handle("backups:list", (_, folder) => {
    const backupFolder = folder || DEFAULT_BACKUP_FOLDER;
    let files;
    try {
      files = fs.readdirSync(backupFolder);
    } catch {
      return [];
    }
    return files
      .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT))
      .map((f) => {
        const fullPath = path.join(backupFolder, f);
        const stat = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  ipcMain.handle("backups:delete", (_, filePath) => {
    fs.unlinkSync(filePath);
  });

  ipcMain.handle("backups:restore", (_, filePath) => {
    const { app } = require("electron");
    // Replace the live DB with the backup, removing auxiliary WAL/SHM files
    fs.copyFileSync(filePath, dbPath);
    try {
      fs.unlinkSync(dbPath + "-wal");
    } catch {
      // no WAL file present
    }
    try {
      fs.unlinkSync(dbPath + "-shm");
    } catch {
      // no SHM file present
    }
    onBeforeRestore();
    app.relaunch();
    app.quit();
  });

  ipcMain.handle("backups:chooseFolder", async () => {
    const result = await appDialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      defaultPath: DEFAULT_BACKUP_FOLDER,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("backups:chooseFile", async (_, folder) => {
    const result = await appDialog.showOpenDialog({
      properties: ["openFile"],
      defaultPath: folder || DEFAULT_BACKUP_FOLDER,
      filters: [{ name: "Budgie Backup", extensions: ["db"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
};

module.exports.createBackupDirect = createBackupDirect;
module.exports.DEFAULT_BACKUP_FOLDER = DEFAULT_BACKUP_FOLDER;
