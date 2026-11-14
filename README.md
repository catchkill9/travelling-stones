# Travelling Stones

A kids' class project: each child paints and names a stone, takes it travelling, and finders log where they found it and hide it again. This site shows every stone's journey on a world map.

Live site: https://catchkill9.github.io/travelling-stones/

## Child safety (built in)
- No names, no photos of people, no free-text boxes. Finders only pick from lists (stone, country, kind of place) and tap a map; coordinates are rounded to 2 decimals (about 1 km).
- Safe-hiding rules are on the page and two tick boxes are required (safe public place + a grown-up knows).
- Logs only appear after a grown-up approves them (they are added to `data/finds.json`). Until then they exist only in the submission inbox.
- Everything from data files is rendered as plain text and re-validated against the lists in the browser.

## Files
- `data/content.json` - all texts, rules, place types (copy these into Wix as needed)
- `data/stones.json` - the stones (add the class's real stones here; remove `"demo": true`)
- `data/finds.json` - approved logs shown on the map (the journey line follows the file order per stone)
- `data/config.json` - submission backend (`mode: "demo"` until the form is connected)
- `_src/` - source: `node _src/build.mjs` builds the single `index.html`; `node _src/test.mjs [url]` runs a headless Edge smoke test; `node _src/labels.mjs` builds `labels/stone-labels.html` (print to PDF)
- `labels/stone-labels.pdf` - A4 sticker/copy sheet with QR codes

Built with Leaflet + OpenStreetMap tiles, `world-countries` (country list/centres) and `qrcode-generator`. No server, no paid service.

## Connecting submissions (Google Form, free)
1. Create a Google Form with 6 short-answer questions: stone, action, country, place, lat, lng.
2. Get a pre-filled link ("Get pre-filled link") to read each question's `entry.NNN` id.
3. In `data/config.json` set `mode` to `googleform`, `formAction` to the form's `.../formResponse` URL and the six `entries`. Rebuild and push.
4. Approve logs by copying valid rows from the Form's response sheet into `data/finds.json`.

The form owner's email is never shown to finders.
