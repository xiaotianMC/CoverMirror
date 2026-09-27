const { app, imaging } = require('photoshop');
const preview = window.CoverPreview.create(document);
const status = document.getElementById('status');
let reading = false;
let pending = false;

async function refresh() {
  if (reading) {
    pending = true;
    return;
  }
  reading = true;
  try {
    if (!app.documents.length) {
      preview.setImage('');
      status.textContent = '没有打开的 Photoshop 文档。';
      return;
    }
    const activeDocument = app.activeDocument;
    const documentId = activeDocument.id;
    const pixels = await imaging.getPixels({
      documentID: documentId,
      targetSize: { width: 480 },
      colorSpace: 'RGB',
      colorProfile: 'sRGB IEC61966-2.1',
      componentSize: 8,
      applyAlpha: true
    });
    try {
      const encoded = await imaging.encodeImageData({ imageData: pixels.imageData, base64: true });
      if (app.activeDocument && app.activeDocument.id === documentId) {
        preview.setImage('data:image/jpeg;base64,' + encoded);
        status.textContent = `正在预览：${activeDocument.name}`;
      }
    } finally {
      pixels.imageData.dispose();
    }
  } catch (error) {
    status.textContent = `预览读取失败：${error.message || error}`;
  } finally {
    reading = false;
    if (pending) {
      pending = false;
      refresh();
    }
  }
}

document.getElementById('refresh').addEventListener('click', refresh);
refresh();
// ponytail: 定时取 480px 缩略图覆盖所有编辑方式；若实测影响绘制流畅度，再改为事件触发。
setInterval(refresh, 1000);
