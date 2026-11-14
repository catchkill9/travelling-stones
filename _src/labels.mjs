// node _src/labels.mjs -> labels/stone-labels.html (+ PDF via headless Edge). QR codes: qrcode-generator (MIT), generated locally.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const qrcode = require('qrcode-generator');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const C = JSON.parse(readFileSync(join(root, 'data/content.json'), 'utf8'));
const S = JSON.parse(readFileSync(join(root, 'data/stones.json'), 'utf8')).stones;
const qr = text => { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const label = (url, code) => `<div class="l"><div class="q">${qr(url)}</div><div class="t"><b>Travelling Stones</b><span>Find, log, hide it again!</span><i>${esc(C.siteUrlShort)}</i>${code ? `<em>${esc(code)}</em>` : '<em class="blank">Stone: ________</em>'}</div></div>`;
const page1 = Array.from({ length: 24 }, () => label(C.siteUrl)).join('');
const stoneLabels = S.slice(0, 3).flatMap(s => Array.from({ length: 6 }, () => label(C.siteUrl + '?stone=' + encodeURIComponent(s.code), s.code + (s.demo ? ' DEMO' : ''))));
const page2 = stoneLabels.concat(Array.from({ length: 24 - stoneLabels.length }, () => label(C.siteUrl))).join('');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Travelling Stones labels</title><style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;font-family:"Trebuchet MS",Arial,sans-serif;color:#000}
.page{width:210mm;height:297mm;padding:8mm 7.5mm;display:grid;grid-template-columns:repeat(3,65mm);grid-template-rows:repeat(8,33mm);column-gap:2.5mm;row-gap:2mm;page-break-after:always;overflow:hidden}
.l{border:0.4mm dashed #888;border-radius:3mm;padding:2.5mm;display:flex;gap:2.5mm;align-items:center}
.q{width:25mm;height:25mm;flex:none}.q svg{width:100%;height:100%;display:block}
.t{display:flex;flex-direction:column;gap:1mm;min-width:0}
.t b{font-size:4.2mm;line-height:1}.t span{font-size:2.9mm;line-height:1.1}
.t i{font-style:normal;font-size:2.35mm;word-break:break-all;font-weight:700;line-height:1.1}
.t em{font-style:normal;font-size:3.2mm;font-weight:700;border-top:0.3mm solid #000;padding-top:0.8mm}
.t em.blank{font-weight:400;color:#444}
.hdr{grid-column:1/-1}
</style></head><body>
<div class="page">${page1}</div>
<div class="page">${page2}</div>
</body></html>`;
writeFileSync(join(root, 'labels', 'stone-labels.html'), html);
console.log('labels html ok');

