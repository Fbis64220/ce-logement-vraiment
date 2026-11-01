# Ce logement, vraiment : prototype

Le rapport complet d'une adresse en France, construit uniquement sur des données ouvertes : prix des ventes voisines (DVF), DPE, risques (Géorisques et arrêtés CatNat), bruit, connexion, écoles et qualité de l'eau. Chaque fiche indique sa source, sa licence, la date de ses données et la date de consultation.

Voir [ARCHITECTURE.md](ARCHITECTURE.md) pour l'analyse de la concurrence, les composants et les choix techniques.

## Installation

Le projet n'a aucune dépendance et ne demande aucun build.

```bash
cd ce-logement-vraiment
```

```bash
python3 -m http.server 8000
```

Ouvrez ensuite http://localhost:8000. Le site ne fonctionne qu'avec un accès à internet : il n'utilise **aucune donnée d'exemple**.

Le test de fumée nécessite Playwright et Chromium :

```bash
node tests/smoke.test.js /chemin/vers/node_modules/leaflet/dist
```

Test contre les vraies API (réseau requis) :

```bash
node tests/live.test.js /chemin/vers/node_modules/leaflet/dist
```

Le test de fumée hors ligne couvre trois scénarios : le réseau coupé (chaque fiche indique « Information non disponible », sans aucune valeur), des pannes partielles (bouton « Réessayer », thèmes Géorisques « non vérifiés ») et des API simulées à partir de fixtures au format des API réelles (autocomplétion au clavier, agrégation DVF, DPE de l'adresse, risques, CatNat, bruit, écoles, eau, carte, URL partagée, absence de débordement sur mobile).

## Fonctionnalités (MVP)

1. **Adresse** : autocomplétion BAN (combobox accessible, navigation ↑ ↓, Entrée, Échap), puis géocodage.
2. **« En bref »** : 8 chiffres clés colorés (prix au m², DPE, risques, bruit, arrêt, supermarché, école, fibre), chacun relié à sa fiche.
3. **Fiches par thème**, regroupées en trois sections : *Le bien et son marché* (prix, DPE), *Environnement et risques* (risques, bruit, eau), *Vie quotidienne* (transports en commun, commerces alimentaires, écoles, connexion). Le rendu est progressif et un menu de navigation reste visible en haut d'écran.
4. **Points d'attention et points forts** : des règles explicites, et chaque point renvoie à sa source.
5. **Carte** Leaflet : fond Plan IGN ou OSM, sept couches activables (ventes, DPE, écoles, axes bruyants, industries et sites pollués, transports, commerces).
6. **Partage et impression** : lien `#lat=…&lon=…` qui recalcule le rapport à jour, `navigator.share` sur mobile, mise en page imprimable / PDF.

## Sources de données

Toutes les sources ci-dessous ont été **vérifiées contre les vraies API le 01/11/2026**, en-têtes CORS compris (voir `tests/live.test.js`).

| Thème | Source et accès | Format | Limites connues | Licence |
|---|---|---|---|---|
| Adresse | BAN : `data.geopf.fr/geocodage/search` (repli `api-adresse.data.gouv.fr`) | GeoJSON | ~50 requêtes/s/IP | Licence Ouverte 2.0 |
| Prix | **DVF+ open data (Cerema)** : `apidf-preprod.cerema.fr/dvf_opendata/geomutations/?in_bbox=…&codtypbien=121\|111` | GeoJSON (parcelles) | Ventes jusqu'au 31/12/2025 au 01/11/2026 ; 1,5 à 15 s de réponse ; pas d'Alsace-Moselle ni de Mayotte ; pas d'adresse, seulement la parcelle | Licence Ouverte 2.0 |
| Énergie | ADEME `dpe03existant` (data-fair) : `/lines?geo_distance=lon,lat,rayon` | JSON | DPE depuis juillet 2021 seulement ; 200 DPE maximum par requête | Licence Ouverte 2.0 |
| Risques | **Géorisques API v1 détaillée** : `gaspar/risques`, `gaspar/tri`, `gaspar/azi`, `zonage_sismique`, `rga`, `radon`, `installations_classees`, `ssp`, `cavites`, `mvt`, `gaspar/catnat` | JSON | Ne remplace pas l'état des risques (ERP) officiel | Licence Ouverte 2.0 |
| Bruit | **BD TOPO® IGN** (routes d'importance 1 à 3, voies ferrées en surface) et **PEB DGAC**, via le WFS `data.geopf.fr/wfs/ows` | GeoJSON | **Estimation** fondée sur la distance aux infrastructures, pas des décibels | Licence Ouverte 2.0 |
| Connexion | **Arcep – Ma connexion internet**, statistiques communales, converties en `data/arcep/<dep>.json` | JSON (précalculé) | Échelle de la commune, pas de l'adresse ; mise à jour trimestrielle | Licence Ouverte 2.0 |
| Transports | **Arrêts GTFS** de tous les réseaux publiés sur transport.data.gouv.fr (`/api/gtfs-stops?south=…&north=…&west=…&east=…`) et **gares, stations de métro et de tram** de la BD TOPO (WFS Géoplateforme) | GeoJSON | Seuls les réseaux qui publient leurs horaires apparaissent ; fréquences non prises en compte ; arrêts dédoublonnés par nom | Licence Ouverte 2.0 / ODbL selon le réseau |
| Commerces | **BPE 2025 de l'INSEE** (supermarchés, hypermarchés, supérettes, épiceries, boulangeries), convertie en `data/commerces/<dep>.json` | JSON (précalculé) | Photographie annuelle ; commerces à géolocalisation imprécise exclus (9 488 sur 101 028) ; département voisin non inclus | Licence Ouverte 2.0 |
| Écoles | Annuaire de l'éducation (Opendatasoft v2.1) : `within_distance(position, …)` | JSON | Vol d'oiseau, la carte scolaire n'est pas prise en compte | Licence Ouverte 2.0 |
| Eau | Hub'Eau `qualite_eau_potable/resultats_dis?code_commune=` | JSON | Échelle de la commune, pas du réseau précis | Licence Ouverte 2.0 |
| Fonds de carte | Plan IGN (Géoplateforme WMTS), OSM | Tuiles | — | Licence Ouverte 2.0 / ODbL |

### Pièges rencontrés (et contournés)

- **Fichiers DVF d'Etalab** (`files.data.gouv.fr/geo-dvf`) et **fichiers Arcep** (`data.arcep.fr`) : ils redirigent vers un stockage OVH sans en-tête CORS, donc le navigateur les refuse. DVF passe donc par l'API du Cerema. L'Arcep est précalculée par GitHub Actions.
- **Géorisques `resultats_rapport_risque`** : la connexion est coupée en HTTP/2, le protocole des navigateurs, et la réponse est vide en HTTP/1.1. Le rapport est donc reconstruit à partir des API détaillées, ce qui donne au passage des informations plus fines (TRI, cavités, sites pollués à moins de 500 m).
- **Overpass (OpenStreetMap)** : les serveurs publics sont saturés ou injoignables. Il est remplacé par la BD TOPO de l'IGN.
- **Dates CatNat** au format `jj/mm/aaaa` : converties avant le tri.

### Données précalculées par GitHub Actions

Deux sources ne sont pas lisibles directement par un navigateur. La première est trop volumineuse : la BPE de l'INSEE pèse environ 200 Mo. La seconde est servie sans CORS : les fichiers de l'Arcep. Un workflow mensuel les convertit en petits fichiers JSON par département, servis par GitHub Pages sur le même domaine que le site :

| Workflow | Script | Source | Sortie |
|---|---|---|---|
| `commerces.yml` (le 4 du mois) | `scripts/build_commerces.py` | `BPE<aa>.parquet` le plus récent de la page INSEE 8217525 | `data/commerces/` |
| `arcep.yml` (le 3 du mois) | `scripts/build_arcep.py` | statistiques communales « Ma connexion internet » | `data/arcep/` |

Les deux scripts refusent de publier si le fichier source semble incomplet. Le workflow `test-live.yml` lance le rapport complet sur plusieurs adresses dans un vrai navigateur, contre les API réelles, et publie des captures d'écran.

#### Détail Arcep

Le workflow `.github/workflows/arcep.yml` (le 3 de chaque mois, ou à la demande depuis l'onglet **Actions**) lance `scripts/build_arcep.py`. Le script télécharge `commune_techno.csv` et `commune_debit.csv`, vérifie leurs colonnes et refuse de publier s'il manque des départements. Il écrit ensuite un JSON par département dans `data/arcep/` et le commite. GitHub Pages sert ces fichiers sur le même domaine que le site.

## Pas de remplissage

Le rapport n'affiche **que des données réelles**. Si une source ne répond pas :
- sa fiche indique « Information non disponible », avec la raison et un bouton **Réessayer** ;
- un bandeau « Rapport incomplet » liste les sources manquantes ;
- la synthèse ajoute un point d'attention « Analyse incomplète » et ne conclut jamais à l'absence de risque sur un thème non vérifié (par exemple si l'API « argiles » de Géorisques n'a pas répondu).

## RGPD et vie privée

- Aucun compte, aucun cookie, aucun traceur, aucun stockage local.
- L'adresse est envoyée directement par le navigateur aux services publics listés, et à cdnjs pour Leaflet. Elle n'est enregistrée nulle part par le service lui-même.
- Le lien de partage contient l'adresse. Il ne faut le partager qu'en connaissance de cause.

## Accessibilité

Contrastes AA, focus visible, lien d'évitement, combobox ARIA (`aria-activedescendant`), zones `aria-live` pour les chargements et les erreurs, carte doublée par des tableaux textuels, information jamais portée par la seule couleur (les badges sont toujours textuels), respect de `prefers-reduced-motion`.

## Limites connues

- Les ventes DVF sont limitées à la commune de l'adresse : une adresse en limite de commune n'aura pas les ventes de la commune voisine.
- Le bruit est une estimation (distance aux axes). Les cartes de bruit stratégiques officielles ne sont publiées sur la Géoplateforme que pour un seul département (Ardennes) au 01/11/2026.
- Transports et commerces : distances à vol d'oiseau, sans les fréquences de passage ni les horaires d'ouverture.
- La connexion internet est donnée à l'échelle de la commune. L'éligibilité à l'adresse (base IMB de l'Arcep, plusieurs Go) demanderait un back-end.
- DVF : l'API du Cerema peut mettre 15 s à répondre à froid sur un centre-ville dense.
- La qualité de l'eau est donnée à l'échelle de la commune (unité de distribution non résolue).
- Les règles de synthèse reposent sur des seuils simples, à valider avec des professionnels (notaires, diagnostiqueurs).
- Les serveurs publics (Overpass notamment) ont des quotas, ce qui impose un cache côté serveur en production.

## Prochaines étapes

1. Valider chaque connecteur contre les API réelles et ajouter des tests de contrat (format des réponses).
2. Ajouter un back-end de cache et de proxy : TTL par source, respect des quotas, API agences (clé), traçabilité des millésimes.
3. Éligibilité fibre à l'adresse (base IMB de l'Arcep) et couverture mobile, via un back-end ; cartes de bruit stratégiques dès leur publication nationale.
4. Ajouter les **permis de construire alentour** (Sitadel, SDES) et le **plan local d'urbanisme** (API Carto / Géoportail de l'urbanisme).
5. Étendre DVF aux communes voisines, avec un rayon à la carte.
6. Produire un PDF horodaté et signé pour le rapport payant à l'acte.
