// Test contre les VRAIES API (réseau requis) : node tests/live.test.js [leaflet/dist]
// Affiche, pour quelques adresses, l'état de chaque source et un extrait de chaque fiche.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LEAFLET = process.argv[2];
const ADDRS = (process.env.ADDRS || '144 Rue Roustaing 33400 Talence|20 avenue de Ségur 75007 Paris|8 boulevard du Port 80000 Amiens').split('|');
(async () => {
  const srv = await new Promise(r => { const s = http.createServer((q, w) => { const f = path.join(ROOT, q.url.split('?')[0].replace(/\/$/, '/index.html')); if (!fs.existsSync(f)) { w.writeHead(404); return w.end(); } w.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); w.end(fs.readFileSync(f)); }).listen(0, () => r(s)); });
  const browser = await chromium.launch(); let bad = 0;
  for (const a of ADDRS) {
    const page = await browser.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    if (LEAFLET) await page.route('**/cdnjs.cloudflare.com/**', r => r.fulfill({ body: fs.readFileSync(path.join(LEAFLET, r.request().url().endsWith('.css') ? 'leaflet.css' : 'leaflet.js')), contentType: r.request().url().endsWith('.css') ? 'text/css' : 'application/javascript' }));
    await page.route(/(wmts|tile\.openstreetmap)/, r => r.fulfill({ status: 204, body: '' }));
    await page.goto(`http://127.0.0.1:${srv.address().port}/`);
    await page.fill('#addr', a); await page.click('button[type=submit]');
    const t0 = Date.now();
    await page.waitForFunction(() => document.querySelector('#report:not([hidden])') && !document.querySelector('#att-list').textContent.includes('Analyse en cours'), null, { timeout: 120000 });
    console.log(`\n### ${await page.textContent('#h-report')} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const id of ['dvf', 'dpe', 'georisques', 'noise', 'arcep', 'schools', 'water']) {
      const st = await page.textContent(`#card-${id} .src .st`), body = (await page.textContent(`#card-${id} .body`)).replace(/\s+/g, ' ').trim();
      if (!/réelles/.test(st) && id !== 'arcep') bad++;
      console.log(`- ${id.padEnd(10)} ${st.padEnd(18)} ${body.slice(0, 170)}`);
    }
    console.log('  ATTENTION:', (await page.locator('#att-list li').allTextContents()).map(x => x.split('·')[0].trim().slice(0, 70)).join(' | '));
    console.log('  FORTS    :', (await page.locator('#fort-list li').allTextContents()).map(x => x.split('·')[0].trim().slice(0, 70)).join(' | '));
    if (errs.length) { bad++; console.log('  ERREURS JS:', errs); }
    await page.screenshot({ path: path.join(process.env.OUT || __dirname, `live-${ADDRS.indexOf(a)}.png`), fullPage: true });
    await page.close();
  }
  await browser.close(); srv.close(); console.log(bad ? `\n${bad} source(s) non réelle(s) ou erreur(s)` : '\nToutes les sources (hors Arcep) sont réelles'); process.exit(bad ? 1 : 0);
})();
