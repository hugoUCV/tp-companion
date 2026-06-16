# -*- coding: utf-8 -*-
"""Verifica candidatos de logos contra la API de Wikimedia Commons.
Salida: tools/commons_results.json + resumen compacto por stdout."""
import json
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "TPCompanionDev/1.0 (personal project; zizekrp02@gmail.com)"}
API = "https://commons.wikimedia.org/w/api.php"

# (id, nombre, categoria, [titulos candidatos sin "File:"], busqueda opcional)
BRANDS = [
    # --- Fabricantes ---
    ("ferrari", "Ferrari", "coches", ["Ferrari-Logo.svg", "Scuderia Ferrari Logo.svg", "Ferrari logo.svg"], None),
    ("porsche", "Porsche", "coches", ["Porsche logo.svg", "Porsche Wappen.svg", "Porsche wordmark.svg"], "Porsche crest"),
    ("bmw", "BMW", "coches", ["BMW.svg", "BMW logo (gray).svg"], None),
    ("bmwm", "BMW M", "coches", ["BMW M.svg", "BMW M logo.svg"], "BMW M motorsport"),
    ("mercedes", "Mercedes-Benz", "coches", ["Mercedes-Logo.svg", "Mercedes-Benz Star.svg", "Mercedes Benz Logo.svg"], None),
    ("amg", "Mercedes-AMG", "coches", ["Mercedes-AMG Logo.svg", "AMG Logo.svg"], "Mercedes AMG"),
    ("audi", "Audi", "coches", ["Audi-Logo 2016.svg", "Audi logo detail.svg"], None),
    ("lamborghini", "Lamborghini", "coches", ["Lamborghini Logo.svg", "Lamborghini logo.svg", "Automobili Lamborghini logo.svg"], None),
    ("mclaren", "McLaren", "coches", ["McLaren Racing logo.svg", "McLaren logo.svg", "McLaren Automotive logo.svg"], None),
    ("astonmartin", "Aston Martin", "coches", ["Aston Martin logo 2021.svg", "Aston Martin Lagonda logo.svg", "Aston Martin logo.svg"], None),
    ("toyota", "Toyota", "coches", ["Toyota logo.svg", "Toyota EU.svg", "Toyota carlogo.svg"], None),
    ("gazoo", "Toyota Gazoo Racing", "coches", ["Toyota Gazoo Racing logo.svg", "TOYOTA GAZOO Racing logo.svg"], "Gazoo Racing"),
    ("honda", "Honda", "coches", ["Honda Logo.svg", "Honda-logo.svg", "Honda logo.svg"], None),
    ("ford", "Ford", "coches", ["Ford logo flat.svg", "Ford Motor Company Logo.svg"], None),
    ("chevrolet", "Chevrolet", "coches", ["Chevrolet logo.svg", "Chevrolet-logo.svg", "Chevrolet.svg"], "Chevrolet bowtie"),
    ("dodge", "Dodge", "coches", ["Dodge logo.svg", "Dodge logo 2010.svg"], None),
    ("nissan", "Nissan", "coches", ["Nissan 2020 logo.svg", "Nissan logo.svg"], None),
    ("nismo", "Nismo", "coches", ["Nismo logo.svg", "NISMO logo.svg"], "Nismo"),
    ("mazda", "Mazda", "coches", ["Mazda logo with emblem.svg", "Mazda logo.svg"], None),
    ("hyundai", "Hyundai", "coches", ["Hyundai Motor Company logo.svg", "Hyundai logo.svg"], None),
    ("alpine", "Alpine (coches)", "coches", ["Automobiles Alpine logo.svg", "Alpine logo.svg"], "Automobiles Alpine"),
    ("renault", "Renault", "coches", ["Renault 2021 Text.svg", "Renault 2021.svg", "Renault Logo.svg"], None),
    ("peugeot", "Peugeot", "coches", ["Peugeot Logo 2021.svg", "Peugeot 2021 logo.svg", "Peugeot logo.svg"], "Peugeot lion 2021"),
    ("cadillac", "Cadillac", "coches", ["Cadillac logo.svg", "Cadillac logo 2021.svg"], "Cadillac crest"),
    ("acura", "Acura", "coches", ["Acura logo.svg", "Acura Logo.svg"], None),
    ("lexus", "Lexus", "coches", ["Lexus division emblem.svg", "Lexus logo.svg"], None),
    ("bentley", "Bentley", "coches", ["Bentley logo.svg", "Bentley Motors logo.svg"], "Bentley wings"),
    ("jaguar", "Jaguar", "coches", ["Jaguar Cars logo.svg", "Jaguar 2012 logo.svg", "Jaguar logo.svg"], "Jaguar cars"),
    ("alfaromeo", "Alfa Romeo", "coches", ["Alfa Romeo logo.svg", "Alfa Romeo 2015.svg", "Alfa Romeo logo 2015.svg"], None),
    ("mini", "MINI", "coches", ["MINI logo.svg", "Mini logo.svg"], "MINI BMW wings"),
    ("vw", "Volkswagen", "coches", ["Volkswagen logo 2019.svg", "Volkswagen Logo.svg"], None),
    ("skoda", "Škoda", "coches", ["Skoda Auto logo 2022.svg", "Skoda Auto logo.svg"], "Skoda auto"),
    ("subaru", "Subaru", "coches", ["Subaru logo.svg", "Subaru Logo.svg"], "Subaru stars"),
    ("mitsubishi", "Mitsubishi", "coches", ["Mitsubishi logo.svg", "Mitsubishi motors new logo.svg"], None),
    ("lotus", "Lotus", "coches", ["Lotus Cars logo.svg", "Lotus logo.svg"], "Lotus cars roundel"),
    ("bugatti", "Bugatti", "coches", ["Bugatti logo.svg", "Bugatti Automobiles logo.svg"], None),
    ("koenigsegg", "Koenigsegg", "coches", ["Koenigsegg logo.svg", "Koenigsegg wordmark.svg"], None),
    ("pagani", "Pagani", "coches", ["Pagani Automobili logo.svg", "Pagani logo.svg"], "Pagani automobili"),
    ("dallara", "Dallara", "coches", ["Dallara logo.svg", "Dallara Logo.svg"], "Dallara"),
    ("ligier", "Ligier", "coches", ["Ligier logo.svg"], "Ligier"),
    ("radical", "Radical", "coches", ["Radical Sportscars logo.svg"], "Radical sportscars"),
    ("ginetta", "Ginetta", "coches", ["Ginetta logo.svg"], "Ginetta cars"),
    # --- Combustible y lubricantes ---
    ("shell", "Shell", "lubricantes", ["Shell pecten.svg", "Shell logo.svg", "Royal Dutch Shell logo.svg"], "Shell pecten"),
    ("mobil1", "Mobil 1", "lubricantes", ["Mobil 1 logo.svg", "Mobil One logo.svg"], "Mobil 1"),
    ("totalenergies", "TotalEnergies", "lubricantes", ["TotalEnergies logo.svg", "TotalEnergies Logo.svg"], None),
    ("elf", "Elf", "lubricantes", ["Elf logo.svg", "ELF logo.svg", "Elf Aquitaine logo.svg"], "Elf aquitaine"),
    ("repsol", "Repsol", "lubricantes", ["Repsol logo.svg", "Repsol 2012 logo.svg", "Logo Repsol.svg"], "Repsol"),
    ("petronas", "Petronas", "lubricantes", ["Petronas 2013 logo.svg", "Petronas Logo.svg", "Petronas logo.svg"], "Petronas"),
    ("valvoline", "Valvoline", "lubricantes", ["Valvoline logo.svg", "Valvoline Inc. logo.svg"], "Valvoline"),
    ("motul", "Motul", "lubricantes", ["Motul logo.svg", "Motul Logo.svg"], "Motul"),
    ("liquimoly", "Liqui Moly", "lubricantes", ["Liqui Moly logo.svg", "Liqui-Moly logo.svg"], "Liqui Moly"),
    ("bp", "BP", "lubricantes", ["BP Helios logo.svg", "BP logo.svg"], None),
    ("texaco", "Texaco", "lubricantes", ["Texaco logo.svg", "Texaco Logo.svg"], "Texaco star"),
    ("sunoco", "Sunoco", "lubricantes", ["Sunoco logo.svg", "Sunoco Logo.svg"], "Sunoco"),
    ("pennzoil", "Pennzoil", "lubricantes", ["Pennzoil logo.svg"], "Pennzoil"),
    ("exxonmobil", "ExxonMobil", "lubricantes", ["ExxonMobil Logo.svg", "Exxon Mobil Logo.svg"], None),
    ("vpracing", "VP Racing", "lubricantes", ["VP Racing Fuels logo.svg"], "VP Racing Fuels"),
    ("stp", "STP", "lubricantes", ["STP logo.svg", "STP Logo.svg"], "STP oil"),
    ("cepsa", "Cepsa", "lubricantes", ["Cepsa logo.svg", "Logo Cepsa.svg"], "Cepsa"),
    # --- Neumáticos ---
    ("bridgestone", "Bridgestone", "neumaticos", ["Bridgestone logo.svg", "Bridgestone Corporation logo.svg"], None),
    ("firestone", "Firestone", "neumaticos", ["Firestone logo.svg", "Firestone Tire and Rubber Company logo.svg"], None),
    ("continental", "Continental", "neumaticos", ["Continental AG logo.svg", "Continental logo.svg"], None),
    ("yokohama", "Yokohama", "neumaticos", ["Yokohama Tire logo.svg", "The Yokohama Rubber Company logo.svg", "Yokohama Rubber Company logo.svg"], "Yokohama rubber"),
    ("dunlop", "Dunlop", "neumaticos", ["Dunlop logo.svg", "Dunlop Tyres logo.svg"], "Dunlop tyres"),
    ("falken", "Falken", "neumaticos", ["Falken Tire logo.svg", "Falken logo.svg"], "Falken tire"),
    ("toyo", "Toyo Tires", "neumaticos", ["Toyo Tires logo.svg", "Toyo Tire logo.svg"], "Toyo tires"),
    ("bfgoodrich", "BFGoodrich", "neumaticos", ["BFGoodrich logo.svg", "BF Goodrich logo.svg"], None),
    ("kumho", "Kumho", "neumaticos", ["Kumho Tire logo.svg", "Kumho Tires logo.svg"], "Kumho tire"),
    ("hankook", "Hankook", "neumaticos", ["Hankook Tire logo.svg", "Hankook logo.svg"], "Hankook tire"),
    ("goodyear", "Goodyear", "neumaticos", ["Goodyear Tire and Rubber Company logo.svg", "Goodyear wingfoot logo.svg"], "Goodyear wingfoot"),
    # --- PC / Tecnología ---
    ("corsair", "Corsair", "pc", ["Corsair logo.svg", "Corsair Gaming logo.svg"], "Corsair gaming"),
    ("razer", "Razer", "pc", ["Razer logo.svg", "Razer snake logo.svg"], "Razer"),
    ("asus", "ASUS", "pc", ["ASUS Logo.svg", "Asus logo.svg"], None),
    ("rog", "ROG (ASUS)", "pc", ["Republic of Gamers logo.svg", "ROG logo.svg"], "Republic of Gamers"),
    ("msi", "MSI", "pc", ["MSI Logo.svg", "Msi-Logo.svg", "MSI logo.svg"], "Micro-Star International"),
    ("gigabyte", "Gigabyte", "pc", ["Gigabyte Technology logo 20080107.svg", "Gigabyte logo.svg"], None),
    ("samsung", "Samsung", "pc", ["Samsung Logo.svg", "Samsung wordmark.svg"], None),
    ("lg", "LG", "pc", ["LG logo (2015).svg", "LG symbol.svg"], None),
    ("benq", "BenQ", "pc", ["BenQ logo.svg", "BenQ-Logo.svg"], "BenQ"),
    ("hp", "HP", "pc", ["HP logo 2012.svg", "HP New Logo 2D.svg"], None),
    ("dell", "Dell", "pc", ["Dell Logo.svg", "Dell logo 2016.svg"], None),
    ("microsoft", "Microsoft", "pc", ["Microsoft logo (2012).svg", "Microsoft logo.svg"], None),
    ("meta", "Meta", "pc", ["Meta Platforms Inc. logo.svg", "Meta-Logo.svg"], None),
    ("twitch", "Twitch", "pc", ["Twitch logo 2019.svg", "Twitch Glitch Logo Purple.svg", "Twitch logo.svg"], "Twitch"),
    ("youtube", "YouTube", "pc", ["YouTube Logo 2017.svg", "Logo of YouTube (2015-2017).svg"], None),
    ("discord", "Discord", "pc", ["Discord logo.svg", "Discord Logo.svg"], "Discord wordmark"),
    ("gopro", "GoPro", "pc", ["GoPro logo.svg", "GoPro Logo.svg"], "GoPro"),
    ("nzxt", "NZXT", "pc", ["NZXT logo.svg"], "NZXT"),
    ("iracing", "iRacing", "simhw", ["IRacing logo.svg", "IRacing-Logo.svg", "Iracing logo.svg"], "iRacing"),
    # --- Técnica ---
    ("ozracing", "OZ Racing", "tecnica", ["OZ Racing logo.svg", "OZ Group logo.svg"], "OZ wheels"),
    ("bbs", "BBS", "tecnica", ["BBS logo.svg", "BBS Kraftfahrzeugtechnik logo.svg"], "BBS wheels"),
    ("enkei", "Enkei", "tecnica", ["Enkei logo.svg"], "Enkei wheels"),
    ("rays", "Rays / Volk", "tecnica", ["Rays Engineering logo.svg"], "Rays wheels Volk"),
    ("apracing", "AP Racing", "tecnica", ["AP Racing logo.svg"], "AP Racing"),
    ("bilstein", "Bilstein", "tecnica", ["Bilstein logo.svg", "ThyssenKrupp Bilstein logo.svg"], "Bilstein"),
    ("eibach", "Eibach", "tecnica", ["Eibach logo.svg"], "Eibach springs"),
    ("ohlins", "Öhlins", "tecnica", ["Öhlins logo.svg", "Ohlins logo.svg"], "Ohlins"),
    ("sachs", "Sachs", "tecnica", ["Sachs logo.svg", "ZF Sachs logo.svg"], "Sachs"),
    ("zf", "ZF", "tecnica", ["ZF logo std blue.svg", "ZF Friedrichshafen AG logo.svg", "ZF logo.svg"], "ZF Friedrichshafen"),
    ("hella", "Hella", "tecnica", ["Hella Logo.svg", "HELLA Logo.svg", "Hella logo.svg"], "Hella"),
    ("kn", "K&N", "tecnica", ["K&N logo.svg", "K&N Engineering logo.svg"], "K&N filters"),
    ("denso", "Denso", "tecnica", ["Denso logo.svg", "DENSO logo.svg"], "Denso"),
    ("mahle", "Mahle", "tecnica", ["Mahle logo.svg", "MAHLE logo.svg"], "Mahle"),
    ("wurth", "Würth", "tecnica", ["Würth Logo.svg", "Wurth logo.svg", "Würth logo.svg"], "Wurth"),
    ("snapon", "Snap-on", "tecnica", ["Snap-on logo.svg", "Snap-on Logo.svg"], "Snap-on tools"),
    ("garrett", "Garrett", "tecnica", ["Garrett Motion logo.svg"], "Garrett turbo"),
    ("borla", "Borla", "tecnica", ["Borla logo.svg"], "Borla exhaust"),
    ("magnaflow", "MagnaFlow", "tecnica", ["MagnaFlow logo.svg"], "MagnaFlow"),
    # --- Seguridad ---
    ("schuberth", "Schuberth", "seguridad", ["Schuberth logo.svg", "Schuberth Logo.svg"], "Schuberth"),
    ("simpson", "Simpson", "seguridad", ["Simpson Performance Products logo.svg"], "Simpson racing helmets"),
    # --- Bebidas ---
    ("cocacola", "Coca-Cola", "bebidas", ["Coca-Cola logo.svg", "Coca-Cola wordmark.svg"], None),
    ("pepsi", "Pepsi", "bebidas", ["Pepsi logo 2014.svg", "Pepsi 2023.svg", "Pepsi logo (2014).svg"], "Pepsi globe"),
    ("heineken", "Heineken", "bebidas", ["Heineken logo.svg", "Heineken Logo.svg"], "Heineken"),
    ("estrella", "Estrella Galicia", "bebidas", ["Estrella Galicia logo.svg", "Logo Estrella Galicia.svg"], "Estrella Galicia"),
    ("mahou", "Mahou", "bebidas", ["Mahou logo.svg", "Logo Mahou.svg"], "Mahou cerveza"),
    ("martini", "Martini", "bebidas", ["Martini Logo.svg", "Martini logo.svg", "Martini & Rossi logo.svg"], "Martini Rossi"),
    ("jagermeister", "Jägermeister", "bebidas", ["Jägermeister logo.svg", "Jagermeister logo.svg"], "Jagermeister"),
    # --- Sponsors corporativos ---
    ("santander", "Santander", "sponsors", ["Banco Santander Logotipo.svg", "Santander logo.svg"], None),
    ("vodafone", "Vodafone", "sponsors", ["Vodafone logo 2017.svg", "Vodafone icon.svg", "Vodafone logo.svg"], None),
    ("orange", "Orange", "sponsors", ["Orange logo.svg"], None),
    ("movistar", "Movistar", "sponsors", ["Movistar logo.svg", "Movistar 2020 logo.svg", "Movistar Logo.svg"], "Movistar"),
    ("telefonica", "Telefónica", "sponsors", ["Telefonica 2021 logo.svg", "Telefonica Logo.svg", "Telefónica 2021 logo.svg"], "Telefonica"),
    ("mapfre", "Mapfre", "sponsors", ["Mapfre logo.svg", "MAPFRE logo.svg"], "Mapfre"),
    ("dhl", "DHL", "sponsors", ["DHL Logo.svg", "DHL Express logo.svg", "DHL logo.svg"], None),
    ("fedex", "FedEx", "sponsors", ["FedEx Logo.svg", "Fedex logo.svg", "FedEx Express logo.svg"], None),
    ("ups", "UPS", "sponsors", ["UPS Logo Shield 2017.svg", "United Parcel Service logo 2014.svg"], None),
    ("emirates", "Emirates", "sponsors", ["Emirates logo.svg", "Fly Emirates Logo.svg"], None),
    ("qatarairways", "Qatar Airways", "sponsors", ["Qatar Airways Logo.svg", "Qatar Airways logo.svg"], None),
    ("rolex", "Rolex", "sponsors", ["Rolex logo.svg", "Rolex Logo.svg"], "Rolex crown"),
    ("tagheuer", "TAG Heuer", "sponsors", ["TAG Heuer Logo.svg", "TAG Heuer logo.svg", "TAG HEUER logo.svg"], "TAG Heuer"),
    ("casio", "Casio", "sponsors", ["Casio logo.svg", "CASIO logo.svg"], "Casio"),
    ("puma", "Puma", "sponsors", ["Puma complete logo.svg", "Puma Logo.svg", "Puma AG.svg"], "Puma sportswear"),
    ("adidas", "Adidas", "sponsors", ["Adidas Logo.svg", "Adidas 2022 logo.svg"], None),
    ("nike", "Nike", "sponsors", ["Logo NIKE.svg", "Nike swoosh.svg"], None),
    ("oakley", "Oakley", "sponsors", ["Oakley logo.svg", "Oakley Inc. logo.svg"], "Oakley"),
    ("visa", "Visa", "sponsors", ["Visa Inc. logo.svg", "Visa 2021.svg"], None),
    ("mastercard", "Mastercard", "sponsors", ["Mastercard-logo.svg", "Mastercard 2019 logo.svg", "MasterCard Logo.svg"], None),
    ("allianz", "Allianz", "sponsors", ["Allianz logo.svg", "Allianz rebranded logo.svg"], None),
    ("cryptocom", "Crypto.com", "sponsors", ["Crypto.com logo.svg"], "Crypto.com"),
]


def api_get(params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(API + "?" + qs, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def batch_check(titles):
    """Devuelve dict titulo -> url (solo existentes). Maneja normalizacion."""
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i : i + 50]
        data = api_get({
            "action": "query", "format": "json", "prop": "imageinfo",
            "iiprop": "url", "titles": "|".join("File:" + t for t in chunk),
        })
        norm = {}  # titulo normalizado -> original
        for n in data.get("query", {}).get("normalized", []):
            norm[n["to"]] = n["from"]
        for page in data.get("query", {}).get("pages", {}).values():
            title = page.get("title", "")
            if "missing" in page or not page.get("imageinfo"):
                continue
            orig = norm.get(title, title)
            out[orig.replace("File:", "")] = page["imageinfo"][0]["url"]
        time.sleep(0.8)
    return out


def search(query):
    data = api_get({
        "action": "query", "format": "json", "list": "search",
        "srnamespace": 6, "srlimit": 5,
        "srsearch": "filetype:drawing " + query,
    })
    return [h["title"].replace("File:", "") for h in data.get("query", {}).get("search", [])]


def main():
    all_titles = [t for (_, _, _, cands, _) in BRANDS for t in cands]
    print(f"Comprobando {len(all_titles)} titulos de {len(BRANDS)} marcas...")
    existing = batch_check(all_titles)

    results = {}
    misses = []
    for bid, name, cat, cands, sq in BRANDS:
        hit = next((c for c in cands if c in existing), None)
        if hit:
            results[bid] = {"name": name, "cat": cat, "file": hit, "url": existing[hit]}
        else:
            misses.append((bid, name, cat, sq or (name + " logo")))

    print(f"\n== DIRECTOS: {len(results)} ==")
    for bid, r in sorted(results.items()):
        print(f"  {bid}: {r['file']}")

    print(f"\n== A BUSCAR: {len(misses)} ==")
    search_results = {}
    for bid, name, cat, q in misses:
        try:
            hits = search(q + " logo" if "logo" not in q.lower() else q)
        except Exception as e:
            hits = []
            print(f"  {bid}: ERROR {e}")
        search_results[bid] = {"name": name, "cat": cat, "query": q, "hits": hits}
        print(f"  {bid} [{q}]: " + (" | ".join(hits[:4]) if hits else "(nada)"))
        time.sleep(1.2)

    with open("commons_results.json", "w", encoding="utf-8") as f:
        json.dump({"direct": results, "searched": search_results}, f, ensure_ascii=False, indent=1)
    print("\nGuardado en commons_results.json")


if __name__ == "__main__":
    main()
