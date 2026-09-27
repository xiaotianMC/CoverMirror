function biliCoverSnapshot() {
    if (app.documents.length === 0) return 'NO_DOCUMENT';
    var source = app.activeDocument;
    var oldDialogs = app.displayDialogs;
    var output = new File(Folder.temp.fsName + '/bili-cover-preview-' +
        new Date().getTime() + '-' + Math.floor(Math.random() * 1000000) + '.jpg');
    try {
        app.displayDialogs = DialogModes.NO;
        var options = new ExportOptionsSaveForWeb();
        options.format = SaveDocumentType.JPEG;
        options.quality = 80;
        options.optimized = true;
        options.includeProfile = false;
        source.exportDocument(output, ExportType.SAVEFORWEB, options);
        if (!output.exists) throw new Error('JPEG 未生成');
        return output.fsName;
    } catch (error) {
        if (output.exists) output.remove();
        return 'ERROR:' + error.message;
    } finally {
        app.displayDialogs = oldDialogs;
    }
}

function biliCoverFrame() {
    if (app.documents.length === 0) return biliCoverJson({ documentId: null, path: '' });
    var documentId = app.activeDocument.id;
    var path = biliCoverSnapshot();
    if (path.indexOf('ERROR:') === 0) return biliCoverJson({ error: path });
    return biliCoverJson({ documentId: documentId, path: path });
}

// ExtendScript in Photoshop 2021 has no JSON global.
function biliCoverJson(value) {
    if (value === null) return 'null';
    if (typeof value === 'string') return '"' + value.replace(/["\\\u0000-\u001f]/g, function (character) {
        var escapes = { '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
        return escapes[character] || '\\u' + ('0000' + character.charCodeAt(0).toString(16)).slice(-4);
    }) + '"';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Array) {
        var parts = [];
        for (var i = 0; i < value.length; i++) parts.push(biliCoverJson(value[i]));
        return '[' + parts.join(',') + ']';
    }
    var fields = [];
    for (var key in value) {
        if (value.hasOwnProperty(key)) fields.push(biliCoverJson(key) + ':' + biliCoverJson(value[key]));
    }
    return '{' + fields.join(',') + '}';
}

function biliCoverLayerLocked(layer) {
    if (layer.allLocked || layer.positionLocked) return true;
    var parent = layer.parent;
    while (parent && parent.typename === 'LayerSet') {
        if (parent.allLocked) return true;
        parent = parent.parent;
    }
    return false;
}

function biliCoverNormalizeText(value) {
    return value.replace(/\r\n?/g, '\n');
}

function biliCoverTextState() {
    try {
        if (app.documents.length === 0) return biliCoverJson({ documentId: null, layers: [] });
        var doc = app.activeDocument;
        var layers = [];
        function visit(items, prefix) {
            for (var i = 0; i < items.length; i++) {
                var layer = items[i];
                if (layer.typename === 'LayerSet') {
                    visit(layer.layers, prefix + layer.name + ' / ');
                } else if (layer.kind === LayerKind.TEXT) {
                    layers.push({ id: layer.id, name: prefix + layer.name,
                        content: biliCoverNormalizeText(layer.textItem.contents),
                        locked: biliCoverLayerLocked(layer) });
                }
            }
        }
        visit(doc.layers, '');
        return biliCoverJson({ documentId: doc.id, name: doc.name, layers: layers });
    } catch (error) {
        return biliCoverJson({ error: 'READ_FAILED', message: error.message });
    }
}

var biliCoverPendingText = null;
var biliCoverWriteResult = null;

function biliCoverFindLayer(items, id) {
    for (var i = 0; i < items.length; i++) {
        var layer = items[i];
        if (layer.id === id) return layer;
        if (layer.typename === 'LayerSet') {
            var nested = biliCoverFindLayer(layer.layers, id);
            if (nested) return nested;
        }
    }
    return null;
}

function biliCoverCheckText(target) {
    if (app.documents.length === 0 || app.activeDocument.id !== target.documentId)
        return { error: 'DOCUMENT_CHANGED' };
    var layer = biliCoverFindLayer(app.activeDocument.layers, target.layerId);
    if (!layer) return { error: 'LAYER_MISSING' };
    if (layer.typename !== 'ArtLayer' || layer.kind !== LayerKind.TEXT)
        return { error: 'NOT_TEXT' };
    if (biliCoverLayerLocked(layer)) return { error: 'LAYER_LOCKED' };
    if (biliCoverNormalizeText(layer.textItem.contents) !== target.baseline)
        return { error: 'CONTENT_CHANGED' };
    return { layer: layer };
}

function biliCoverWriteTextCommit() {
    var checked = biliCoverCheckText(biliCoverPendingText);
    if (checked.error) {
        biliCoverWriteResult = checked;
        return;
    }
    checked.layer.textItem.contents = biliCoverPendingText.next.replace(/\n/g, '\r');
    biliCoverWriteResult = { ok: true };
}

function biliCoverWriteText(documentId, layerId, baselineEncoded, nextEncoded, expiresAt) {
    try {
        if (!/^\d+$/.test(String(documentId)) || !/^\d+$/.test(String(layerId)))
            return biliCoverJson({ error: 'BAD_TARGET' });
        if (expiresAt !== undefined && (!/^\d+$/.test(String(expiresAt)) ||
            new Date().getTime() > Number(expiresAt))) return biliCoverJson({ error: 'EXPIRED' });
        var target = { documentId: Number(documentId), layerId: Number(layerId),
            baseline: biliCoverNormalizeText(decodeURIComponent(baselineEncoded)),
            next: biliCoverNormalizeText(decodeURIComponent(nextEncoded)) };
        var checked = biliCoverCheckText(target);
        if (checked.error) return biliCoverJson(checked);
        if (target.baseline === target.next) return biliCoverJson({ ok: true });
        biliCoverPendingText = target;
        biliCoverWriteResult = null;
        app.activeDocument.suspendHistory('修改封面文字', 'biliCoverWriteTextCommit()');
        return biliCoverJson(biliCoverWriteResult || { error: 'WRITE_FAILED' });
    } catch (error) {
        return biliCoverJson({ error: 'WRITE_FAILED', message: error.message });
    } finally {
        biliCoverPendingText = null;
    }
}
