const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function host() {
  let rawContent = '原文';
  const layer = { id: 7, typename: 'ArtLayer', kind: 'text', allLocked: false,
    positionLocked: false, textItem: {
      get contents() { return rawContent; },
      set contents(value) { rawContent = value.replace(/\n/g, '\r'); }
    }, parent: { typename: 'Document' } };
  const doc = { id: 11, name: '临时文档', layers: [layer], history: [],
    suspendHistory(label, script) { this.history.push(label); vm.runInContext(script, context); } };
  const context = vm.createContext({ app: { documents: [doc], activeDocument: doc },
    LayerKind: { TEXT: 'text' }, decodeURIComponent });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'plugin-cep', 'host.jsx'), 'utf8'), context);
  return { context, doc, layer };
}

test('文字写入校验目标和基线，并只创建一次历史操作', () => {
  const { context, doc, layer } = host();
  const write = (documentId, layerId, baseline, next) => JSON.parse(context.biliCoverWriteText(
    documentId, layerId, encodeURIComponent(baseline), encodeURIComponent(next)));
  assert.equal(write(12, 7, '原文', '错文').error, 'DOCUMENT_CHANGED');
  assert.equal(write(11, 8, '原文', '错文').error, 'LAYER_MISSING');
  assert.equal(write(11, 7, '旧内容', '错文').error, 'CONTENT_CHANGED');
  layer.allLocked = true;
  assert.equal(write(11, 7, '原文', '错文').error, 'LAYER_LOCKED');
  layer.allLocked = false;
  assert.equal(write(11, 7, '原文', '中文“引号”与\'单引号\'、换行\n第二行').ok, true);
  assert.equal(layer.textItem.contents, '中文“引号”与\'单引号\'、换行\r第二行');
  assert.equal(JSON.parse(context.biliCoverTextState()).layers[0].content,
    '中文“引号”与\'单引号\'、换行\n第二行');
  assert.equal(doc.history.length, 1);
  assert.equal(write(11, 7, '原文', '覆盖').error, 'CONTENT_CHANGED');
  assert.equal(write(11, 7, '中文“引号”与\'单引号\'、换行\n第二行', '新行\n内容').ok, true);
  assert.equal(layer.textItem.contents, '新行\r内容');
  assert.equal(JSON.parse(context.biliCoverTextState()).layers[0].content, '新行\n内容');
});
