# Architecture : Ce logement, vraiment

## 1. Concurrence et positionnement

| Outil | Ce qu'il fait bien | Ce qui lui manque |
|---|---|---|
| **Explore DVF** (Etalab) | Prix réels de toutes les ventes, parcelle par parcelle, gratuit et officiel. | Un seul thème. Il faut cliquer sur la carte parcelle par parcelle, sans statistique de quartier ni lecture « pour un non-spécialiste ». |
| **Meilleurs Agents** | Estimation de prix immédiate, interface grand public très soignée. | Modèle propriétaire et opaque (on ne sait pas d'où vient le chiffre). Rien sur le DPE ou les risques. Le but est de capter des vendeurs pour des agences. |
| **Géorisques – mes risques** | Référence officielle des risques à l'adresse, avec rapport PDF. | Vocabulaire réglementaire. Rien sur le prix, l'énergie ou le cadre de vie. |

**Différenciation :** un seul rapport qui agrège 8 sources publiques, interrogées **en direct**, chaque chiffre accompagné de sa source, de sa licence et de sa date. Les données sont traduites en **points d'attention et points forts** en langage courant. L'écran d'accueil le montre avant même la première recherche, avec la grille des 8 sources et le tableau comparatif.

## 2. Composants

```
Navigateur (index.html, aucune dépendance de build ; Leaflet 1.9.4 via cdnjs)
│
├─ Saisie d'adresse ── combobox ARIA ──► BAN (data.geopf.fr/geocodage, repli api-adresse.data.gouv.fr)
│                                         → {label, lat, lon, citycode, id BAN}
│
├─ Orchestrateur  startReport(ctx)
│     ├─ 7 connecteurs lancés en parallèle (Promise.allSettled, délai max de 15 s chacun)
│     │    dvf · dpe · georisques(+catnat) · noise(Overpass) · arcep · schools · water(Hub'Eau)
│     │    chacun renvoie un résultat normalisé :
│     │    {status: live | sample | empty | error, data, reason, fetchedAt}
│     ├─ rendu progressif : chaque fiche s'affiche dès que sa source répond
│     └─ synthèse : des règles explicites (renderSynthesis) produisent les points d'attention et les points forts
│
├─ Carte Leaflet : fond Plan IGN ou OSM ; couches Ventes, DPE, Écoles, Axes bruyants
└─ Partage / impression : état encodé dans l'URL (#a=…&lat=…&lon=…&c=…), CSS @media print
```

## 3. Choix techniques justifiés

- **Une page HTML autonome, sans serveur.** Toutes les sources retenues acceptent les appels CORS. Le navigateur les interroge donc directement : rien à héberger côté back, aucun stockage, et donc aucun traitement de données personnelles par le service (RGPD). La page s'ouvre en double-cliquant dessus ou sur n'importe quel hébergement statique.
- **Vanilla JS plutôt qu'un framework.** Pas d'étape de build, code lisible en un seul fichier, chargement rapide sur mobile. Le passage à un framework n'aura de sens qu'avec le back-end (voir les prochaines étapes).
- **Connecteurs isolés, avec un contrat commun.** Chaque source est une fonction `CONNECTORS.x(ctx)`. En ajouter une revient à écrire un connecteur, un rendu et des règles de synthèse. Les URL sont regroupées dans `CONFIG.endpoints`.
- **Échec explicite plutôt qu'écran vide.** Une source peut aboutir à quatre états : données réelles, pas de donnée (avec l'explication et une piste), indisponible, ou exemple. Les données d'exemple sont générées de façon déterministe autour du point demandé et **toujours étiquetées** : badge, bandeau et mention « exemple » dans la synthèse. On peut les désactiver avec `CONFIG.fallbackToSample = false`.
- **Règles de synthèse lisibles plutôt qu'un score opaque.** Pour une décision à fort enjeu, chaque point affiché renvoie à sa source et à son seuil (par exemple : DPE F/G, risque présent, plus de 5 arrêtés CatNat, grand axe à moins de 200 m, école à moins de 500 m).

## 4. Cible de production (après le prototype)

Navigateur → **API « rapport »** (un back-end léger, en Node ou Python) avec un cache par adresse et par source (TTL alignés sur la fraîcheur des sources : DVF semestriel, DPE quotidien, Hub'Eau mensuel).
- Ingestion périodique des sources sans API : Arcep (IPE trimestriel), cartes de bruit stratégiques, Sitadel (permis de construire).
- Le même point d'accès sert l'**API pour agences** (clé, quotas) et le **rapport payant à l'acte** (PDF signé et horodaté avec les dates des sources).
