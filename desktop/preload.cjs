const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('psBridge', {
  status: () => ipcRenderer.invoke('bridge:status'),
  submitText: command => ipcRenderer.invoke('bridge:submit', {
    session: command.session,
    documentId: command.documentId,
    layerId: command.layerId,
    baseline: command.baseline,
    next: command.next
  })
});
