const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getTasks: () => ipcRenderer.invoke("tasks:getAll"),

  getAccounts: () => ipcRenderer.invoke("accounts:getAll"),
  getAccount:  (id) => ipcRenderer.invoke("accounts:getById", id),
  createAccount: (data) => ipcRenderer.invoke("accounts:create", data),
  updateAccount: (id, data) => ipcRenderer.invoke("accounts:update", id, data),
  deleteAccount: (id) => ipcRenderer.invoke("accounts:delete", id),
});
