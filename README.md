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

Ouvrez ensuite http://localhost:8000. Vous pouvez aussi ouvrir `index.html` directement dans un navigateur. Pour essayer sans réseau, utilisez le bouton **« Démo hors ligne »**.

Le test de fumée nécessite Playwright et Chromium :

```bash
node tests/smoke.test.js /chemin/vers/node_modules/leaflet/dist
```

Il couvre deux scénarios : le réseau coupé (repli explicite vers la démo) et des API simulées à partir de fixtures au format des API réelles (autocomplétion au clavier, agrégation DVF, DPE de l'adresse, risques, CatNat, bruit, écoles, eau, carte, URL partagée, absence de débordement sur mobile).

## Fonctionnalités (MVP)

1. **Adresse** : autocomplétion BAN (combobox accessible, navigation ↑ ↓, Entrée, Échap), puis géocodage.
2. **Fiches par thème** : prix, énergie, risques, bruit, connexion, écoles, eau, avec rendu progressif.
3. **Points d'attention et points forts** : des règles explicites, et chaque point renvoie à sa source.
4. **Carte** Leaflet : fond Plan IGN ou OSM, quatre couches activables (ventes, DPE, écoles, axes bruyants).
5. **Partage et impression** : lien `#lat=…&lon=…` qui recalcule le rapport à jour, `navigator.share` sur mobile, mise en page imprimable / PDF.

## Sources de données

| Thème | Source et accès | Format | Limites connues | Licence | État dans le prototype |
|---|---|---|---|---|---|
| Adresse | BAN : `data.geopf.fr/geocodage/search` (repli `api-adresse.data.gouv.fr/search`) | GeoJSON | ~50 requêtes/s/IP | Licence Ouverte 2.0 | Branchée |
| Prix | DVF géolocalisé (Etalab) : `files.data.gouv.fr/geo-dvf/latest/csv/{année}/communes/{dep}/{insee}.csv` | CSV, 1 ligne par lot | Publication semestrielle avec 6 à 12 mois de retard ; pas d'Alsace-Moselle ni de Mayotte ; ventes de la commune de l'adresse seulement | Licence Ouverte 2.0 | Branchée |
| Énergie | ADEME `dpe03existant` (data-fair) : `/lines?geo_distance=lon,lat,rayon` | JSON | DPE depuis juillet 2021 seulement ; 200 DPE maximum par requête | Licence Ouverte 2.0 | Branchée |
| Risques | Géorisques API v1 : `resultats_rapport_risque?latlon=` et `gaspar/catnat?code_insee=` | JSON | Ne remplace pas l'ERP officiel | Licence Ouverte 2.0 | Branchée |
| Bruit | OpenStreetMap via Overpass (`overpass-api.de`) | JSON | **Estimation** fondée sur la distance aux infrastructures, pas des décibels ; serveur public à quotas | ODbL 1.0 | Branchée |
| Connexion | Arcep, Ma connexion internet | — | **Pas d'API publique par adresse** | Licence Ouverte 2.0 | **Données d'exemple signalées** |
| Écoles | Annuaire de l'éducation (Opendatasoft v2.1) : `within_distance(position, …)` | JSON | Vol d'oiseau, la carte scolaire n'est pas prise en compte | Licence Ouverte 2.0 | Branchée |
| Eau | Hub'Eau `qualite_eau_potable/resultats_dis?code_commune=` | JSON | Échelle de la commune, pas du réseau précis | Licence Ouverte 2.0 | Branchée |
| Fonds de carte | Plan IGN (Géoplateforme WMTS), OSM | Tuiles | — | Licence Ouverte 2.0 / ODbL | Branchés |

> **Important : vérification.** L'environnement de développement de ce prototype n'avait pas accès à ces domaines (son proxy réseau les refuse). Les formats ci-dessus viennent de la documentation publique de chaque API, et le code a été testé contre des **fixtures reproduisant ces formats**, pas contre les API réelles. À la première exécution dans un navigateur normal, ouvrez la console et vérifiez chaque fiche. Une source qui ne répond pas comme prévu bascule proprement en « Exemple » ou « Indisponible » et indique la raison. Les noms de champs DPE sont lus de façon tolérante (plusieurs variantes), car l'ADEME a renommé ses colonnes en 2024. Points à surveiller en priorité : l'identifiant du jeu DPE (`dpe03existant`), le format de `geo_distance` côté data-fair, et la politique CORS de `files.data.gouv.fr`.

### Brancher Arcep (connexion)

Arcep ne propose pas d'API interrogeable par adresse. Le branchement passe donc par un petit back-end :
1. Télécharger chaque trimestre les fichiers « immeubles » (IPE) du marché du très haut débit fixe sur data.gouv.fr / data.arcep.fr. Ils donnent, pour chaque immeuble, l'adresse, l'identifiant BAN, l'état de raccordabilité et les opérateurs.
2. Les indexer par identifiant BAN, ou par géohash pour retrouver les immeubles proches.
3. Exposer `GET /arcep?ban_id=…` et l'appeler depuis `CONNECTORS.arcep`. La même méthode vaut pour la couverture mobile (cartes « Mon réseau mobile », sous forme de polygones).

## RGPD et vie privée

- Aucun compte, aucun cookie, aucun traceur, aucun stockage local.
- L'adresse est envoyée directement par le navigateur aux services publics listés, et à cdnjs pour Leaflet. Elle n'est enregistrée nulle part par le service lui-même.
- Le lien de partage contient l'adresse. Il ne faut le partager qu'en connaissance de cause.

## Accessibilité

Contrastes AA, focus visible, lien d'évitement, combobox ARIA (`aria-activedescendant`), zones `aria-live` pour les chargements et les erreurs, carte doublée par des tableaux textuels, information jamais portée par la seule couleur (les badges sont toujours textuels), respect de `prefers-reduced-motion`.

## Limites connues

- Les ventes DVF sont limitées à la commune de l'adresse : une adresse en limite de commune n'aura pas les ventes de la commune voisine.
- Le bruit est une estimation (distance aux axes). Pour des niveaux en décibels, il faut les cartes de bruit stratégiques et les PEB.
- La qualité de l'eau est donnée à l'échelle de la commune (unité de distribution non résolue).
- Les règles de synthèse reposent sur des seuils simples, à valider avec des professionnels (notaires, diagnostiqueurs).
- Les serveurs publics (Overpass notamment) ont des quotas, ce qui impose un cache côté serveur en production.

## Prochaines étapes

1. Valider chaque connecteur contre les API réelles et ajouter des tests de contrat (format des réponses).
2. Ajouter un back-end de cache et de proxy : TTL par source, respect des quotas, API agences (clé), traçabilité des millésimes.
3. Brancher Arcep (IPE) et les cartes de bruit stratégiques (Cerema).
4. Ajouter les **permis de construire alentour** (Sitadel, SDES) et le **plan local d'urbanisme** (API Carto / Géoportail de l'urbanisme).
5. Étendre DVF aux communes voisines, avec un rayon à la carte.
6. Produire un PDF horodaté et signé pour le rapport payant à l'acte.
