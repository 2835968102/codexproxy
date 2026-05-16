const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("codexProxyDesktop", {
  getState: () => ipcRenderer.invoke("desktop:getState"),
  saveConfig: (config) => ipcRenderer.invoke("desktop:saveConfig", config),
  startBridge: () => ipcRenderer.invoke("desktop:startBridge"),
  stopBridge: () => ipcRenderer.invoke("desktop:stopBridge"),
  openConfigFolder: () => ipcRenderer.invoke("desktop:openConfigFolder"),
  onState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("desktop:state", handler);
    return () => ipcRenderer.removeListener("desktop:state", handler);
  }
});
