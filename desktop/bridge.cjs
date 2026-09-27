const http = require('node:http');
const crypto = require('node:crypto');

const MAX_BODY = 3 * 1024 * 1024;
const ONLINE_MS = 5000;
const COMMAND_MS = 10000;
const text = value => typeof value === 'string' && value.length <= 20000;
const id = value => Number.isSafeInteger(value) && value > 0;

function validSnapshot(value) {
  return value && typeof value === 'object' &&
    (value.documentId === null || id(value.documentId)) &&
    typeof value.name === 'string' && value.name.length <= 256 &&
    typeof value.image === 'string' && value.image.length <= 2_500_000 &&
    (value.image === '' || /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.image)) &&
    Array.isArray(value.layers) && value.layers.length <= 500 &&
    value.layers.every(layer => layer && id(layer.id) && text(layer.name) && layer.name.length <= 256 &&
      text(layer.content) && typeof layer.locked === 'boolean');
}

function createBridge({ now = Date.now, onlineMs = ONLINE_MS, commandMs = COMMAND_MS } = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  const serverSession = crypto.randomUUID();
  let cepSession = null;
  let lastSeen = 0;
  let snapshot = null;
  let pending = null;
  let lastResult = null;
  let revision = 0;
  let snapshotVersion = 0;

  function expire() {
    if (cepSession && now() - lastSeen > onlineMs) {
      if (pending) lastResult = { id: pending.command.id,
        error: pending.delivered ? 'RESULT_UNKNOWN' : 'DISCONNECTED' };
      pending = null;
      cepSession = null;
      snapshot = null;
      revision++;
    } else if (pending && now() > pending.command.expiresAt) {
      lastResult = { id: pending.command.id, error: 'RESULT_UNKNOWN' };
      pending = null;
      revision++;
    }
  }

  function status() {
    expire();
    const online = !!cepSession;
    return { serverSession, session: online ? cepSession : null, online, snapshot: online ? snapshot : null,
      snapshotVersion, pending: pending ? pending.command.id : null, lastResult, revision };
  }

  function submit(request) {
    expire();
    const current = status();
    if (!current.online || !snapshot || request?.session !== cepSession || pending) return { error: 'UNAVAILABLE' };
    if (!id(request.documentId) || !id(request.layerId) || !text(request.baseline) ||
        !text(request.next) || request.next.length > 20000) return { error: 'BAD_COMMAND' };
    const layer = snapshot.layers.find(item => item.id === request.layerId);
    if (snapshot.documentId !== request.documentId || !layer || layer.locked || layer.content !== request.baseline)
      return { error: 'STALE_TARGET' };
    const command = { id: crypto.randomUUID(), session: cepSession, documentId: request.documentId,
      layerId: request.layerId, baseline: request.baseline, next: request.next, expiresAt: now() + commandMs };
    pending = { command, delivered: false };
    lastResult = null;
    revision++;
    return { id: command.id };
  }

  function reply(res, code, body) {
    const bytes = Buffer.from(JSON.stringify(body));
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  }

  const server = http.createServer((req, res) => {
    const address = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) || req.headers.origin || req.headers.referer ||
        req.headers.host !== `127.0.0.1:${server.address().port}` ||
        req.headers['x-bili-token'] !== token || req.method !== 'POST' || !['/sync', '/result'].includes(req.url)) {
      reply(res, 403, { error: 'FORBIDDEN' });
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(chunk);
    });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { reply(res, 400, { error: 'BAD_JSON' }); return; }
      if (!body || typeof body.session !== 'string' || !/^[a-f0-9]{32}$/.test(body.session)) {
        reply(res, 400, { error: 'BAD_SESSION' }); return;
      }
      expire();
      if (req.url === '/sync') {
        if (!validSnapshot(body.snapshot)) { reply(res, 400, { error: 'BAD_SNAPSHOT' }); return; }
        if (cepSession !== body.session) {
          if (pending) lastResult = { id: pending.command.id, error: 'RESULT_UNKNOWN' };
          pending = null;
          cepSession = body.session;
        }
        snapshot = body.snapshot;
        snapshotVersion++;
        lastSeen = now();
        revision++;
        let command = null;
        if (pending && !pending.delivered) {
          command = pending.command;
          pending.delivered = true;
        }
        reply(res, 200, { serverSession, command });
      } else {
        if (body.session !== cepSession || !pending || !pending.delivered || body.id !== pending.command.id ||
            !/^[a-f0-9-]{36}$/.test(body.id) || !body.result || typeof body.result !== 'object' ||
            !(body.result.ok === true || typeof body.result.error === 'string' && body.result.error.length <= 64)) {
          reply(res, 409, { error: 'STALE_RESULT' }); return;
        }
        lastResult = body.result.ok === true ? { id: body.id, ok: true, afterSnapshotVersion: snapshotVersion } :
          { id: body.id, error: body.result.error };
        pending = null;
        lastSeen = now();
        revision++;
        reply(res, 200, { ok: true });
      }
    });
  });
  return { server, status, submit, async start() {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    return `${server.address().port}:${token}`;
  }, close() { return new Promise(resolve => server.close(resolve)); } };
}

module.exports = { createBridge };
