const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const output = path.join(root, 'dist', 'plugin');
fs.mkdirSync(path.join(output, 'shared'), { recursive: true });
for (const name of ['manifest.json', 'index.html', 'plugin.css', 'plugin.js']) {
  fs.copyFileSync(path.join(root, 'plugin', name), path.join(output, name));
}
for (const name of ['preview.css', 'preview.js']) {
  fs.copyFileSync(path.join(root, 'shared', name), path.join(output, 'shared', name));
}
console.log(`UXP 插件已生成：${output}`);

const cepOutput = path.join(root, 'dist', 'cep');
fs.mkdirSync(path.join(cepOutput, 'CSXS'), { recursive: true });
fs.mkdirSync(path.join(cepOutput, 'shared'), { recursive: true });
for (const name of ['index.html', 'panel.css', 'panel.js', 'host.jsx']) {
  fs.copyFileSync(path.join(root, 'plugin-cep', name), path.join(cepOutput, name));
}
fs.copyFileSync(path.join(root, 'plugin-cep', 'CSXS', 'manifest.xml'), path.join(cepOutput, 'CSXS', 'manifest.xml'));
for (const name of ['preview.css', 'preview.js']) {
  fs.copyFileSync(path.join(root, 'shared', name), path.join(cepOutput, 'shared', name));
}
console.log(`Photoshop 2021 CEP 插件已生成：${cepOutput}`);
