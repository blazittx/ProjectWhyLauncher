const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', callback),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
    onSpinnerUpdate: (callback) => ipcRenderer.on('spinner-update', callback),
    closeWindow: () => ipcRenderer.send('close-window'),
});
