const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('CEP 面板保留未提交输入并安全编码写入参数', () => {
  function node() {
    return { value: '', textContent: '', disabled: false, children: [],
      addEventListener(type, handler) { this[type] = handler; },
      appendChild(child) { this.children.push(child); } };
  }
  const ids = Object.fromEntries(['status', 'text-status', 'text-layer', 'text-content',
    'apply-text', 'reset-text', 'refresh', 'pair-code', 'pair', 'bridge-status'].map(id => [id, node()]));
  const canvasSizes = [];
  let encodedImage = 'data:image/jpeg;base64,YQ==';
  let decodeFails = false;
  const document = { hidden: false, getElementById: id => ids[id], createElement: type => type === 'canvas'
    ? { getContext: () => ({ drawImage() {} }), toDataURL() {
      canvasSizes.push([this.width, this.height]);
      return encodedImage;
    } }
    : node() };
  class Image { set src(value) {
    if (decodeFails) this.onerror();
    else { this.width = 960; this.height = 540; this.onload(); }
  } }
  let state = { documentId: 11, layers: [{ id: 7, name: '标题', content: '原文', locked: false }] };
  let writeScript = '';
  let deferWrite = false;
  let pendingWrite = null;
  let frameDocumentId = null;
  let unlinked = 0;
  const images = [];
  const window = { CoverPreview: { create: () => ({ setImage(image) { images.push(image); } }) },
    __adobe_cep__: { evalScript(script, callback) {
      if (script === 'biliCoverTextState()') callback(JSON.stringify(state));
      else if (script === 'biliCoverFrame()') callback(JSON.stringify({
        documentId: frameDocumentId === null ? state.documentId : frameDocumentId, path: 'image.jpg' }));
      else {
        writeScript = script;
        if (deferWrite) pendingWrite = callback;
        else {
          state.layers[0].content = ids['text-content'].value;
          callback('{"ok":true}');
        }
      }
    } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'plugin-cep', 'panel.js'), 'utf8'),
    { window, document, cep_node: { require: name => ({
      fs: { readFile: (name, callback) => callback(null, Buffer.from('image')),
        unlink: (name, callback) => { unlinked++; callback(); } },
      http: {}, crypto: { randomBytes: () => Buffer.alloc(16) }, buffer: { Buffer }
    })[name] }, setInterval() {}, setTimeout, clearTimeout, Image, encodeURIComponent, JSON });
  const content = ids['text-content'];
  assert.equal(content.value, '原文');
  content.value = '中文“引号”与"双引号"';
  content.input();
  ids.refresh.click();
  assert.equal(content.value, '中文“引号”与"双引号"');
  assert.equal(ids['apply-text'].disabled, false);
  assert.deepEqual(canvasSizes[0], [480, 270]);
  decodeFails = true;
  const beforeFailedImage = images.length;
  const beforeFailedUnlink = unlinked;
  ids.refresh.click();
  assert.equal(images.length, beforeFailedImage);
  assert.equal(unlinked, beforeFailedUnlink + 1);
  assert.match(ids.status.textContent, /JPEG 解码失败/);
  assert.equal(ids.pair.disabled, false);
  decodeFails = false;
  encodedImage = 'data:,';
  ids.refresh.click();
  assert.match(ids.status.textContent, /缩略图编码失败/);
  encodedImage = 'data:image/jpeg;base64,YQ==';
  frameDocumentId = 12;
  const previousImages = images.length;
  const previousUnlink = unlinked;
  ids.refresh.click();
  assert.equal(images.length, previousImages);
  assert.equal(unlinked, previousUnlink + 1);
  frameDocumentId = null;
  state = { documentId: 12, layers: [{ id: 7, name: '别的文档', content: '原文', locked: false }] };
  ids.refresh.click();
  assert.equal(content.value, '中文“引号”与"双引号"');
  assert.equal(ids['apply-text'].disabled, true);
  state.documentId = 11;
  ids.refresh.click();
  ids['apply-text'].click();
  assert.equal(writeScript, 'biliCoverWriteText(11,7,"%E5%8E%9F%E6%96%87","' +
    encodeURIComponent('中文“引号”与"双引号"') + '")');

  state.layers.push({ id: 8, name: '第二层', content: '二层原文', locked: false });
  ids.refresh.click();
  content.value = '异步提交';
  content.input();
  deferWrite = true;
  ids['apply-text'].click();
  ids['text-layer'].value = '8';
  ids['text-layer'].change();
  pendingWrite('{"ok":true}');
  assert.equal(content.value, '二层原文');
  assert.equal(ids['apply-text'].disabled, true);
  content.value = '二层更新';
  content.input();
  assert.equal(ids['apply-text'].disabled, false);
});
