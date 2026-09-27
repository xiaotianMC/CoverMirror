const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const flush = () => new Promise(resolve => setImmediate(resolve));

test('桌面编辑等待新帧确认，期间保留后续输入且不重复提交', async () => {
  function node() {
    return { value: '', textContent: '', disabled: false, children: [],
      addEventListener(type, handler) { this[type] = handler; },
      appendChild(child) { this.children.push(child); } };
  }
  const ids = Object.fromEntries(['file', 'source', 'status', 'connection', 'pair-code',
    'text-layer', 'text-content', 'text-status', 'apply-text', 'reset-text'].map(id => [id, node()]));
  ids.source.value = 'local';
  const document = { getElementById: id => ids[id], createElement: node,
    addEventListener() {} };
  const snapshot = content => ({ documentId: 11, name: '临时文档', image: 'data:image/jpeg;base64,YQ==',
    layers: [{ id: 7, name: '标题', content, locked: false }] });
  let response = { pairCode: '123:secret', online: true, session: 'session',
    snapshot: snapshot('原文'), snapshotVersion: 1, lastResult: null };
  let tick;
  let resolveSubmit;
  let submitCount = 0;
  const window = { CoverPreview: { create: () => ({ setImage() {} }) },
    psBridge: { status: async () => response, submitText: () => {
      submitCount++;
      return new Promise(resolve => { resolveSubmit = resolve; });
    } }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'desktop', 'renderer.js'), 'utf8'),
    { window, document, URL: { createObjectURL() {}, revokeObjectURL() {} },
      setInterval: fn => { tick = fn; } });
  await flush();
  ids.source.value = 'ps';
  ids.source.change();
  const content = ids['text-content'];
  content.value = '新文字';
  content.input();
  const first = ids['apply-text'].click();
  ids['apply-text'].click();
  assert.equal(submitCount, 1);
  resolveSubmit({ id: 'command-1' });
  await first;
  response = { ...response, lastResult: { id: 'command-1', ok: true, afterSnapshotVersion: 1 } };
  tick();
  await flush();
  assert.equal(content.value, '新文字');
  assert.equal(ids['apply-text'].disabled, true);
  content.value = '后续输入';
  content.input();
  response = { ...response, snapshot: snapshot('新文字'), snapshotVersion: 2 };
  tick();
  await flush();
  assert.equal(content.value, '后续输入');
  assert.equal(ids['apply-text'].disabled, false);
});
