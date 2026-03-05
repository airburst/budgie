const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getTasks: () => ipcRenderer.invoke("tasks:getAll"),
});
