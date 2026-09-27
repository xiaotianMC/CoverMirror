(function () {
  const preview = window.CoverPreview.create(document);
  const status = document.getElementById('status');
  const textStatus = document.getElementById('text-status');
  const layerSelect = document.getElementById('text-layer');
  const content = document.getElementById('text-content');
  const applyButton = document.getElementById('apply-text');
  const resetButton = document.getElementById('reset-text');
  const pairCode = document.getElementById('pair-code');
  const pairButton = document.getElementById('pair');
  const bridgeStatus = document.getElementById('bridge-status');
  const fs = cep_node.require('fs');
  const http = cep_node.require('http');
  const crypto = cep_node.require('crypto');
  const Buffer = cep_node.require('buffer').Buffer;
  let busy = false;
  let pendingApply = false;
  let state = { documentId: null, layers: [] };
  let selected = null;
  let dirty = false;
  let writeError = '';
  let readError = '';
  let bridge = null;
  let bridgeSession = crypto.randomBytes(16).toString('hex');

  const errors = {
    DOCUMENT_CHANGED: '活动文档已切换，请重新选择图层。',
    LAYER_MISSING: '文字图层已删除，请重新选择。',
    NOT_TEXT: '该图层已不是文字图层。',
    LAYER_LOCKED: '文字图层或所在组已锁定。',
    CONTENT_CHANGED: '文字已在 Photoshop 中修改，请重新选择图层读取新内容。',
    BAD_TARGET: '图层目标无效。',
    WRITE_FAILED: '写入失败，请在 Photoshop 中检查文档状态。'
  };

  function call(script, callback) {
    window.__adobe_cep__.evalScript(script, callback);
  }

  function readJson(result) {
    if (!result || result === 'EvalScript error.') throw new Error('Photoshop 脚本调用失败');
    return JSON.parse(result);
  }

  function currentLayer() {
    return selected && state.documentId === selected.documentId &&
      state.layers.find(layer => layer.id === selected.layerId);
  }

  function renderEditor() {
    pairButton.disabled = busy;
    const layer = currentLayer();
    const conflict = selected && (!layer || layer.content !== selected.baseline);
    applyButton.disabled = busy || !!readError || !dirty || !layer || layer.locked || conflict;
    content.disabled = !selected;
    if (readError) textStatus.textContent = readError;
    else if (writeError) textStatus.textContent = writeError;
    else if (conflict) textStatus.textContent = !layer ? '文档或图层已切换，请重新选择图层。' : errors.CONTENT_CHANGED;
    else if (layer && layer.locked) textStatus.textContent = errors.LAYER_LOCKED;
    else if (selected) textStatus.textContent = dirty ? '有未提交的修改。' : '可编辑文字内容，点击应用写回 PSD。';
    else textStatus.textContent = state.documentId === null ? '没有打开的 Photoshop 文档。' : '当前文档没有文字图层。';
  }

  function chooseLayer(id) {
    const layer = state.layers.find(item => String(item.id) === String(id));
    selected = layer ? { documentId: state.documentId, layerId: layer.id, baseline: layer.content } : null;
    content.value = layer ? layer.content : '';
    dirty = false;
    writeError = '';
    renderEditor();
  }

  function showState(next) {
    if (next.error) throw new Error(next.message || next.error);
    state = next;
    const previousId = selected && selected.documentId === state.documentId ? selected.layerId : null;
    layerSelect.textContent = '';
    for (const layer of state.layers) {
      const option = document.createElement('option');
      option.value = String(layer.id);
      option.textContent = layer.name + (layer.locked ? '（已锁定）' : '');
      layerSelect.appendChild(option);
    }
    if (dirty && selected && !state.layers.some(layer => layer.id === selected.layerId && state.documentId === selected.documentId)) {
      const option = document.createElement('option');
      option.value = String(selected.layerId);
      option.textContent = '原图层已不可用';
      layerSelect.appendChild(option);
    }
    layerSelect.disabled = !state.layers.length;
    if (dirty && selected) layerSelect.value = String(selected.layerId);
    else if (previousId && state.layers.some(layer => layer.id === previousId)) layerSelect.value = String(previousId);
    else if (state.layers.length) layerSelect.value = String(state.layers[0].id);
    if (!dirty) chooseLayer(layerSelect.value);
    else renderEditor();
  }

  function finish() {
    busy = false;
    renderEditor();
    if (pendingApply) {
      pendingApply = false;
      applyText();
    }
  }

  function requestBridge(path, payload, callback) {
    const connection = bridge;
    const body = JSON.stringify(payload);
    let settled = false;
    function complete(error, data) {
      if (settled) return;
      settled = true;
      callback(error, data);
    }
    const req = http.request({ hostname: '127.0.0.1', port: connection.port, path, method: 'POST',
      headers: { Host: '127.0.0.1:' + connection.port, 'X-Bili-Token': connection.token,
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, response => {
      let result = '';
      response.on('data', chunk => { result += chunk; });
      response.on('end', () => {
        try {
          const data = JSON.parse(result);
          if (response.statusCode !== 200) throw new Error(data.error || 'HTTP ' + response.statusCode);
          complete(null, data);
        } catch (error) { complete(error); }
      });
    });
    req.setTimeout(4000, () => req.destroy(new Error('连接超时')));
    req.on('error', complete);
    req.end(body);
  }

  function publish(frame, done) {
    if (!bridge) { done(); return; }
    const session = bridgeSession;
    requestBridge('/sync', { session, snapshot: frame }, function (error, data) {
      if (error) {
        bridgeSession = crypto.randomBytes(16).toString('hex');
        bridgeStatus.textContent = '桌面连接中断：' + error.message + '；正在重试。';
        done();
        return;
      }
      bridgeStatus.textContent = '桌面应用已连接。';
      const command = data.command;
      if (!command) { done(); return; }
      if (command.session !== session || Date.now() > command.expiresAt ||
          !Number.isSafeInteger(command.documentId) || !Number.isSafeInteger(command.layerId) ||
          typeof command.baseline !== 'string' || typeof command.next !== 'string') {
        requestBridge('/result', { session, id: command.id, result: { error: 'EXPIRED' } }, done);
        return;
      }
      const script = 'biliCoverWriteText(' + command.documentId + ',' + command.layerId + ',"' +
        encodeURIComponent(command.baseline) + '","' + encodeURIComponent(command.next) + '",' +
        command.expiresAt + ')';
      call(script, function (result) {
        let response;
        try { response = readJson(result); }
        catch (error) { response = { error: 'WRITE_FAILED' }; }
        requestBridge('/result', { session, id: command.id, result: response }, function (replyError) {
          if (replyError) {
            bridgeSession = crypto.randomBytes(16).toString('hex');
            bridgeStatus.textContent = '写入结果未送达桌面；请重新读取状态。';
          }
          done();
          refresh();
        });
      });
    });
  }

  function reducePreview(bytes, callback) {
    if (bytes.length > 30 * 1024 * 1024) {
      callback(new Error('导出的 JPEG 过大，无法生成面板预览'));
      return;
    }
    const image = new Image();
    let settled = false;
    const timer = setTimeout(() => complete(new Error('JPEG 解码超时')), 10000);
    function complete(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      callback(error, result);
    }
    image.onerror = () => complete(new Error('JPEG 解码失败'));
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) throw new Error('JPEG 尺寸无效');
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 480 / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        const result = canvas.toDataURL('image/jpeg', 0.8);
        if (result.length > 2500000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(result))
          throw new Error('缩略图编码失败或超过桥接大小限制');
        complete(null, result);
      } catch (error) { complete(error); }
    };
    image.src = 'data:image/jpeg;base64,' + bytes.toString('base64');
  }

  function refresh() {
    if (busy) return;
    busy = true;
    renderEditor();
    call('biliCoverTextState()', function (result) {
      let next;
      try { next = readJson(result); }
      catch (error) { readError = '文字图层读取失败：' + error.message; finish(); return; }
      call('biliCoverFrame()', function (frameResult) {
        let frame;
        try { frame = readJson(frameResult); }
        catch (error) { status.textContent = '预览读取失败：' + error.message; finish(); return; }
        if (next.error || frame.error || next.documentId !== frame.documentId) {
          if (frame.path) fs.unlink(frame.path, function () {});
          status.textContent = frame.error ? '预览导出失败：' + frame.error :
            next.error ? '文字图层读取失败：' + (next.message || next.error) :
              '文档在读取期间变化，等待下次刷新。';
          finish();
          return;
        }
        showState(next);
        readError = '';
        if (frame.documentId === null) {
          preview.setImage('');
          status.textContent = '没有打开的 Photoshop 文档。';
          publish({ documentId: null, name: '', layers: [], image: '' }, finish);
          return;
        }
        fs.readFile(frame.path, function (error, bytes) {
          fs.unlink(frame.path, function () {});
          if (error) {
            status.textContent = '无法读取临时缩略图：' + error.message;
            finish();
            return;
          }
          reducePreview(bytes, function (decodeError, image) {
            if (decodeError) {
              status.textContent = '预览处理失败：' + decodeError.message;
              finish();
              return;
            }
            preview.setImage(image);
            status.textContent = '正在预览 Photoshop 当前文档';
            publish({ documentId: next.documentId, name: next.name, layers: next.layers, image }, finish);
          });
        });
      });
    });
  }

  function applyText() {
    if (busy) { pendingApply = true; return; }
    const layer = currentLayer();
    if (readError || !dirty || !layer || layer.locked || layer.content !== selected.baseline) {
      renderEditor();
      return;
    }
    const target = selected;
    busy = true;
    renderEditor();
    const next = content.value;
    const script = 'biliCoverWriteText(' + target.documentId + ',' + target.layerId + ',"' +
      encodeURIComponent(target.baseline) + '","' + encodeURIComponent(next) + '")';
    call(script, function (result) {
      if (selected === target) {
        try {
          const response = readJson(result);
          if (response.error) writeError = errors[response.error] || response.message || response.error;
          else {
            target.baseline = next;
            dirty = content.value !== next;
            writeError = '';
          }
        } catch (error) { writeError = '写入失败：' + error.message; }
      }
      busy = false;
      refresh();
    });
  }

  layerSelect.addEventListener('change', function () { chooseLayer(layerSelect.value); });
  content.addEventListener('input', function () {
    dirty = !!selected && content.value !== selected.baseline;
    writeError = '';
    renderEditor();
  });
  applyButton.addEventListener('click', applyText);
  resetButton.addEventListener('click', function () {
    chooseLayer(layerSelect.value);
    if (busy) setTimeout(refresh, 200);
    else refresh();
  });
  document.getElementById('refresh').addEventListener('click', refresh);
  pairButton.addEventListener('click', function () {
    if (busy) return;
    const match = /^(\d{1,5}):([a-f0-9]{48})$/.exec(pairCode.value.trim());
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535) {
      bridgeStatus.textContent = '配对码格式无效。';
      return;
    }
    bridge = { port: Number(match[1]), token: match[2] };
    bridgeSession = crypto.randomBytes(16).toString('hex');
    bridgeStatus.textContent = '正在连接桌面应用…';
    refresh();
  });
  refresh();
  // ponytail: PS 2021 没有 Imaging API；先按固定间隔取缩略图，实测卡顿再接入事件通知。
  setInterval(refresh, 1500);
})();
