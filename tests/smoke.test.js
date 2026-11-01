// Test de fumée Playwright : node tests/smoke.test.js [chemin/vers/leaflet/dist]
// Scénario A : réseau coupé -> message d'erreur explicite + démo hors ligne.
// Scénario B : API simulées (fixtures au format des API réelles) -> chemin « données réelles ».
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const LEAFLET = process.argv[2];
const OUT = process.env.OUT || __dirname;

const LAT = 49.8941, LON = 2.2958;
const ban = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [LON, LAT] },
  properties: { label: '8 Boulevard du Port 80000 Amiens', city: 'Amiens', postcode: '80000', citycode: '80021', id: '80021_6590_00008', type: 'housenumber', score: 0.97 } }] };
const head = 'id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe,adresse_nom_voie,adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,ancien_nom_commune,id_parcelle,ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,lot2_surface_carrez,lot3_numero,lot3_surface_carrez,lot4_numero,lot4_surface_carrez,lot5_numero,lot5_surface_carrez,nombre_lots,code_type_local,type_local,surface_reelle_bati,nombre_pieces_principales,code_nature_culture,nature_culture,code_nature_culture_speciale,nature_culture_speciale,surface_terrain,longitude,latitude';
const rows = [];
for (let i = 0; i < 30; i++) {
  const apt = i % 3 !== 0, s = apt ? 40 + i : 90 + i, d = `2025-${String(1 + (i % 12)).padStart(2, '0')}-15`;
  const y = i < 15 ? '2025' : '2024';
  rows.push(`2025-${i},${y}${d.slice(4)},1,Vente,${s * (2400 + i * 20)},${i + 1},,RUE TEST,0001,80000,80021,Amiens,80,,,80021000AB0${i},,,1,,,,,,,,,,1,${apt ? 2 : 1},${apt ? 'Appartement' : 'Maison'},${s},${apt ? 2 : 4},,,,,,${LON + (i - 15) * 0.0002},${LAT + (i % 5) * 0.0002}`);
}
rows.push(`2025-x,2025-06-01,1,Vente,9000,1,,RUE TEST,0001,80000,80021,Amiens,80,,,80021000AB099,,,,,,,,,,,,,0,3,Dépendance,,,,,,,,${LON},${LAT}`);
const dvfCsv = head + '\n' + rows.join('\n') + '\n';
const dpeRow = (l, k, dist) => ({ etiquette_dpe: l, etiquette_ges: 'C', conso_5_usages_par_m2_ep: 100 + k * 30, surface_habitable_logement: 55, date_etablissement_dpe: `2025-0${1 + (k % 9)}-10`, type_batiment: 'appartement', adresse_ban: `${k} Rue Test 80000 Amiens`, identifiant_ban: dist === 0 ? '80021_6590_00008' : 'x', _geopoint: `${LAT + dist * 0.00001},${LON}` });
const dpeNear = { total: 20, results: 'ABCDDDDEEEFFGCCDDEEG'.split('').map((l, k) => dpeRow(l, k, 50 + k * 5)) };
const dpeSame = { total: 1, results: [dpeRow('D', 3, 0)] };
const geor = { url: 'https://www.georisques.gouv.fr/mes-risques/connaitre-les-risques-pres-de-chez-moi/rapport2?form-adresse=true',
  risquesNaturels: { inondation: { present: true, libelle: 'Inondation', libelleStatutCommune: 'Risque Existant', libelleStatutAdresse: 'Risque Existant' }, seisme: { present: true, libelle: 'Séisme', libelleStatutAdresse: 'Zone de sismicité : 1 (très faible)' }, radon: { present: false, libelle: 'Radon', libelleStatutAdresse: 'Potentiel faible' } },
  risquesTechnologiques: { icpe: { present: false, libelle: 'ICPE', libelleStatutAdresse: 'Non concerné' } } };
const catnat = { results: 7, data: [{ date_debut_evt: '1999-12-25', libelle_risque_jo: 'Inondations, coulées de boue et mouvements de terrain' }, { date_debut_evt: '2001-03-01', libelle_risque_jo: 'Inondations par remontées de nappe' }] };
const overpass = { osm3s: { timestamp_osm_base: '2026-10-30T12:00:00Z' }, elements: [{ type: 'way', tags: { highway: 'primary', name: 'Boulevard du Port' }, geometry: [{ lat: LAT + 0.0003, lon: LON - 0.002 }, { lat: LAT + 0.0003, lon: LON + 0.002 }] }] };
const edu = { total_count: 3, results: [
  { nom_etablissement: 'École élémentaire Test', type_etablissement: 'Ecole', statut_public_prive: 'Public', etat: 'OUVERT', position: { lat: LAT + 0.002, lon: LON }, adresse_1: '1 rue', code_postal: '80000', nom_commune: 'Amiens', date_maj_ligne: '2026-10-31' },
  { nom_etablissement: 'Collège Test', type_etablissement: 'Collège', statut_public_prive: 'Public', etat: 'OUVERT', position: { lat: LAT + 0.006, lon: LON } },
  { nom_etablissement: 'Lycée fermé', type_etablissement: 'Lycée', statut_public_prive: 'Public', etat: 'FERME', position: { lat: LAT, lon: LON + 0.001 } }] };
const hubeau = { count: 3, data: [
  { code_prelevement: 'P1', date_prelevement: '2026-10-12T08:00:00Z', conclusion_conformite_prelevement: 'Eau conforme aux limites et références de qualité.', conformite_limites_bact_prelevement: 'C', conformite_limites_pc_prelevement: 'C', nom_distributeur: 'AMIENS METROPOLE' },
  { code_prelevement: 'P1', date_prelevement: '2026-10-12T08:00:00Z', conformite_limites_bact_prelevement: 'C', conformite_limites_pc_prelevement: 'C' },
  { code_prelevement: 'P2', date_prelevement: '2026-08-02T08:00:00Z', conformite_limites_bact_prelevement: 'C', conformite_limites_pc_prelevement: 'N' }] };

function serve() {
  return new Promise(res => {
    const s = http.createServer((req, r) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, () => res(s));
  });
}
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function setup(page, mode) {
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1')) return route.continue();
    if (u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet') && LEAFLET) {
      const file = u.endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
      return route.fulfill({ status: 200, contentType: file.endsWith('css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(LEAFLET, file)) });
    }
    if (mode === 'offline') return route.abort();
    const cors = { 'access-control-allow-origin': '*' };
    if (u.includes('/geocodage/search') || u.includes('api-adresse')) return json(route, ban);
    if (u.includes('geo-dvf')) return u.includes('/2025/') ? route.fulfill({ status: 200, headers: cors, contentType: 'text/csv', body: dvfCsv }) : route.fulfill({ status: 404, headers: cors, body: '' });
    if (u.includes('dpe03existant')) return json(route, u.endsWith(',25') ? dpeSame : dpeNear);
    if (u.includes('resultats_rapport_risque')) return json(route, geor);
    if (u.includes('gaspar/catnat')) return json(route, catnat);
    if (u.includes('overpass')) return json(route, overpass);
    if (u.includes('fr-en-annuaire-education')) return json(route, edu);
    if (u.includes('hubeau')) return json(route, hubeau);
    return route.fulfill({ status: 204, headers: cors, body: '' }); // tuiles, etc.
  });
}

(async () => {
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch(); let failures = 0;
  const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) failures++; };

  // A. hors ligne
  { const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await setup(page, 'offline'); await page.goto(base);
    await page.fill('#addr', '8 boulevard du Port Amiens'); await page.click('button[type=submit]');
    await page.waitForSelector('#search-msg .msg.error'); check(true, 'A: message explicite si la BAN est injoignable');
    await page.click('[data-run-demo]'); await page.waitForFunction(() => document.querySelectorAll('.src').length === 7);
    await page.waitForFunction(() => !document.querySelector('#att-list').textContent.includes('Analyse en cours'));
    check(await page.locator('.banner.sample').count() === 1, 'A: bandeau « données d\'exemple » affiché');
    check(await page.locator('#coverage .st.sample').count() === 8, 'A: 8 sources marquées « Exemple »');
    check((await page.locator('#att-list li').count()) > 0 && (await page.locator('#fort-list li').count()) > 0, 'A: points d\'attention et points forts calculés');
    check(errs.length === 0, 'A: aucune erreur JS ' + errs.join(' | '));
    await page.screenshot({ path: path.join(OUT, 'demo-offline.png'), fullPage: true }); await page.close(); }

  // B. API simulées
  { const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await setup(page, 'live'); await page.goto(base);
    await page.screenshot({ path: path.join(OUT, 'accueil.png') });
    await page.locator('#addr').pressSequentially('8 bd du port', { delay: 20 });
    await page.waitForSelector('#suggestions li'); check(await page.getAttribute('#addr', 'aria-expanded') === 'true', 'B: autocomplétion (combobox ouverte)');
    await page.keyboard.press('ArrowDown'); check(await page.getAttribute('#addr', 'aria-activedescendant') === 'opt-0', 'B: navigation clavier dans les suggestions');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#att-list').textContent.includes('Analyse en cours'), null, { timeout: 20000 });
    const cov = await page.locator('#coverage li').allTextContents();
    check(await page.locator('#coverage .st.live').count() === 7, 'B: 7 sources réelles + Arcep en exemple → ' + cov.map(c => c.slice(0, 30)).join(' / '));
    const dvf = await page.textContent('#card-dvf'); check(/€/.test(dvf) && /30 ventes/.test(dvf), 'B: DVF agrégé (30 ventes, dépendance exclue)');
    check(/Classe D/.test(await page.textContent('#card-dpe')), 'B: DPE de l\'adresse (identifiant BAN)');
    check(/Inondation/.test(await page.textContent('#att-list')), 'B: risque inondation en point d\'attention');
    check(!/Séisme/.test(await page.textContent('#att-list')), 'B: séisme zone 1 non signalé');
    check(/Répartition des 20 DPE/.test(await page.textContent('#card-dpe')), 'B: répartition des DPE voisins');
    check(/7 arrêtés/.test(await page.textContent('#att-list')), 'B: arrêtés CatNat');
    check(/Modérée/.test(await page.textContent('#card-noise')), 'B: bruit modéré (axe principal à ~33 m)');
    check(!/Lycée fermé/.test(await page.textContent('#card-schools')), 'B: établissements fermés exclus');
    check(/1 non-conformité/.test(await page.textContent('#card-water')), 'B: Hub\'Eau dédoublonné par prélèvement');
    check(await page.locator('.src').count() === 7 && /Consulté le/.test(await page.textContent('.src')), 'B: source + date sur chaque fiche');
    check(await page.locator('.leaflet-interactive').count() > 10, 'B: couches sur la carte');
    check(/lat=49\.894100/.test(page.url()), 'B: URL partageable');
    check(errs.length === 0, 'B: aucune erreur JS ' + errs.join(' | '));
    await page.screenshot({ path: path.join(OUT, 'rapport.png'), fullPage: true });
    // lien partagé rouvert sur mobile
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } }); await setup(m, 'live'); await m.goto(page.url());
    await m.waitForFunction(() => document.querySelectorAll('.src').length === 7);
    const sw = await m.evaluate(() => document.documentElement.scrollWidth); check(sw <= 390, 'B: mobile sans défilement horizontal (' + sw + 'px)');
    await m.screenshot({ path: path.join(OUT, 'rapport-mobile.png'), fullPage: true }); }

  await browser.close(); srv.close();
  console.log(failures ? `${failures} échec(s)` : 'Tous les tests passent'); process.exit(failures ? 1 : 0);
})();
