"""Gera lib/area-do-cliente/dados/cidades.json (a busca de cidade do mapa natal) a partir do GeoNames (CC BY 4.0).

O mundo com 15 mil habitantes ou mais, mais o Brasil com 5 mil ou mais (4,4 mil cidades brasileiras). Cada linha:
[geonameid, nome, país (ISO-2), estado, latitude, longitude, fuso IANA, população]. O fuso é o que dá a hora certa
do nascimento (com o horário de verão de cada época), por isso a fonte é o GeoNames e não uma lista sem fuso.

uso: python scripts/cidades-geonames.py <pasta com cities15000.zip, cities5000.zip e admin1CodesASCII.txt>
(baixados de https://download.geonames.org/export/dump/)
"""
import json, pathlib, sys, zipfile

pasta = pathlib.Path(sys.argv[1])
estados = {}
for l in (pasta / "admin1CodesASCII.txt").read_text(encoding="utf-8").splitlines():
    c = l.split("\t")
    estados[c[0]] = c[1]

def ler(n):
    with zipfile.ZipFile(pasta / f"cities{n}.zip") as z:
        return [l.split("\t") for l in z.read(f"cities{n}.txt").decode("utf-8").splitlines()]

linhas = {}
for c in ler(15000) + [c for c in ler(5000) if c[8] == "BR"]:
    linhas[int(c[0])] = [int(c[0]), c[1], c[8], estados.get(f"{c[8]}.{c[10]}", ""), round(float(c[4]), 3), round(float(c[5]), 3), c[17], int(c[14] or 0)]

saida = sorted(linhas.values(), key=lambda x: -x[7])
destino = pathlib.Path(__file__).resolve().parent.parent / "lib/area-do-cliente/dados/cidades.json"
destino.parent.mkdir(parents=True, exist_ok=True)
destino.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(saida), "cidades,", sum(1 for x in saida if x[2] == "BR"), "no Brasil,", destino.stat().st_size // 1024, "KB")
