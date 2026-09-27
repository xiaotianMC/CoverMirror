const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createBridge } = require('./bridge.cjs');

let bridge;
let window;
let pairCode;
const indexPath = path.join(__dirname, 'index.html');

function trusted(event) {
  return event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === pathToFileURL(indexPath).href;
}

app.whenReady().then(async () => {
  bridge = createBridge();
  pairCode = await bridge.start();
  window = new BrowserWindow({
    width: 1050,
    height: 800,
    minWidth: 650,
    minHeight: 550,
    backgroundColor: '#f5f6f8',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true }
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ipcMain.handle('bridge:status', event => {
    if (!trusted(event)) throw new Error('Forbidden');
    return { ...bridge.status(), pairCode };
  });
  ipcMain.handle('bridge:submit', (event, command) => {
    if (!trusted(event)) throw new Error('Forbidden');
    return bridge.submit(command);
  });
  await window.loadFile(indexPath);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) window.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => { if (bridge) bridge.server.close(); });
