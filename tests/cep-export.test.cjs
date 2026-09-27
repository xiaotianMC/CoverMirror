const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'plugin-cep', 'host.jsx'), 'utf8');

function mockHost(exportFailure = false) {
  const files = [];
  const original = { id: 11, saved: false, historyStates: [{ name: 'Before' }],
    exportDocument(file, type, options) {
      assert.equal(type, 'save-for-web');
      assert.equal(options.format, 'jpeg');
      file.exists = true;
      if (exportFailure) throw new Error('不支持该模式');
    } };
  function File(name) {
    this.fsName = name;
    this.exists = false;
    this.removed = false;
    this.remove = () => { this.removed = true; this.exists = false; };
    files.push(this);
  }
  const app = { documents: [original], activeDocument: original, displayDialogs: 'normal' };
  const context = vm.createContext({ app, File, Folder: { temp: { fsName: 'C:/Temp' } },
    ExportOptionsSaveForWeb: function () {}, SaveDocumentType: { JPEG: 'jpeg' },
    ExportType: { SAVEFORWEB: 'save-for-web' }, DialogModes: { NO: 'none' } });
  vm.runInContext(source, context);
  return { context, app, original, files };
}

test('截图直接导出活动文档，不切换文档或改变历史/保存状态', () => {
  const { context, app, original, files } = mockHost();
  const beforeHistory = original.historyStates.length;
  const frame = JSON.parse(context.biliCoverFrame());
  assert.equal(frame.documentId, 11);
  assert.match(frame.path, /bili-cover-preview-.*\.jpg$/);
  assert.equal(files.length, 1);
  assert.equal(app.activeDocument, original);
  assert.equal(app.displayDialogs, 'normal');
  assert.equal(original.historyStates.length, beforeHistory);
  assert.equal(original.saved, false);
});

test('导出失败清理部分临时文件并报告原始错误', () => {
  const { context, app, original, files } = mockHost(true);
  const frame = JSON.parse(context.biliCoverFrame());
  assert.match(frame.error, /不支持该模式/);
  assert.equal(files[0].removed, true);
  assert.equal(app.activeDocument, original);
  assert.equal(app.displayDialogs, 'normal');
});
