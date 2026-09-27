const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createBridge } = require('../desktop/bridge.cjs');

function post(port, token, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: 'POST',
      headers: { 'X-Bili-Token': token, 'Content-Type': 'application/json', ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ code: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

test('本机桥接鉴权、一次性交付、结果与断线不重放', async () => {
  let time = 1000;
  const bridge = createBridge({ now: () => time, onlineMs: 5000, commandMs: 10000 });
  const code = await bridge.start();
  const [portText, token] = code.split(':');
  const port = Number(portText);
  const session = 'a'.repeat(32);
  const snapshot = { documentId: 11, name: '临时文档', image: 'data:image/jpeg;base64,YQ==',
    layers: [{ id: 7, name: '标题', content: '原文', locked: false }] };
  try {
    assert.equal((await post(port, 'bad', '/sync', { session, snapshot })).code, 403);
    assert.equal((await post(port, token, '/sync', { session, snapshot }, { Origin: 'http://evil.local' })).code, 403);
    assert.equal((await post(port, token, '/sync', { session, snapshot: { ...snapshot, image: 'data:text/html;base64,YQ==' } })).code, 400);
    assert.equal((await post(port, token, '/sync', { session, snapshot })).code, 200);
    assert.equal(bridge.status().snapshot.documentId, 11);
    assert.equal(bridge.submit({ session, documentId: 11, layerId: 7, baseline: '错的', next: '改字' }).error, 'STALE_TARGET');
    const queued = bridge.submit({ session, documentId: 11, layerId: 7, baseline: '原文', next: '中文“引号”' });
    assert.ok(queued.id);
    assert.equal(bridge.submit({ session, documentId: 11, layerId: 7, baseline: '原文', next: '重复' }).error, 'UNAVAILABLE');
    const delivery = await post(port, token, '/sync', { session, snapshot });
    assert.equal(delivery.body.command.id, queued.id);
    assert.equal(delivery.body.command.expiresAt, 11000);
    assert.equal((await post(port, token, '/sync', { session, snapshot })).body.command, null);
    const result = { session, id: queued.id, result: { ok: true, extra: 'discard' } };
    assert.equal((await post(port, token, '/result', result)).code, 200);
    assert.deepEqual(bridge.status().lastResult, { id: queued.id, ok: true,
      afterSnapshotVersion: bridge.status().snapshotVersion });
    assert.equal((await post(port, token, '/result', result)).code, 409);

    const undelivered = bridge.submit({ session, documentId: 11, layerId: 7, baseline: '原文', next: '未领取' });
    time += 6000;
    assert.equal(bridge.status().online, false);
    assert.deepEqual(bridge.status().lastResult, { id: undelivered.id, error: 'DISCONNECTED' });
    assert.equal((await post(port, token, '/sync', { session, snapshot })).body.command, null);
    const delivered = bridge.submit({ session, documentId: 11, layerId: 7, baseline: '原文', next: '已领取' });
    assert.equal((await post(port, token, '/sync', { session, snapshot })).body.command.id, delivered.id);
    time += 6000;
    assert.deepEqual(bridge.status().lastResult, { id: delivered.id, error: 'RESULT_UNKNOWN' });
    assert.equal((await post(port, token, '/sync', { session, snapshot })).body.command, null);
  } finally { await bridge.close(); }
});
