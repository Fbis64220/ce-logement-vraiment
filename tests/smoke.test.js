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
// DVF+ open data (Cerema) : FeatureCollection de mutations, géométrie = parcelle(s)
const sq = (lon, lat, d = 0.00005) => ({ type: 'MultiPolygon', coordinates: [[[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]]] });
const mut = (i, code) => { const apt = code === 121, s = apt ? 40 + i : 90 + i;
  return { type: 'Feature', geometry: sq(LON + (i - 15) * 0.0002, LAT + (i % 5) * 0.0002), properties: { datemut: `${i < 15 ? 2025 : 2024}-${String(1 + (i % 12)).padStart(2, '0')}-15`, libnatmut: 'Vente', vefa: false, valeurfonc: String(s * (2400 + i * 20)), nbcomm: 1, nbpar: 1, l_idpar: [`80021000AB0${100 + i}`], sbati: String(s), codtypbien: apt ? '121' : '111', libtypbien: apt ? 'UN APPARTEMENT' : 'UNE MAISON' } }; };
const dvfApt = { type: 'FeatureCollection', count: 20, next: null, features: Array.from({ length: 30 }, (_, i) => i).filter(i => i % 3 !== 0).map(i => mut(i, 121)) };
const dvfMai = { type: 'FeatureCollection', count: 10, next: null, features: Array.from({ length: 30 }, (_, i) => i).filter(i => i % 3 === 0).map(i => mut(i, 111)) };
const dpeRow = (l, k, dist) => ({ etiquette_dpe: l, etiquette_ges: 'C', conso_5_usages_par_m2_ep: 100 + k * 30, surface_habitable_logement: 55, date_etablissement_dpe: `2025-0${1 + (k % 9)}-10`, type_batiment: 'appartement', adresse_ban: `${k} Rue Test 80000 Amiens`, identifiant_ban: dist === 0 ? '80021_6590_00008' : 'x', _geopoint: `${LAT + dist * 0.00001},${LON}` });
const dpeNear = { total: 20, results: 'ABCDDDDEEEFFGCCDDEEG'.split('').map((l, k) => dpeRow(l, k, 50 + k * 5)) };
const dpeSame = { total: 1, results: [dpeRow('D', 3, 0)] };
const page = (data) => ({ results: data.length, page: 1, total_pages: 1, data });
const G = {
  'gaspar/risques': page([{ risques_detail: [{ num_risque: '11', libelle_risque_long: 'Inondation' }, { num_risque: '13', libelle_risque_long: 'Séisme' }], code_insee: '80021' }]),
  'gaspar/azi': page([]), 'gaspar/tri': page([{ libelle_tri: 'Amiens', code_insee: '80021' }]),
  'zonage_sismique': page([{ code_zone: '1', zone_sismicite: '1 - TRES FAIBLE' }]), 'rga': { codeExposition: '1', exposition: 'Exposition faible' },
  'radon': page([{ classe_potentiel: '1' }]),
  'installations_classees': page([{ raisonSociale: 'USINE TEST', statutSeveso: 'Seveso seuil haut', etatActivite: 'En fonctionnement', latitude: LAT + 0.005, longitude: LON }]),
  'ssp': { casias: page([]), instructions: page([]), conclusions_sis: page([]), conclusions_sup: page([]) },
  'cavites': page([]), 'mvt': page([]),
  'gaspar/catnat': { results: 7, data: [{ date_debut_evt: '25/12/1999', libelle_risque_jo: 'Inondations, coulées de boue et mouvements de terrain' }, { date_debut_evt: '01/03/2001', libelle_risque_jo: 'Inondations par remontées de nappe' }] } };
// Géoplateforme WFS : BD TOPO (routes, voies ferrées) et PEB DGAC
const roads = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[LON - 0.002, LAT + 0.0003], [LON + 0.002, LAT + 0.0003]] }, properties: { importance: '2', nature: 'Route à 2 chaussées', nom_voie_ban_gauche: 'Boulevard du Port', date_modification: '2026-05-01T00:00:00Z' } }] };
const empty = { type: 'FeatureCollection', features: [] };
const stops = { type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [LON + 0.001, LAT] }, properties: { stop_name: 'Beffroi', dataset_title: 'Réseau urbain Ametis', location_type: 0 } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [LON + 0.0011, LAT] }, properties: { stop_name: 'BEFFROI', dataset_title: 'Trains et cars régionaux', location_type: 0 } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [LON, LAT + 0.004] }, properties: { stop_name: 'Gare du Nord', dataset_title: 'Réseau urbain Ametis', location_type: 0 } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [LON, LAT + 0.02] }, properties: { stop_name: 'Trop loin', dataset_title: 'X', location_type: 0 } }] };
const stations = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [LON + 0.008, LAT] }, properties: { nature: 'Gare voyageurs uniquement', toponyme: "Gare d'Amiens" } }] };
const shopsFx = { millesime: '2025', categories: { B104: 'Hypermarché', B105: 'Supermarché', B201: 'Supérette', B202: 'Épicerie', B207: 'Boulangerie' },
  items: [[LAT + 0.002, LON, 'B207', 'AUX BONS PAINS', '1 RUE TEST'], [LAT + 0.004, LON, 'B105', 'SUPER TEST', '2 RUE TEST'], [LAT + 0.1, LON, 'B104', 'TROP LOIN', '']] };
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
    if (u.includes('/data/commerces/') && mode !== 'offline') return json(route, shopsFx);
    if (u.includes('/data/arcep/') && mode !== 'offline') return json(route, { date: '2026-06-30', communes: { '80021': { nom: 'Amiens', locaux: 91983, ftth: 89735, cable: 0, cuivre: 91982, thd_radio: 0, '4g_fixe': 91788, satellite: 91976, thd30: 91983, thd100: 91983, thd1g: 89735, inel_hd: 0 } } });
    if (u.startsWith('http://127.0.0.1')) return mode === 'offline' && u.includes('/data/') ? route.abort() : route.continue();
    if (u.includes('cdnjs.cloudflare.com/ajax/libs/leaflet') && LEAFLET) {
      const file = u.endsWith('.css') ? 'leaflet.css' : 'leaflet.js';
      return route.fulfill({ status: 200, contentType: file.endsWith('css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(LEAFLET, file)) });
    }
    if (mode === 'offline') return route.abort();
    const cors = { 'access-control-allow-origin': '*' };
    if (u.includes('/geocodage/search') || u.includes('api-adresse')) return json(route, ban);
    if (u.includes('dvf_opendata')) return json(route, u.includes('codtypbien=111') ? dvfMai : dvfApt);
    if (u.includes('dpe03existant')) return json(route, u.endsWith(',25') ? dpeSame : dpeNear);
    if (u.includes('georisques.gouv.fr/api/v1/rga') && u.includes('2.2958') && mode === 'empty-rga') return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '' });
    if (u.includes('georisques.gouv.fr/api/v1/')) { const k = u.split('/api/v1/')[1].split('?')[0]; return G[k] ? json(route, G[k]) : route.fulfill({ status: 404, headers: cors, body: '' }); }
    if (u.includes('gtfs-stops')) return json(route, stops);
    if (u.includes('/wfs/')) return json(route, u.includes('troncon_de_route') ? roads : u.includes('equipement_de_transport') ? stations : empty);
    if (u.includes('fr-en-annuaire-education')) return json(route, edu);
    if (u.includes('hubeau')) return json(route, hubeau);
    return route.fulfill({ status: 204, headers: cors, body: '' }); // tuiles, etc.
  });
}

(async () => {
  const srv = await serve(); const base = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch(); let failures = 0;
  const check = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) failures++; };

  // A. hors ligne : jamais de valeur inventée
  { const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await setup(page, 'offline'); await page.goto(base);
    await page.fill('#addr', '8 boulevard du Port Amiens'); await page.click('button[type=submit]');
    await page.waitForSelector('#search-msg .msg.error'); check(true, 'A: message explicite si la BAN est injoignable');
    check(await page.locator('#demo-btn, [data-run-demo]').count() === 0, 'A: aucun mode démo');
    await page.goto('about:blank'); await page.goto(base + '#a=8%20Boulevard%20du%20Port%2080000%20Amiens&lat=49.8941&lon=2.2958&c=80021');
    await page.waitForFunction(() => document.querySelectorAll('.src').length === 9, null, { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('#att-list').textContent.includes('Analyse en cours'));
    const txt = await page.textContent('#groups') + await page.textContent('#keyfigs');
    check(await page.locator('#coverage .st.error').count() === 9, 'A: 9 sources marquées « Indisponible »');
    check(!/exemple/i.test(txt) && !/€/.test(txt), 'A: aucune donnée d\'exemple ni aucun prix affiché');
    check(/Rapport incomplet/.test(await page.textContent('#missing-banner')), 'A: bandeau « rapport incomplet »');
    check(await page.locator('[data-retry]').count() === 9, 'A: bouton « Réessayer » sur chaque fiche');
    check(/Analyse incomplète/.test(await page.textContent('#att-list')) && await page.locator('#fort-list li').count() === 1, 'A: synthèse signale l\'analyse incomplète, aucun point fort inventé');
    check(errs.length === 0, 'A: aucune erreur JS ' + errs.join(' | '));
    await page.screenshot({ path: path.join(OUT, 'hors-ligne.png'), fullPage: true }); await page.close(); }

  // C. pannes partielles : Hub'Eau en panne puis rétabli ; Géorisques « argiles » en panne
  { const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    let waterDown = true;
    await setup(page, 'live'); // la route déclarée en dernier est prioritaire
    await page.route(/hubeau|\/api\/v1\/rga/, r => (waterDown || r.request().url().includes('/rga')) ? r.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: '' }) : r.fallback()); await page.goto(base + '#a=8%20Boulevard%20du%20Port%2080000%20Amiens&lat=49.8941&lon=2.2958&c=80021&id=80021_6590_00008');
    await page.waitForFunction(() => !document.querySelector('#att-list').textContent.includes('Analyse en cours'), null, { timeout: 30000 });
    check(/Information non disponible/.test(await page.textContent('#card-water')), 'C: eau indisponible signalée, sans valeur');
    check(/Non vérifié.*argiles/.test(await page.textContent('#card-georisques')), 'C: argiles « non vérifié » dans la fiche risques');
    check(/Risques non vérifiés : argiles/.test(await page.textContent('#att-list')) && !/Aucun risque/.test(await page.textContent('#fort-list')), 'C: pas de « aucun risque » quand un thème manque');
    waterDown = false; await page.click('#card-water [data-retry]');
    await page.waitForFunction(() => /non-conformité/.test(document.querySelector('#card-water').textContent), null, { timeout: 15000 });
    check(true, 'C: « Réessayer » recharge la source rétablie');
    check(!/Eau/.test(await page.textContent('#missing-banner')), 'C: bandeau mis à jour après la nouvelle tentative');
    check(errs.length === 0, 'C: aucune erreur JS ' + errs.join(' | ')); await page.close(); }

  // D. « argiles » renvoie un corps vide : non concerné, pas « non vérifié »
  { const page = await browser.newPage(); await setup(page, 'empty-rga');
    await page.goto(base + '#a=8%20Boulevard%20du%20Port%2080000%20Amiens&lat=49.8941&lon=2.2958&c=80021');
    await page.waitForFunction(() => !document.querySelector('#att-list').textContent.includes('Analyse en cours'), null, { timeout: 30000 });
    const g = await page.textContent('#card-georisques');
    check(!/Non vérifié/.test(g) && /Aucune zone d'exposition cartographiée/.test(g), 'D: corps vide « argiles » = aucune zone cartographiée, pas une panne');
    await page.close(); }

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
    check(await page.locator('#coverage .st.live').count() === 10, 'B: 10 sources réelles → ' + cov.map(c => c.slice(0, 30)).join(' / '));
    const dvf = await page.textContent('#card-dvf'); check(/€/.test(dvf) && /30 ventes/.test(dvf), 'B: DVF agrégé (30 ventes, dépendance exclue)');
    check(/Classe D/.test(await page.textContent('#card-dpe')), 'B: DPE de l\'adresse (identifiant BAN)');
    check(/Inondation/.test(await page.textContent('#att-list')), 'B: risque inondation en point d\'attention');
    check(!/Séisme/.test(await page.textContent('#att-list')), 'B: séisme zone 1 non signalé');
    check(/Répartition des 20 DPE/.test(await page.textContent('#card-dpe')), 'B: répartition des DPE voisins');
    check(/7 arrêtés/.test(await page.textContent('#att-list')), 'B: arrêtés CatNat');
    check(/Modérée/.test(await page.textContent('#card-noise')), 'B: bruit modéré (route principale à ~33 m)');
    check(/Seveso/.test(await page.textContent('#att-list')), 'B: installation Seveso à moins de 1 km signalée');
    check(!/Lycée fermé/.test(await page.textContent('#card-schools')), 'B: établissements fermés exclus');
    check(/1 non-conformité/.test(await page.textContent('#card-water')), 'B: Hub\'Eau dédoublonné par prélèvement');
    const tr = await page.textContent('#card-transport');
    check(/Beffroi/.test(tr) && /Ametis, Trains et cars/.test(tr) && !/Trop loin/.test(tr), 'B: arrêts dédoublonnés par nom, réseaux fusionnés, rayon respecté');
    check(/Gare d'Amiens/.test(tr), 'B: gare BD TOPO');
    const sh = await page.textContent('#card-shops');
    check(/SUPER TEST/.test(sh) && !/TROP LOIN/.test(sh), 'B: commerces dans le rayon de 1 km');
    check(/Supermarché à 4/.test(await page.textContent('#fort-list')), 'B: supermarché en point fort');
    check(await page.locator('#keyfigs .kf').count() === 8 && !/…/.test(await page.textContent('#keyfigs')), 'B: 8 chiffres clés renseignés');
    check(/✓ 10\/10/.test(await page.textContent('#cov-chip')), 'B: indicateur 10/10 sources');
    check(await page.evaluate(() => document.body.classList.contains('has-report') && getComputedStyle(document.querySelector('.hero h1')).display === 'none'), 'B: recherche compactée pendant le rapport');
    check(/97,6 %/.test(await page.textContent('#card-arcep')), 'B: Arcep : 97,6 % de locaux raccordables à la fibre');
    check(await page.locator('.src').count() === 9 && /Consulté le/.test(await page.textContent('.src')), 'B: source + date sur chaque fiche');
    check(await page.locator('.leaflet-interactive').count() > 10, 'B: couches sur la carte');
    check(/lat=49\.894100/.test(page.url()), 'B: URL partageable');
    check(errs.length === 0, 'B: aucune erreur JS ' + errs.join(' | '));
    await page.screenshot({ path: path.join(OUT, 'rapport.png'), fullPage: true });
    // lien partagé rouvert sur mobile
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } }); await setup(m, 'live'); await m.goto(page.url());
    await m.waitForFunction(() => document.querySelectorAll('.src').length === 9);
    const sw = await m.evaluate(() => document.documentElement.scrollWidth); check(sw <= 390, 'B: mobile sans défilement horizontal (' + sw + 'px)');
    await m.screenshot({ path: path.join(OUT, 'rapport-mobile.png'), fullPage: true }); }

  await browser.close(); srv.close();
  console.log(failures ? `${failures} échec(s)` : 'Tous les tests passent'); process.exit(failures ? 1 : 0);
})();
