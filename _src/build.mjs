// node _src/build.mjs  ->  ../index.html (single self-contained file; data/*.json embedded as fallback and fetched live when online)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const rd = f => readFileSync(join(here, 'app', f), 'utf8');
const js1 = f => JSON.parse(readFileSync(join(root, 'data', f), 'utf8'));
const content = js1('content.json'), stones = js1('stones.json'), finds = js1('finds.json'), config = js1('config.json');
const countries = require('world-countries').map(c => ({ n: c.name.common, a: c.cca2, ll: c.latlng })).filter(c => c.ll && c.ll.length === 2).sort((a, b) => a.n.localeCompare(b.n));
// Safety: the shipped config never contains secrets; only the public Google Form POST URL + entry ids.
const data = { content, stones: stones.stones, finds: finds.finds, config, countries };
const esc = s => JSON.stringify(s).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const leafletJs = readFileSync(join(root, 'node_modules/leaflet/dist/leaflet.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
const leafletCss = readFileSync(join(root, 'node_modules/leaflet/dist/leaflet.css'), 'utf8').replace(/url\(images\/[^)]*\)/g, 'none');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#ff7a59">
<meta name="description" content="Travelling Stones: find a painted stone, log it, hide it again. See each stone's journey on the world map.">
<title>Travelling Stones</title>
<style>
${leafletCss}
${rd('style.css')}
</style>
</head>
<body>
<div id="app"></div>
<noscript>Travelling Stones needs JavaScript to show the map and the form.</noscript>
<script id="data" type="application/json">${esc(data)}</script>
<script>
${leafletJs}
</script>
<script>
${rd('app.js')}
</script>
</body>
</html>
`;
writeFileSync(join(root, 'index.html'), html);
console.log('wrote index.html', (html.length / 1024).toFixed(0) + ' KB;', stones.stones.length, 'stones,', finds.finds.length, 'finds,', countries.length, 'countries');
