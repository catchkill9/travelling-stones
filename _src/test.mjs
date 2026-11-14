// Headless Edge smoke test over CDP (no deps). node _src/test.mjs [url]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots'); mkdirSync(shots, { recursive: true });
const arg = process.argv[2];
const url = arg || 'file:///' + join(here, '..', 'index.html').replace(/\\/g, '/');
const tag = arg ? 'live_' : '';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9344;
const proc = spawn(edge, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + mkdtempSync(join(tmpdir(), 'edge-')), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list;
for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.length) break; } catch (e) { /* retry */ } await sleep(250); }
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error: ' + d.params.args.map(a => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
const shot = async (name, full) => {
  const p = full ? { format: 'png', captureBeyondViewport: true } : { format: 'png' };
  if (full) { const h = await ev('document.documentElement.scrollHeight'); p.clip = { x: 0, y: 0, width: 390, height: Math.min(h, 6000), scale: 1 }; }
  const r = await send('Page.captureScreenshot', p); writeFileSync(join(shots, tag + name + '.png'), Buffer.from(r.result.data, 'base64'));
};
const res = []; const check = (name, ok, info) => res.push((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' - ' + info : ''));
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url }); await sleep(3500);

check('renders hero + sections', await ev("!!document.querySelector('h1') && ['how','found','map','stones'].every(function(i){return document.getElementById(i)})"));
check('tagline', await ev("/Find a painted stone/.test(document.querySelector('h1').innerText)"));
check('no horizontal overflow @390', await ev('document.documentElement.scrollWidth<=window.innerWidth'), 'sw=' + await ev('document.documentElement.scrollWidth'));
check('3 demo stones in gallery, all marked DEMO', await ev("document.querySelectorAll('.scard').length===3 && document.querySelectorAll('.scard .badge').length===3"));
check('map has markers for 9 demo finds + 3 polylines', await ev("document.querySelectorAll('#worldmap .leaflet-marker-icon').length===9 && document.querySelectorAll('#worldmap path.leaflet-interactive').length>=3"), await ev("document.querySelectorAll('#worldmap .leaflet-marker-icon').length") + ' markers');
check('safe-hiding rules visible', await ev("/path or road, in water, or near cliffs/.test(document.body.innerText)"));
check('no free-text inputs (only selects/radio/checkbox + hidden honeypot)', await ev("Array.from(document.querySelectorAll('input,textarea')).filter(function(i){return i.type==='text'||i.type==='email'||i.tagName==='TEXTAREA'}).every(function(i){return i.id==='f-hp'}) && !document.querySelector('textarea')"));
check('no email address in visible text or data', await ev("!/@/i.test(document.body.innerText + document.getElementById('data').textContent)"));
await shot('01_top');
// form: error then demo submit
await ev("document.getElementById('found').scrollIntoView()"); await sleep(300);
await ev("document.querySelector('#foundform button[type=submit]').click()"); await sleep(150);
check('empty submit shows friendly error', await ev("!!document.querySelector('#f-msg .msg.err')"));
await ev("document.getElementById('f-stone').value='DEMO-02';var c=document.getElementById('f-country');c.value='PT';c.dispatchEvent(new Event('change'));document.getElementById('f-place').value='Beach'"); await sleep(400);
await ev("document.querySelector('#pickmap').scrollIntoView({block:'center'})"); await sleep(200);
const r = await ev("(function(){var b=document.getElementById('pickmap').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()");
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await sleep(300);
check('map pick rounds to 2 decimals', await ev("/Picked: -?\\d+\\.\\d\\d, -?\\d+\\.\\d\\d \\(/.test(document.getElementById('f-coord').innerText)"), await ev("document.getElementById('f-coord').innerText"));
await ev("document.getElementById('f-safe').click();document.getElementById('f-adult').click()");
await shot('02_form');
await ev("document.querySelector('#foundform button[type=submit]').click()"); await sleep(400);
check('demo submit: saved locally, labelled DEMO MODE, nothing sent', await ev("/DEMO MODE/.test(document.getElementById('f-msg').innerText) && JSON.parse(localStorage.getItem('travellingStones.pending.v1')).length===1"));
check('pending pin appears on map (10 markers)', await ev("document.querySelectorAll('#worldmap .leaflet-marker-icon').length===10"));
// sanitiser: hostile data
check('clean() rejects html/free text + out-of-list values', await ev("(function(){var c=__TS.clean;return !c({stone:'DEMO-01',action:'found',country:'IE',place:'<img src=x onerror=alert(1)>',lat:1,lng:1}) && !c({stone:'<b>',action:'found',country:'IE',place:'Park',lat:1,lng:1}) && !c({stone:'DEMO-01',action:'found',country:'IE',place:'Park',lat:'x',lng:1}) && c({stone:'DEMO-01',action:'found',country:'IE',place:'Park',lat:53.123456,lng:-6.987654}).lat===53.12})()"));
await ev("document.getElementById('map').scrollIntoView()"); await sleep(500);
await shot('03_map');
await ev("document.querySelectorAll('.chip')[1].click()"); await sleep(400);
check('stone filter shows only that stone (4 markers+1 pending? DEMO-01 has 4)', await ev("document.querySelectorAll('#worldmap .leaflet-marker-icon').length===4"), await ev("document.querySelectorAll('#worldmap .leaflet-marker-icon').length"));
await ev("document.getElementById('stones').scrollIntoView()"); await sleep(300); await shot('04_stones');
// deep link
await send('Page.navigate', { url: url.split('#')[0] + '?stone=DEMO-03#found' }); await sleep(2500);
check('?stone= deep link preselects stone', await ev("document.getElementById('f-stone').value==='DEMO-03'"));
await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true }); await sleep(500);
check('no overflow @320', await ev('document.documentElement.scrollWidth<=window.innerWidth'), 'sw=' + await ev('document.documentElement.scrollWidth'));
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await ev("window.scrollTo(0,0)"); await sleep(200); await shot('05_full', true);
check('no console/runtime errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(res.join('\n'));
ws.close(); proc.kill(); process.exit(0);
