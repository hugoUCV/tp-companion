# -*- coding: utf-8 -*-
"""Construye logos/catalog.json a partir de commons_results.json + selecciones manuales."""
import json

with open("commons_results.json", encoding="utf-8") as f:
    R = json.load(f)

CATEGORIES = [
    {"id": "simhw", "name": "Hardware simracing"},
    {"id": "coches", "name": "Fabricantes de coches"},
    {"id": "pc", "name": "PC / Tecnología"},
    {"id": "seguridad", "name": "Equipamiento y seguridad"},
    {"id": "neumaticos", "name": "Neumáticos"},
    {"id": "lubricantes", "name": "Combustible y lubricantes"},
    {"id": "tecnica", "name": "Técnica (frenos, llantas, escape...)"},
    {"id": "bebidas", "name": "Bebidas y energy"},
    {"id": "sponsors", "name": "Sponsors corporativos"},
]

# Verificados en la primera tanda (catálogo v0.1)
ORIGINALS = [
    ("logitech", "Logitech", "simhw", "Logitech_logo.svg"),
    ("thrustmaster", "Thrustmaster", "simhw", "Thrustmaster-Logo.svg"),
    ("amd", "AMD", "pc", "AMD_Logo.svg"),
    ("nvidia", "NVIDIA", "pc", "Nvidia_logo.svg"),
    ("intel", "Intel", "pc", "Intel_logo_2023.svg"),
    ("bosch", "Bosch", "tecnica", "Bosch-logo.svg"),
    ("alpinestars", "Alpinestars", "seguridad", "Alpinestars_logo.svg"),
    ("recaro", "Recaro", "seguridad", "Recaro_Logo.svg"),
    ("sabelt", "Sabelt", "seguridad", "Sabelt_logo.svg"),
    ("bell", "Bell Helmets", "seguridad", "Bell_Helmets_logo.svg"),
    ("momo", "MOMO", "seguridad", "Momo_Logo.svg"),
    ("pirelli", "Pirelli (clásico)", "neumaticos", "Pirelli_-_logo_black_(Italy,_1970).svg"),
    ("michelin", "Michelin", "neumaticos", "Michelin_Wordmark.svg"),
    ("castrol", "Castrol", "lubricantes", "Castrol_logo_2023.svg"),
    ("gulf", "Gulf", "lubricantes", "Gulf_Oil_logo.svg"),
    ("mobil", "Mobil", "lubricantes", "Mobil_logo.svg"),
    ("brembo", "Brembo", "tecnica", "Brembo_logo.svg"),
    ("ngk", "NGK", "tecnica", "Ngk_logo.svg"),
    ("redbull", "Red Bull", "bebidas", "Logo_of_Red_bull.svg"),
]

# Elegidos a mano de los resultados de búsqueda de la segunda tanda
PICKED = {
    "ferrari": "Ferrari wordmark.svg",
    "astonmartin": "Aston Martin wordmark.svg",
    "jaguar": "Jaguar 2001 wordmark.svg",
    "skoda": "Skoda-Auto-Logo-2011-present.svg",
    "ligier": "Logo Ligier.svg",
    "totalenergies": "TotalEnergies wordmark (2021-present).svg",
    "elf": "Elf brand textlogo.svg",
    "valvoline": "Valvoline company logo.svg",
    "liquimoly": "Liqui-moly.svg",
    "sunoco": "Sunoco 1999 logo.svg",
    "cepsa": "Cepsa.svg",
    "firestone": "Firestone.svg",
    "yokohama": "Yokohama (Unternehmen) logo.svg",
    "dunlop": "Logo-dunlop.svg",
    "kumho": "Kumho Tire logo (2023).svg",
    "razer": "Razer wordmark.svg",
    "rog": "ASUS ROG 2007 logo.svg",
    "msi": "Micro-Star International logo2020.svg",
    "nzxt": "Logo NZXT.svg",
    "apracing": "AP Racing 2026.svg",
    "bilstein": "Bilstein Logo.svg",
    "ohlins": "Öhlins", # placeholder, se corrige abajo
    "zf": "ZF logo STD Blue 3CC.svg",
    "schuberth": "Schuberth-logo.svg",
    "estrella": "Estrella Galicia escudo color vectorial HDJR.svg",
    "fedex": "FedEx Express.svg",
}
PICKED["ohlins"] = "Oehlins logo.svg"

# Ajustes sobre hits directos ambiguos
RENAME = {
    "alpine": ("Alpine Electronics", "pc"),  # el de Commons es la marca de audio
    "sachs": ("Sachs", "tecnica"),
    "mclaren": ("McLaren", "coches"),
    "porsche": ("Porsche (texto)", "coches"),
    "ferrari": ("Ferrari (texto)", "coches"),
    "astonmartin": ("Aston Martin (texto)", "coches"),
}

# Sin archivo decente en Commons: atajo de búsqueda
SEARCH_ONLY = [
    ("fanatec", "Fanatec", "simhw", "Fanatec logo png transparente"),
    ("moza", "MOZA Racing", "simhw", "MOZA Racing logo png transparente"),
    ("simucube", "Simucube", "simhw", "Simucube logo png transparente"),
    ("simagic", "Simagic", "simhw", "Simagic logo png transparente"),
    ("heusinkveld", "Heusinkveld", "simhw", "Heusinkveld logo png transparente"),
    ("cubecontrols", "Cube Controls", "simhw", "Cube Controls logo png transparente"),
    ("iracing", "iRacing", "simhw", "iRacing logo png transparente"),
    ("corsair", "Corsair", "pc", "Corsair gaming logo png transparente"),
    ("discord", "Discord", "pc", "Discord logo png transparente"),
    ("alfaromeo", "Alfa Romeo", "coches", "Alfa Romeo logo png transparente"),
    ("alpinecars", "Alpine (coches)", "coches", "Automobiles Alpine logo png transparente"),
    ("cadillac", "Cadillac", "coches", "Cadillac logo png transparente"),
    ("bentley", "Bentley", "coches", "Bentley logo png transparente"),
    ("lotus", "Lotus", "coches", "Lotus Cars logo png transparente"),
    ("pagani", "Pagani", "coches", "Pagani logo png transparente"),
    ("radical", "Radical", "coches", "Radical Sportscars logo png transparente"),
    ("ginetta", "Ginetta", "coches", "Ginetta logo png transparente"),
    ("sparco", "Sparco", "seguridad", "Sparco logo png transparente"),
    ("omp", "OMP Racing", "seguridad", "OMP Racing logo png transparente"),
    ("stilo", "Stilo", "seguridad", "Stilo helmets logo png transparente"),
    ("arai", "Arai", "seguridad", "Arai helmet logo png transparente"),
    ("simpson", "Simpson Race Products", "seguridad", "Simpson racing logo png transparente"),
    ("goodyear", "Goodyear", "neumaticos", "Goodyear logo png transparente"),
    ("shell", "Shell", "lubricantes", "Shell pecten logo png transparente"),
    ("bp", "BP", "lubricantes", "BP Helios logo png transparente"),
    ("pennzoil", "Pennzoil", "lubricantes", "Pennzoil logo png transparente"),
    ("vpracing", "VP Racing Fuels", "lubricantes", "VP Racing Fuels logo png transparente"),
    ("stp", "STP", "lubricantes", "STP racing logo png transparente"),
    ("akrapovic", "Akrapovič", "tecnica", "Akrapovic logo png transparente"),
    ("ozracing", "OZ Racing", "tecnica", "OZ Racing wheels logo png transparente"),
    ("enkei", "Enkei", "tecnica", "Enkei wheels logo png transparente"),
    ("rays", "Rays / Volk Racing", "tecnica", "Volk Racing Rays logo png transparente"),
    ("kn", "K&N", "tecnica", "K&N filters logo png transparente"),
    ("eibach", "Eibach", "tecnica", "Eibach logo png transparente"),
    ("garrett", "Garrett", "tecnica", "Garrett turbo logo png transparente"),
    ("borla", "Borla", "tecnica", "Borla exhaust logo png transparente"),
    ("magnaflow", "MagnaFlow", "tecnica", "MagnaFlow logo png transparente"),
    ("monster", "Monster Energy", "bebidas", "Monster Energy logo png transparente"),
    ("rockstar", "Rockstar Energy", "bebidas", "Rockstar Energy logo png transparente"),
    ("mahou", "Mahou", "bebidas", "Mahou cerveza logo png transparente"),
    ("jagermeister", "Jägermeister", "bebidas", "Jagermeister logo png transparente"),
    ("corona", "Corona", "bebidas", "Corona Extra logo png transparente"),
    ("rolex", "Rolex", "sponsors", "Rolex logo png transparente"),
    ("puma", "Puma", "sponsors", "Puma logo png transparente"),
    ("cryptocom", "Crypto.com", "sponsors", "Crypto.com logo png transparente"),
]

# Kits temáticos (solo ids con entrada "commons" para que todo descargue a la primera)
PACKS = [
    {"id": "gt3", "name": "Kit GT3", "logos": ["pirelli", "castrol", "brembo", "recaro", "bell", "redbull", "santander", "mobil"]},
    {"id": "endurance", "name": "Kit Endurance", "logos": ["michelin", "totalenergies", "gulf", "tagheuer", "dunlop", "apracing", "valvoline", "dallara"]},
    {"id": "clasico", "name": "Kit Clásico 70s", "logos": ["gulf", "martini", "elf", "firestone", "texaco", "sunoco", "heineken", "castrol"]},
    {"id": "streamer", "name": "Kit Streamer", "logos": ["logitech", "thrustmaster", "amd", "nvidia", "intel", "twitch", "youtube", "benq"]},
    {"id": "espanol", "name": "Kit Español", "logos": ["repsol", "santander", "movistar", "mapfre", "cepsa", "estrella", "telefonica"]},
]

logos = []
seen = set()

for bid, name, cat, f in ORIGINALS:
    logos.append({"id": bid, "name": name, "cat": cat, "commons": f})
    seen.add(bid)

searched = R.get("searched", {})
for bid, info in R.get("direct", {}).items():
    if bid in seen:
        continue
    name, cat = info["name"], info["cat"]
    if bid in RENAME:
        name, cat = RENAME[bid]
    logos.append({"id": bid, "name": name, "cat": cat, "commons": info["file"]})
    seen.add(bid)

for bid, f in PICKED.items():
    if bid in seen:
        continue
    info = searched.get(bid, {})
    name, cat = info.get("name", bid), info.get("cat", "sponsors")
    if bid in RENAME:
        name, cat = RENAME[bid]
    logos.append({"id": bid, "name": name, "cat": cat, "commons": f})
    seen.add(bid)

for bid, name, cat, q in SEARCH_ONLY:
    if bid in seen:
        continue
    logos.append({"id": bid, "name": name, "cat": cat, "search": q})
    seen.add(bid)

logos.sort(key=lambda l: (next(i for i, c in enumerate(CATEGORIES) if c["id"] == l["cat"]), l["name"].lower()))

# Sanidad: los packs solo pueden referenciar logos "commons" existentes
by_id = {l["id"]: l for l in logos}
for p in PACKS:
    bad = [x for x in p["logos"] if x not in by_id or "commons" not in by_id[x]]
    if bad:
        raise SystemExit(f"Pack {p['id']} referencia logos no-directos o inexistentes: {bad}")

catalog = {"categories": CATEGORIES, "packs": PACKS, "logos": logos}
with open("../logos/catalog.json", "w", encoding="utf-8") as f:
    json.dump(catalog, f, ensure_ascii=False, indent=1)

from collections import Counter
c = Counter(l["cat"] for l in logos)
direct_n = sum(1 for l in logos if "commons" in l)
print(f"TOTAL: {len(logos)} logos ({direct_n} directos, {len(logos)-direct_n} búsqueda)")
for cat in CATEGORIES:
    print(f"  {cat['name']}: {c.get(cat['id'], 0)}")
