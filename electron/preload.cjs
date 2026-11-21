const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  customTitleBar: true,
  windowControl: (action) => ipcRenderer.send('win:control', action),
  onWindowState: (cb) => {
    const fn = (_e, s) => cb(s);
    ipcRenderer.on('win:state', fn);
    return () => ipcRenderer.removeListener('win:state', fn);
  },
  saveFile: (name, content) => ipcRenderer.invoke('save-file', { name, content }),
  openFile: (exts) => ipcRenderer.invoke('open-file', { exts }),
  fetchJson: (url) => ipcRenderer.invoke('fetch-json', url),
  getUpdate: () => ipcRenderer.invoke('update:get'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onUpdate: (cb) => {
    const fn = (_e, s) => cb(s);
    ipcRenderer.on('update:state', fn);
    return () => ipcRenderer.removeListener('update:state', fn);
  },
});
