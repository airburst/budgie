const fs = require("fs");

module.exports = function registerImportHandlers(ipcMain, appDialog) {
  ipcMain.handle("import:chooseQifFile", async () => {
    const result = await appDialog.showOpenDialog({
      title: "Import QIF File",
      properties: ["openFile"],
      filters: [{ name: "QIF File", extensions: ["qif"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("import:readQifFile", (_, filePath) => {
    return fs.readFileSync(filePath, "utf-8");
  });
};
