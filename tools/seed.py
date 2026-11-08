"""One-time: writes data/spinz.json with the seed crate and day one's picks."""
import json, re, pathlib

def key(artists, title):
    return re.sub(r"[^a-z0-9]+", "-", f"{artists} {title}".lower()).strip("-")

SEED_DATE = "2026-11-08"

# (title, artists, spotify id or None, lane)
CRATE = [
    ("Mystery of Raw", "Michael Bibi, KETTAMA", "2v4NP088R6LUgFBDF9JqBg", "groovy"),
    ("Bad Mofo", "Shaded", "6vmNhtVtpXqhDVKVHxobIW", "groovy"),
    ("Touch", "Max Styler, Gorgon City", "1gvM952Zuyl3cPZhEgS61d", "groovy"),
    ("Issa Vibe", "Wax Motif, BRKLYN", "2I5faAdg3IZbd6HEn6Blfz", "groovy"),
    ("One Thing", "Le Pard, Marcos Gonzalez", "1MvmvihrbRjxOYg7dgx2KD", "groovy"),
    ("World Hold On", "FISHER", None, "groovy"),
    ("Chill Like That", "Sunday Scaries, PiCKUPLiNES", "2NZABaUZUleW2mIuDlh5ZA", "groovy"),
    ("Lennon (Extended Mix)", "ESSEL", "6lsonzq6HYzNN5VEYIJMHR", "groovy"),
    ("Whispers In The Wind", "Michael Bibi", "3QUVgi7fLRKQL5j0irl5jd", "groovy"),
    ("Stay Missing", "Michael Bibi", "6vz72ILHpuCCpLujSl6roE", "groovy"),
    ("Hydroponic", "Dennis Cruz", "6jCvPv2lNJPUT1UITvlySF", "groovy"),
    ("Bocat (Michael Bibi Remix)", "Albertina, Guy Gerber", "32eqGAgvDMAucaoD7es7uv", "groovy"),
    ("Throw (Slam's RTM Remix)", "Paperclip People", "5Az5ZI6idNY1JbcIGVoBKE", "groovy"),
    ("Veins", "Hot Since 82", "0ZUYNjUthUJ0FVjUEOCDFb", "dark"),
    ("Voices In My Head", "Argy, Son of Son, Anyma", None, "dark"),
    ("Where I'm From", "Cassian, SCRIPT, Belladonna", "0JFNTfRWLqQ09z9ZHldX8d", "dark"),
    ("Landa", "Cassian", None, "dark"),
    ("Attack", "Rafael Cerato, Kinky Sound", "5jRTX1No8nYImLewdDVIez", "dark"),
    ("Roadkill", "Dubfire", "7m5buYqueKWdd0fWQW5AYw", "dark"),
    ("Siren Song", "CamelPhat, Eden", "4A96LpUrw3lJI6Bx10JU6u", "dark"),
    ("Helsinki Scorchin' (station2station Extended Mix)", "Super8 & Tab, station2station", "4xkRbhiPwIvE79PpvVdMyz", "dark"),
    ("The Sign (Kevin de Vries Remix)", "CamelPhat, Anyma", None, "dark"),
    ("Entrance", "Kevin de Vries, Add-us", "61qsLCbqMIYKWcHi0QRv9q", "dark"),
    ("Another World (Kevin de Vries & SLVR Remix)", "Meduza, Hayla, Kevin de Vries, SLVR", None, "dark"),
    ("Metro", "Kevin de Vries, Mau P", None, "dark"),
    ("Till I Die (feat. Claudia Valentina)", "Solomun, Anyma", "4pawR52ONFQTCYUzI6C2xZ", "dark"),
    ("Born Like That", "Kevin de Vries, Jast", None, "dark"),
    ("Pictures Of You", "Anyma", None, "dark"),
    ("Night After Night (CamelPhat Remix)", "Fideles, Be No Rain", None, "dark"),
    ("Set Me Free (CamelPhat Remix)", "Alex Wann, Aaron Hibell", None, "dark"),
    ("Love Parade", "Cassian, YOTTO, Da Hool", None, "dark"),
]

DAY_ONE = [
    ("Be Sharp Say Nowt", "Patrick Topping", "4MCulbFJ3EEPOmHXwxaFiW", "groovy",
     "A long, hypnotic roller in the same pocket as Bibi's Stay Missing and Hot Since 82's Veins."),
    ("Cola", "CamelPhat, Elderbrook", "0aL5jEWqfIwNDB3tdzyzH4", "dark",
     "CamelPhat's moody classic. A natural partner for Siren Song, already in your crate."),
    ("Grey", "Kölsch", "4rjA5kJJWbwU1prXCvg6Fk", "dark",
     "Dark and melodic but still on a house groove, the kind of bridge from your Bibi side into Cassian and Anyma."),
]

state = {
    "version": 1,
    "crate": [
        {"key": key(a, t), "title": t, "artists": a, "spotify": s, "lane": l, "role": None,
         "from": "seed", "added": SEED_DATE}
        for t, a, s, l in CRATE
    ],
    "inbox": [{"date": SEED_DATE, "picks": [
        {"key": key(a, t), "title": t, "artists": a, "spotify": s, "lane": l, "why": w}
        for t, a, s, l, w in DAY_ONE
    ]}],
    "history": [],
}
out = pathlib.Path(__file__).resolve().parent.parent / "data" / "spinz.json"
out.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(len(state["crate"]), "crate,", sum(len(d["picks"]) for d in state["inbox"]), "picks")
