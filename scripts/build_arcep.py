#!/usr/bin/env python3
"""Construit data/arcep/<département>.json à partir des statistiques communales
« Ma connexion internet » de l'Arcep (Licence Ouverte 2.0).

Les fichiers source redirigent vers un stockage sans en-têtes CORS : le navigateur
ne peut pas les lire directement. Ce script (lancé chaque mois par GitHub Actions)
les transforme en petits JSON servis par GitHub Pages, sur le même domaine que le site.

Usage : python3 scripts/build_arcep.py [dossier_csv_local]
"""
import csv, io, json, os, sys, urllib.request
from collections import defaultdict

BASE = "https://data.arcep.fr/fixe/maconnexioninternet/statistiques/last/commune/"
FILES = {
    "techno": ("commune_techno.csv", {"elig_ftth": "ftth", "elig_coax": "cable", "elig_cu": "cuivre", "elig_thdr": "thd_radio", "elig_4gf": "4g_fixe", "elig_sat": "satellite"}),
    "debit": ("commune_debit.csv", {"elig_thd30": "thd30", "elig_thd100": "thd100", "elig_thd1g": "thd1g", "inel_hd": "inel_hd"}),
}
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "arcep")

def read(name, local):
    if local:
        with open(os.path.join(local, name), encoding="utf-8-sig") as f:
            return f.read()
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "ce-logement-vraiment (github.com/Fbis64220/ce-logement-vraiment)"})
    with urllib.request.urlopen(req, timeout=120) as r:  # suit la redirection vers le stockage
        return r.read().decode("utf-8-sig")

def main():
    local = sys.argv[1] if len(sys.argv) > 1 else None
    deps = defaultdict(dict)
    date = ""
    for key, (name, cols) in FILES.items():
        rows = list(csv.DictReader(io.StringIO(read(name, local)), delimiter=";"))
        missing = [c for c in ["code_insee", "code_dep", "nbr", "type", "date", *cols] if c not in rows[0]]
        if missing:
            sys.exit(f"{name} : colonnes manquantes {missing} (format Arcep modifié ?)")
        for r in rows:
            if r["type"] != "all":
                continue
            c = deps[r["code_dep"]].setdefault(r["code_insee"], {"nom": r["nom_com"], "locaux": int(r["nbr"])})
            for src, dst in cols.items():
                c[dst] = int(r[src] or 0)
            date = max(date, r["date"])
    if len(deps) < 90:
        sys.exit(f"Seulement {len(deps)} départements lus : arrêt pour ne pas publier des données incomplètes")
    os.makedirs(OUT, exist_ok=True)
    meta = {"source": "Arcep – Ma connexion internet, statistiques communales", "licence": "Licence Ouverte 2.0",
            "url": "https://www.data.gouv.fr/datasets/ma-connexion-internet", "date": date}
    for dep, communes in deps.items():
        with open(os.path.join(OUT, f"{dep}.json"), "w", encoding="utf-8") as f:
            json.dump({**meta, "communes": communes}, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({**meta, "departements": sorted(deps)}, f, ensure_ascii=False, indent=1)
    print(f"{len(deps)} départements, {sum(len(c) for c in deps.values())} communes, données au {date}")

if __name__ == "__main__":
    main()
