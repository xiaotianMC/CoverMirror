const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const { createBridge } = require('../desktop/bridge.cjs');

async function until(check) {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('模拟桥接等待超时');
}

test('模拟 CEP 经本机 HTTP 将桌面文字命令写回宿主并发布新快照', async () => {
  const bridge = createBridge();
  const code = await bridge.start();
  const layer = { id: 7, typename: 'ArtLayer', kind: 'text', name: '标题', allLocked: false,
    positionLocked: false, parent: { typename: 'Document' }, textItem: { contents: '原文' } };
  const doc = { id: 11, name: '临时文档', layers: [layer], history: [],
    suspendHistory(label, script) { this.history.push(label); vm.runInContext(script, host); } };
  const host = vm.createContext({ app: { documents: [doc], activeDocument: doc },
    LayerKind: { TEXT: 'text' }, decodeURIComponent });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'plugin-cep', 'host.jsx'), 'utf8'), host);
  function node() {
    return { value: '', textContent: '', disabled: false, children: [],
      addEventListener(type, callback) { this[type] = callback; },
      appendChild(child) { this.children.push(child); } };
  }
  const ids = Object.fromEntries(['status', 'text-status', 'text-layer', 'text-content', 'apply-text',
    'reset-text', 'refresh', 'pair-code', 'pair', 'bridge-status'].map(name => [name, node()]));
  const document = { getElementById: name => ids[name], createElement: type => type === 'canvas'
    ? { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,YQ==' }
    : node() };
  class Image { set src(value) { this.width = 960; this.height = 540; this.onload(); } }
  const window = { CoverPreview: { create: () => ({ setImage() {} }) },
    __adobe_cep__: { evalScript(script, callback) {
      if (script === 'biliCoverFrame()') callback(JSON.stringify({ documentId: doc.id, path: 'image.jpg' }));
      else callback(vm.runInContext(script, host));
    } } };
  let tick;
  try {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'plugin-cep', 'panel.js'), 'utf8'), {
      window, document, cep_node: { require: name => ({
        fs: { readFile: (name, callback) => callback(null, Buffer.from('jpeg')), unlink: (name, callback) => callback() },
        http, crypto, buffer: { Buffer }
      })[name] }, setInterval: fn => { tick = fn; }, setTimeout, clearTimeout,
      Image, encodeURIComponent, JSON, Date, Number
    });
    ids['pair-code'].value = code;
    ids.pair.click();
    await until(() => bridge.status().online);
    const session = bridge.status().session;
    const queued = bridge.submit({ session, documentId: 11, layerId: 7, baseline: '原文', next: '中文“桌面”' });
    assert.ok(queued.id);
    await until(() => {
      tick();
      return bridge.status().lastResult?.id === queued.id &&
        bridge.status().snapshot?.layers[0].content === '中文“桌面”';
    });
    assert.equal(layer.textItem.contents, '中文“桌面”');
    assert.equal(doc.history.length, 1);
    assert.equal(bridge.status().lastResult.ok, true);
    await until(() => {
      tick();
      return bridge.status().snapshotVersion >= 3;
    });
    assert.equal(doc.history.length, 1);
  } finally { await bridge.close(); }
});
