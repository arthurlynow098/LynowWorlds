import json
import pathlib
import re
import argparse
from bs4 import BeautifulSoup

root = pathlib.Path(__file__).resolve().parents[1] / "data"
parser = argparse.ArgumentParser(description="Importar páginas do Games of Legends")
parser.add_argument("directory", type=pathlib.Path)
raw = parser.parse_args().directory
if not raw.is_dir():
    parser.error("Informe o diretório com as páginas dos mapas.")
official = json.loads((root / "official.json").read_text("utf8"))
def key(kills, deaths, assists, cs):
    return tuple(zip(kills, deaths, assists, cs))
index = {}
identity = {}
def named(names, kills, deaths, assists):
    return tuple(zip([v.split()[-1].casefold() for v in names],kills,deaths,assists))
for gid, game in official["games"].items():
    players = [p for t in game["teams"] for p in t["players"]]
    signature = key(*[[p[k] for p in players] for k in ["kills", "deaths", "assists", "cs"]])
    index.setdefault(signature, []).append(gid)
    identity.setdefault(named(*[[p[k] for p in players] for k in ["name","kills","deaths","assists"]]), []).append(gid)
target = root / "enriched.json"
out = json.loads(target.read_text("utf8")) if target.exists() else {}
for file in sorted(raw.glob("*-fullstats.html")):
    sourceid = file.name.split("-")[0]
    soup = BeautifulSoup(file.read_text("utf8"), "html.parser")
    rows = {}
    for row in soup.select("tr"):
        cells = [td.get_text(strip=True) for td in row.find_all(["td", "th"], recursive=False)]
        if len(cells) == 11:
            rows[cells[0]] = cells[1:]
    if not all(k in rows for k in ["Kills", "Deaths", "Assists", "CS", "Total damage to Champion"]):
        continue
    match = index.get(key(*[[int(v) for v in rows[k]] for k in ["Kills", "Deaths", "Assists", "CS"]]), [])
    if not match:
        match = identity.get(named(rows["Player"],*[[int(v) for v in rows[k]] for k in ["Kills","Deaths","Assists"]]),[])
    if len(match) != 1: continue
    gid = match[0]
    extra = {"source":"https://gol.gg/game/stats/"+sourceid+"/page-fullstats/", "damage": [int(v) for v in rows["Total damage to Champion"]]}
    fields = {"Vision Score":"vision", "DPM":"dpm", "GPM":"gpm", "Solo kills":"solo",
              "Objectives Stolen":"steals", "Damage dealt to turrets":"turretDamage",
              "Total damage taken":"taken", "Total Heals On Teammates":"heals",
              "GD@15":"gold15", "CSD@15":"cs15", "XPD@15":"xp15"}
    extra["advanced"] = {}
    for label, field in fields.items():
        if label in rows:
            extra["advanced"][field] = [float(v) if re.fullmatch(r"[+-]?\d+(?:\.\d+)?", v) else None for v in rows[label]]
    overview = raw / (sourceid+"-game.html")
    if overview.exists():
        html = overview.read_text("utf8")
        doc = BeautifulSoup(html, "html.parser")
        bans = [[i.get("alt") for i in label.parent.parent.select("img[alt]")] for label in doc.find_all(string=lambda s:s and s.strip()=="Bans")]
        if len(bans)==2: extra["bans"]=bans
        values = re.search(r"label:\s*'Gold',\s*data:\s*\[([-\d,\s]+)\]",html)
        if values:
            extra["gold"]=[int(n) for n in values[1].split(",") if n.strip()]
    out[gid]=extra
temp = target.with_suffix(".tmp")
temp.write_text(json.dumps(out,ensure_ascii=False),encoding="utf8")
temp.replace(target)
print(len(out),"mapas com dano absoluto.")
