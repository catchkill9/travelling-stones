/* Travelling Stones - plain JS, no framework. Data comes from data/*.json (embedded at build, refreshed live when online). */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('data').textContent);
  var C = D.content;
  var PALETTE = ['#e11d48', '#1fa8d8', '#35b779', '#7b5cd6', '#f59e0b', '#0ea5a4', '#db2777', '#4f46e5'];
  var LS = 'travellingStones.pending.v1';

  // ---------- helpers (everything is rendered with textContent: nothing from data is ever parsed as HTML) ----------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function validCoord(lat, lng) { return isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180; }
  function flag(a) { return (a && a.length === 2) ? String.fromCodePoint(0x1F1E6 + a.charCodeAt(0) - 65, 0x1F1E6 + a.charCodeAt(1) - 65) : ''; }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthYear(d) { var m = /^(\d{4})-(\d{2})/.exec(d || ''); return m ? MONTHS[+m[2] - 1] + ' ' + m[1] : ''; }
  var countryByCode = {}; D.countries.forEach(function (c) { countryByCode[c.a] = c; });
  function stoneIndex() { var m = {}; D.stones.forEach(function (s, i) { m[s.code] = { s: s, color: PALETTE[i % PALETTE.length] }; }); return m; }
  var STONES = stoneIndex();

  // Accept only finds that pass the lists (defence in depth: even if the data file is tampered with, free text never renders).
  function clean(f) {
    if (!f || !STONES[f.stone]) return null;
    if (f.action !== 'found' && f.action !== 'hid') return null;
    if (!countryByCode[f.country]) return null;
    if (C.placeTypes.indexOf(f.place) < 0) return null;
    var lat = round2(Number(f.lat)), lng = round2(Number(f.lng));
    if (!validCoord(lat, lng)) return null;
    return { stone: f.stone, action: f.action, date: /^\d{4}-\d{2}-\d{2}$/.test(f.date || '') ? f.date : '', country: f.country, place: f.place, lat: lat, lng: lng, demo: !!f.demo, pending: !!f.pending };
  }
  var FINDS = (D.finds || []).map(clean).filter(Boolean);

  function loadPending() { try { return (JSON.parse(localStorage.getItem(LS)) || []).map(function (f) { f.pending = true; return clean(f); }).filter(Boolean); } catch (e) { return []; } }
  function savePending(list) { try { localStorage.setItem(LS, JSON.stringify(list)); } catch (e) { /* private mode */ } }

  // ---------- layout ----------
  var app = document.getElementById('app');
  var mapObj = null, layerGroup = null, filter = null;

  function build() {
    app.textContent = '';
    app.appendChild(el('header', { class: 'top' }, [el('div', { class: 'wrap' }, [
      el('span', { class: 'brand', text: '🪨 ' + C.title }),
      el('nav', { 'aria-label': 'Sections' }, [
        el('a', { href: '#how', text: 'How' }), el('a', { href: '#found', text: 'I found one!' }),
        el('a', { href: '#map', text: 'Map' }), el('a', { href: '#stones', text: 'Stones' })])])]));

    app.appendChild(el('div', { class: 'hero' }, [el('div', { class: 'wrap' }, [
      el('h1', { text: C.tagline }),
      el('p', { text: C.intro }),
      el('a', { class: 'btn go', href: '#found', text: 'I found a stone! 🎉' }),
      el('a', { class: 'btn alt', href: '#map', text: 'See the world map 🌍' }),
      el('div', { class: 'pebbles', 'aria-hidden': 'true', text: '🪨🪨🪨' })])]));

    // how it works + rules
    var steps = el('div', { class: 'steps' }, C.steps.map(function (s, i) {
      return el('div', { class: 'step' }, [el('div', { class: 'big', text: s.emoji }), el('h3', { text: (i + 1) + '. ' + s.title }), el('p', { text: s.text })]);
    }));
    var rules = el('div', { class: 'safe' }, [el('h3', { text: '🛡️ ' + C.safeTitle }), el('ul', null, C.safeRules.map(function (r) { return el('li', { text: r }); }))]);
    var priv = el('div', { class: 'privacy' }, [el('h3', { text: '🔒 Privacy' }), el('ul', null, C.privacyNotes.map(function (r) { return el('li', { text: r }); }))]);
    app.appendChild(el('section', { id: 'how' }, [el('div', { class: 'wrap' }, [el('h2', { text: 'What is this? How does it work?' }), steps, el('div', { style: 'height:14px' }), rules, priv])]));

    app.appendChild(el('section', { id: 'found' }, [el('div', { class: 'wrap' }, [el('h2', { text: 'I found a stone! 🪨' }), buildForm()])]));

    app.appendChild(el('section', { id: 'map' }, [el('div', { class: 'wrap' }, [
      el('h2', { text: 'The world map 🌍' }),
      el('div', { class: 'chips', id: 'chips' }),
      el('div', { id: 'worldmap', role: 'application', 'aria-label': 'Map of where the stones have been' }),
      el('p', { class: 'legend', text: 'Teardrop = where someone found the stone. Round dot = where it was hidden again. The dashed line follows the stone\'s journey. Dots are rounded to about 1 km.' })])]));

    app.appendChild(el('section', { id: 'stones' }, [el('div', { class: 'wrap' }, [
      el('h2', { text: 'Meet the stones 🎨' }), el('div', { class: 'gallery', id: 'gallery' }),
      el('div', { class: 'back' }, [el('small', { text: 'The back of every stone says:' }), el('b', { text: C.backLabel }), el('small', { text: C.siteUrlShort })])])]));

    app.appendChild(el('footer', null, [el('div', { class: 'wrap' }, [
      el('p', { text: C.footer }),
      el('p', null, ['Map: ', el('a', { href: 'https://leafletjs.com', text: 'Leaflet', rel: 'noopener' }), ' + © ', el('a', { href: 'https://www.openstreetmap.org/copyright', text: 'OpenStreetMap contributors', rel: 'noopener' }), '.'])])]));
  }

  function opt(v, t) { return el('option', { value: v, text: t }); }

  function buildForm() {
    var stoneSel = el('select', { id: 'f-stone', required: '' }, [opt('', 'Choose the stone…')].concat(D.stones.map(function (s) { return opt(s.code, s.code + ' - ' + s.name + (s.demo ? ' (DEMO)' : '')); })));
    var countrySel = el('select', { id: 'f-country', required: '' }, [opt('', 'Choose the country…')].concat(D.countries.map(function (c) { return opt(c.a, flag(c.a) + ' ' + c.n); })));
    var placeSel = el('select', { id: 'f-place', required: '' }, [opt('', 'What kind of place?')].concat(C.placeTypes.map(function (p) { return opt(p, p); })));
    var seg = el('div', { class: 'seg', role: 'radiogroup' }, C.actions.map(function (a, i) {
      var inp = el('input', { type: 'radio', name: 'action', value: a.id }); if (i === 0) inp.checked = true;
      return el('label', null, [inp, el('span', { text: a.label })]);
    }));
    var out = el('div', { id: 'f-msg', 'aria-live': 'polite' });
    var coordNote = el('p', { class: 'hint', id: 'f-coord', text: 'Not picked yet.' });
    var form = el('form', { id: 'foundform', novalidate: '' }, [
      el('label', { class: 'f', for: 'f-stone', text: '1. Which stone?' }), stoneSel,
      el('label', { class: 'f', text: '2. What happened?' }), seg,
      el('label', { class: 'f', for: 'f-country', text: '3. Which country?' }), countrySel,
      el('label', { class: 'f', for: 'f-place', text: '4. What kind of place?' }), placeSel,
      el('label', { class: 'f', text: '5. Tap the map to show roughly where (a city, park or beach is enough)' }),
      el('button', { type: 'button', class: 'btn alt', id: 'f-locate', text: '📍 Use my location (rounded to 1 km)' }),
      el('div', { id: 'pickmap' }), coordNote,
      el('div', { class: 'hp', 'aria-hidden': 'true' }, [el('input', { type: 'text', id: 'f-hp', tabindex: '-1', autocomplete: 'off', name: 'website' })]),
      el('label', { class: 'chk' }, [el('input', { type: 'checkbox', id: 'f-safe' }), el('span', { text: 'The stone is in a safe public place: not on a path or road, not in water, not near a cliff or edge, not near a home or school.' })]),
      el('label', { class: 'chk' }, [el('input', { type: 'checkbox', id: 'f-adult' }), el('span', { text: 'A grown-up knows I am logging this stone.' })]),
      el('button', { type: 'submit', class: 'btn go', text: 'Send my log 🚀' }), out]);
    form.addEventListener('submit', onSubmit);
    return form;
  }

  // ---------- picker map ----------
  var pickMap = null, pickMarker = null, picked = null;
  function setPick(lat, lng) {
    lat = round2(lat); lng = round2(lng);
    if (!validCoord(lat, lng)) return;
    picked = { lat: lat, lng: lng };
    if (pickMarker) pickMarker.setLatLng([lat, lng]); else pickMarker = L.circleMarker([lat, lng], { radius: 11, color: '#fff', weight: 3, fillColor: '#ff7a59', fillOpacity: 1 }).addTo(pickMap);
    document.getElementById('f-coord').textContent = '✅ Picked: ' + lat.toFixed(2) + ', ' + lng.toFixed(2) + ' (rounded to about 1 km)';
  }
  function tiles(m) {
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 14, minZoom: 1, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
  }
  function initPick() {
    pickMap = L.map('pickmap', { worldCopyJump: true, zoomSnap: 1 }).setView([30, 0], 1);
    tiles(pickMap);
    pickMap.on('click', function (e) { setPick(e.latlng.lat, e.latlng.lng); });
    document.getElementById('f-country').addEventListener('change', function (e) {
      var c = countryByCode[e.target.value]; if (c) pickMap.setView(c.ll, 5);
    });
    document.getElementById('f-locate').addEventListener('click', function () {
      if (!navigator.geolocation) return flash('err', 'This phone cannot share a location. Tap the map instead.');
      navigator.geolocation.getCurrentPosition(function (p) { setPick(p.coords.latitude, p.coords.longitude); pickMap.setView([round2(p.coords.latitude), round2(p.coords.longitude)], 11); },
        function () { flash('err', 'No location available. Tap the map instead.'); }, { timeout: 10000, maximumAge: 600000 });
    });
  }
  function flash(kind, text, extra) {
    var m = document.getElementById('f-msg'); m.textContent = ''; m.appendChild(el('div', { class: 'msg ' + kind, text: text }));
    if (extra) m.firstChild.appendChild(extra);
  }

  // ---------- submit ----------
  function onSubmit(ev) {
    ev.preventDefault();
    if (document.getElementById('f-hp').value) return; // bots
    var f = {
      stone: document.getElementById('f-stone').value,
      action: (document.querySelector('input[name=action]:checked') || {}).value,
      country: document.getElementById('f-country').value,
      place: document.getElementById('f-place').value,
      lat: picked && picked.lat, lng: picked && picked.lng,
      date: new Date().toISOString().slice(0, 10)
    };
    var ok = clean(f);
    if (!ok) return flash('err', 'Please pick the stone, the country, the place, and tap the map. 🗺️');
    if (!document.getElementById('f-safe').checked || !document.getElementById('f-adult').checked) return flash('err', 'Please tick both boxes: safe place + a grown-up knows. 🛡️');
    var cfg = D.config;
    if (cfg.mode === 'googleform' && /^https:\/\/docs\.google\.com\/forms\//.test(cfg.formAction)) {
      var body = new URLSearchParams();
      ['stone', 'action', 'country', 'place', 'lat', 'lng'].forEach(function (k) { body.append(cfg.entries[k], String(ok[k])); });
      fetch(cfg.formAction, { method: 'POST', mode: 'no-cors', body: body }).then(function () {
        flash('ok', 'Thank you! 🎉 A grown-up will check your log and then it will show on the map. Now hide the stone somewhere safe and new!');
        resetForm();
      }, function () { flash('err', 'Could not send. Check your internet and try again.'); });
    } else {
      // DEMO mode: nothing leaves the device.
      var list = loadPending(); ok.pending = true; list.push(ok); savePending(list);
      flash('demo', 'DEMO MODE: your log was saved only on this device (nothing was sent). It shows on the map with a "waiting" label.');
      resetForm(); refreshMap();
    }
  }
  function resetForm() {
    document.getElementById('f-stone').value = ''; document.getElementById('f-place').value = '';
    document.getElementById('f-safe').checked = false; document.getElementById('f-adult').checked = false;
  }

  // ---------- world map ----------
  function allFinds() { return FINDS.concat(loadPending()); }
  function initMap() {
    mapObj = L.map('worldmap', { worldCopyJump: true, zoomSnap: 1 }).setView([40, 5], 2);
    tiles(mapObj);
    layerGroup = L.layerGroup().addTo(mapObj);
    refreshMap();
  }
  function refreshMap() {
    var chips = document.getElementById('chips'); chips.textContent = '';
    var mk = function (code, label, color) {
      var b = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(filter === code) }, [color ? el('span', { class: 'dot', style: 'background:' + color }) : null, label]);
      b.addEventListener('click', function () { filter = code; refreshMap(); }); chips.appendChild(b);
    };
    mk(null, 'All stones');
    D.stones.forEach(function (s) { mk(s.code, s.name, STONES[s.code].color); });
    layerGroup.clearLayers();
    var all = allFinds(), pts = [];
    D.stones.forEach(function (s) {
      if (filter && filter !== s.code) return;
      var color = STONES[s.code].color;
      var mine = all.filter(function (f) { return f.stone === s.code; });
      var line = mine.map(function (f) { return [f.lat, f.lng]; });
      if (line.length > 1) L.polyline(line, { color: color, weight: 4, opacity: .85, dashArray: '2 9', lineCap: 'round' }).addTo(layerGroup);
      mine.forEach(function (f, i) {
        var icon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: f.action === 'hid' ? [11, 11] : [11, 22], popupAnchor: [0, -20], html: '<div class="pin ' + f.action + '" style="background:' + color + (f.pending ? ';opacity:.55' : '') + '"></div>' });
        var m = L.marker([f.lat, f.lng], { icon: icon, title: s.name }).addTo(layerGroup);
        var c = countryByCode[f.country];
        var pop = el('div', { class: 'pop' }, [el('b', { text: s.name + ' (' + s.code + ')' }),
          el('span', { text: (f.action === 'found' ? 'Found' : 'Hidden') + ' #' + (i + 1) + ': ' + f.place + ', ' + (c ? flag(c.a) + ' ' + c.n : '') }), el('br'),
          el('span', { text: monthYear(f.date) }),
          (f.demo ? el('div', null, [el('span', { class: 'badge', text: 'DEMO' })]) : null),
          (f.pending ? el('div', null, [el('span', { class: 'badge pend', text: 'WAITING FOR A GROWN-UP (this device only)' })]) : null)]);
        m.bindPopup(pop); pts.push([f.lat, f.lng]);
      });
    });
    if (pts.length) mapObj.fitBounds(pts, { padding: [30, 30], maxZoom: 6 });
  }

  // ---------- gallery ----------
  function gallery() {
    var g = document.getElementById('gallery'); g.textContent = '';
    D.stones.forEach(function (s) {
      var n = allFinds().filter(function (f) { return f.stone === s.code; }).length;
      g.appendChild(el('div', { class: 'scard' }, [
        el('div', { class: 'pebble', style: 'background:linear-gradient(145deg,' + (s.colors && s.colors[0] || '#999') + ',' + (s.colors && s.colors[1] || '#555') + ')', 'aria-hidden': 'true', text: s.emoji || '🪨' }),
        el('h3', { text: s.name }),
        el('div', null, [el('span', { class: 'code', text: s.code }), s.demo ? ' ' : null, s.demo ? el('span', { class: 'badge', text: 'DEMO' }) : null]),
        el('p', { text: s.painted }),
        el('p', { class: 'hint', text: n + (n === 1 ? ' log' : ' logs') + ' on the map' }),
        el('a', { href: '?stone=' + encodeURIComponent(s.code) + '#found', text: 'I found this one!' })]));
    });
  }

  // ---------- boot ----------
  build();
  initPick(); initMap(); gallery();
  var qs = new URLSearchParams(location.search).get('stone');
  if (qs && STONES[qs]) { document.getElementById('f-stone').value = qs; if (location.hash !== '#found') document.getElementById('found').scrollIntoView(); }
  // refresh the data live when hosted (GitHub Pages): approved finds are added without rebuilding the site
  if (/^https?:/.test(location.protocol)) {
    fetch('data/finds.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (j && Array.isArray(j.finds)) { FINDS = j.finds.map(clean).filter(Boolean); refreshMap(); gallery(); }
    }).catch(function () { });
  }
  window.__TS = { clean: clean, FINDS: function () { return FINDS; }, D: D };
})();
