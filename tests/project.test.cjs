const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

test('共用预览在两张卡片中同步图片和字段', () => {
  const inputs = Object.fromEntries(['title', 'author', 'duration'].map(name => [name, {
    value: name,
    addEventListener(type, callback) { this.onInput = callback; }
  }]));
  const groups = Object.fromEntries(['.cover-image', '.empty', '.card-title', '.card-author', '.duration']
    .map(selector => [selector, Array.from({ length: 2 }, () => ({ style: {}, textContent: '', src: '' }))]));
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'shared', 'preview.js'), 'utf8'), context);
  const preview = context.window.CoverPreview.create({
    querySelectorAll: selector => groups[selector],
    getElementById: name => inputs[name]
  });

  preview.setImage('cover.jpg');
  assert.deepEqual(groups['.cover-image'].map(node => node.src), ['cover.jpg', 'cover.jpg']);
  assert.ok(groups['.empty'].every(node => node.style.display === 'none'));
  inputs.title.value = '新标题';
  inputs.title.onInput();
  assert.deepEqual(groups['.card-title'].map(node => node.textContent), ['新标题', '新标题']);
});
