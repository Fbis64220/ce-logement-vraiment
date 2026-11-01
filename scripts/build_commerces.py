#!/usr/bin/env python3
"""Construit data/commerces/<département>.json à partir de la Base permanente des
équipements (BPE) géolocalisée de l'INSEE (Licence Ouverte 2.0).

Le fichier national (Parquet, ~200 Mo) est trop lourd pour un navigateur : ce script,
lancé chaque mois par GitHub Actions, n'en garde que les commerces alimentaires
géolocalisés précisément, découpés par département.

Usage : python3 scripts/build_commerces.py [fichier.parquet local]
Dépendance : pyarrow
"""
import csv, io, json, os, re, sys, urllib.request
from collections import defaultdict
import pyarrow.parquet as pq

PAGE = "https://www.insee.fr/fr/statistiques/8217525"  # page « BPE – ensemble des équipements »
UA = {"User-Agent": "Mozilla/5.0 (ce-logement-vraiment; github.com/Fbis64220/ce-logement-vraiment)"}
# Codes de la nomenclature BPE (vérifiés sur les noms des établissements)
CODES = {"B104": "Hypermarché", "B105": "Supermarché", "B201": "Supérette", "B202": "Épicerie", "B207": "Boulangerie"}
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "commerces")

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read()

def latest_links():
    html = get(PAGE).decode("utf-8", "replace")
    parquet = re.findall(r'href="(/fr/statistiques/fichier/8217525/BPE(\d{2})\.parquet)"', html)
    if not parquet:
        sys.exit("Lien Parquet introuvable sur la page INSEE : structure modifiée ?")
    path, yy = max(parquet, key=lambda p: p[1])
    typequ = re.search(r'href="(/fr/metadonnees/source/fichier/TYPEQU_20\d\d\.csv)"', html)
    return "https://www.insee.fr" + path, "20" + yy, ("https://www.insee.fr" + typequ.group(1)) if typequ else None

def labels(url):
    """Libellés officiels des codes, si le fichier de nomenclature est lisible."""
    try:
        text = get(url).decode("utf-8-sig", "replace")
        rows = list(csv.reader(io.StringIO(text), delimiter=";" if text.count(";") > text.count(",") else ","))
        found = {r[0].strip(): r[1].strip() for r in rows if len(r) >= 2 and r[0].strip() in CODES}
        return {c: found.get(c) or CODES[c] for c in CODES}
    except Exception as e:  # la nomenclature n'est qu'un plus : on garde les libellés par défaut
        print("Nomenclature non lue :", e)
        return dict(CODES)

def main():
    if len(sys.argv) > 1:
        src, year, lib = sys.argv[1], "local", dict(CODES)
    else:
        url, year, typequ_url = latest_links()
        print("Source :", url)
        src = "bpe.parquet"
        with open(src, "wb") as f:
            f.write(get(url))
        lib = labels(typequ_url) if typequ_url else dict(CODES)
    cols = ["TYPEQU", "NOMRS", "CNOMRS", "DEP", "LATITUDE", "LONGITUDE", "QUALITE_XY", "LIBVOIE", "NUMVOIE", "TYPVOIE", "LIBCOM"]
    t = pq.read_table(src, columns=cols, filters=[("TYPEQU", "in", list(CODES))])
    deps, kept, dropped = defaultdict(list), 0, 0
    for r in t.to_pylist():
        # A = bonne, B = acceptable ; M (mauvaise) et non géolocalisés exclus : une distance fausse serait trompeuse
        if r["LATITUDE"] is None or r["LONGITUDE"] is None or r["QUALITE_XY"] not in ("A", "B"):
            dropped += 1
            continue
        name = (r["CNOMRS"] or "").strip() or (r["NOMRS"] or "").strip()
        addr = " ".join(x for x in [r["NUMVOIE"], r["TYPVOIE"], r["LIBVOIE"]] if x and x != "_Z").strip()
        deps[r["DEP"]].append([round(r["LATITUDE"], 5), round(r["LONGITUDE"], 5), r["TYPEQU"], name, addr])
        kept += 1
    if kept < 50000 or len(deps) < 95:
        sys.exit(f"Seulement {kept} commerces / {len(deps)} départements : arrêt pour ne pas publier des données incomplètes")
    os.makedirs(OUT, exist_ok=True)
    meta = {"source": "INSEE – Base permanente des équipements (BPE)", "millesime": year, "licence": "Licence Ouverte 2.0",
            "url": PAGE, "categories": lib, "champs": ["lat", "lon", "code", "nom", "adresse"]}
    for dep, items in deps.items():
        items.sort()
        with open(os.path.join(OUT, f"{dep}.json"), "w", encoding="utf-8") as f:
            json.dump({**meta, "items": items}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({**meta, "departements": sorted(deps), "commerces": kept, "exclus_geoloc_imprecise": dropped}, f, ensure_ascii=False, indent=1)
    print(f"{kept} commerces dans {len(deps)} départements ({dropped} exclus : géolocalisation absente ou imprécise), millésime {year}")

if __name__ == "__main__":
    main()
