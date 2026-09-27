const preview = window.CoverPreview.create(document);
const fileInput = document.getElementById('file');
const source = document.getElementById('source');
const status = document.getElementById('status');
const connection = document.getElementById('connection');
const pairCode = document.getElementById('pair-code');
const layerSelect = document.getElementById('text-layer');
const content = document.getElementById('text-content');
const applyButton = document.getElementById('apply-text');
const textStatus = document.getElementById('text-status');
let currentUrl;
let snapshot = null;
let session = null;
let selected = null;
let dirty = false;
let submitted = null;
let submitting = false;
let message = '';
let polling = false;

function showFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    status.textContent = '请选择图片文件。';
    return;
  }
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(file);
  source.value = 'local';
  renderImage();
  status.textContent = `当前图片：${file.name}`;
}

function currentLayer() {
  return selected && selected.session === session && snapshot &&
    selected.documentId === snapshot.documentId &&
    snapshot.layers.find(layer => layer.id === selected.layerId);
}

function renderImage() {
  if (source.value === 'local') preview.setImage(currentUrl || '');
  else preview.setImage(snapshot ? snapshot.image : '');
}

function renderEditor() {
  const layer = currentLayer();
  const conflict = selected && (!layer || layer.content !== selected.baseline);
  applyButton.disabled = source.value !== 'ps' || !dirty || !layer || layer.locked || conflict || submitting || !!submitted;
  content.disabled = !selected;
  if (message) textStatus.textContent = message;
  else if (submitted) textStatus.textContent = '正在等待 Photoshop 应用文字…';
  else if (conflict) textStatus.textContent = '文档或图层内容已变化，请重新读取。';
  else if (layer && layer.locked) textStatus.textContent = '图层已锁定。';
  else if (selected) textStatus.textContent = dirty ? '有未提交的修改。' : '可编辑文字内容。';
  else textStatus.textContent = '当前没有可编辑的文字图层。';
}

function chooseLayer(id) {
  const layer = snapshot && snapshot.layers.find(item => String(item.id) === String(id));
  selected = layer ? { session, documentId: snapshot.documentId, layerId: layer.id, baseline: layer.content } : null;
  content.value = layer ? layer.content : '';
  dirty = false;
  message = '';
  renderEditor();
}

function showSnapshot(next, nextSession) {
  const previousId = selected && selected.session === nextSession && next &&
    selected.documentId === next.documentId ? selected.layerId : null;
  snapshot = next;
  session = nextSession;
  layerSelect.textContent = '';
  for (const layer of next?.layers || []) {
    const option = document.createElement('option');
    option.value = String(layer.id);
    option.textContent = layer.name + (layer.locked ? '（已锁定）' : '');
    layerSelect.appendChild(option);
  }
  if (dirty && selected && !currentLayer()) {
    const option = document.createElement('option');
    option.value = String(selected.layerId);
    option.textContent = '原图层已不可用';
    layerSelect.appendChild(option);
  }
  layerSelect.disabled = !next?.layers.length;
  if (dirty && selected) layerSelect.value = String(selected.layerId);
  else if (previousId && next.layers.some(layer => layer.id === previousId)) layerSelect.value = String(previousId);
  else if (next?.layers.length) layerSelect.value = String(next.layers[0].id);
  if (!dirty) chooseLayer(layerSelect.value);
  else renderEditor();
  renderImage();
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const next = await window.psBridge.status();
    pairCode.textContent = next.pairCode;
    connection.textContent = next.online ? 'Photoshop 已连接' : 'Photoshop 未连接；打开 CEP 面板并填入配对码。';
    if (submitted && next.lastResult?.id === submitted.id) {
      if (next.lastResult.ok && next.snapshotVersion > next.lastResult.afterSnapshotVersion) {
        const layer = next.snapshot?.documentId === submitted.target.documentId &&
          next.session === submitted.target.session &&
          next.snapshot.layers.find(item => item.id === submitted.target.layerId);
        if (layer?.content === submitted.next) {
          if (selected === submitted.target) {
            selected.baseline = submitted.next;
            dirty = content.value !== submitted.next;
          }
          message = '';
        } else message = 'Photoshop 内容已变化，请重新读取；输入已保留。';
        submitted = null;
      } else if (next.lastResult.error) {
        message = next.lastResult.error === 'RESULT_UNKNOWN'
          ? '结果无法确认；请重新读取 Photoshop 状态，不会自动重试。'
          : 'Photoshop 未应用文字：' + next.lastResult.error;
        submitted = null;
      }
    }
    showSnapshot(next.snapshot, next.session);
    if (source.value === 'ps') status.textContent = next.online && next.snapshot
      ? 'Photoshop 当前文档：' + (next.snapshot.name || '未命名文档')
      : 'Photoshop 未连接，预览等待新快照。';
  } catch (error) { connection.textContent = '桌面桥接读取失败：' + error.message; }
  finally { polling = false; }
}

async function applyText() {
  const layer = currentLayer();
  if (source.value !== 'ps' || !dirty || !layer || layer.locked ||
      layer.content !== selected.baseline || submitted || submitting) return;
  const target = selected;
  const next = content.value;
  submitting = true;
  renderEditor();
  try {
    const result = await window.psBridge.submitText({ session: target.session,
      documentId: target.documentId, layerId: target.layerId, baseline: target.baseline, next });
    if (result.error) message = '无法提交文字：' + result.error;
    else submitted = { id: result.id, target, next };
  } catch (error) { message = '桥接写入失败：' + error.message; }
  finally { submitting = false; renderEditor(); }
}

fileInput.addEventListener('change', () => showFile(fileInput.files[0]));
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => {
  event.preventDefault();
  showFile(event.dataTransfer.files[0]);
});
source.addEventListener('change', () => {
  renderImage();
  renderEditor();
  if (source.value === 'local') status.textContent = currentUrl ? '正在预览本地图片。' : '选择或拖入图片。';
  else status.textContent = snapshot ? 'Photoshop 当前文档：' + snapshot.name : '等待 Photoshop 新快照。';
});
layerSelect.addEventListener('change', () => chooseLayer(layerSelect.value));
content.addEventListener('input', () => {
  dirty = !!selected && content.value !== selected.baseline;
  message = '';
  renderEditor();
});
applyButton.addEventListener('click', applyText);
document.getElementById('reset-text').addEventListener('click', () => chooseLayer(layerSelect.value));
window.addEventListener('beforeunload', () => { if (currentUrl) URL.revokeObjectURL(currentUrl); });
poll();
setInterval(poll, 1000);
