# Schlumpfwelt – Entwicklungsplan

Stand: 30.10.2026 · Basis: README (Insel, eigenes Dorf, kleine Wirtschaftssimulation, Geld verdienen, Dinge kaufen, Aufbauspiel-Genre)

## 1. Vision in einem Satz

Ein gemütliches 2D-Aufbauspiel: Der Spieler baut auf einer Insel ein Dorf, kleine Bewohner sammeln Rohstoffe, verarbeiten sie in Produktionsketten, verkaufen Waren – und vom Geld kauft man Gebäude, Deko und Erweiterungen für die Insel.

**Zielgruppe:** Familie / Kinder + Hobby-Spaß. Kein Kampf, kein Zeitdruck, kein „Game Over“.

## 2. Wichtiger Hinweis: Rechte an den Schlümpfen

„Die Schlümpfe“ sind eine geschützte Marke (Peyo / IMPS). Für ein **rein privates** Spiel zu Hause ist das unkritisch. Sobald das Spiel **veröffentlicht** wird (auch kostenlos auf GitHub/itch.io), braucht es eigene Figuren und einen eigenen Namen.

**Empfehlung:** Die Bewohner im Code neutral benennen (`Bewohner`, `villager`) und Name, Grafiken und Texte in einer Theme-Datei bündeln. Dann ist ein Umbenennen später eine Sache von Minuten.

## 3. Technologie-Entscheidung

| Option | Pro | Contra |
|---|---|---|
| **Python + pygame-ce** ✅ | Python ist dir vertraut, läuft unter Ubuntu, sehr einfacher Einstieg, volle Kontrolle | Benutzeroberfläche (Menüs, Buttons) muss man selbst bauen |
| Python + Arcade | Modernere API, eingebaute GUI-Elemente | Kleinere Community |
| Godot (GDScript) | Professionelle Engine, Editor, Export auf Web/Handy | Neues Werkzeug und neue Sprache lernen |

**Empfehlung: Python 3.12 + pygame-ce**, Kartenansicht von oben (Top-Down, Kachelraster). Isometrische Ansicht (Siedler-Look) ist reizvoll, kostet aber deutlich mehr Grafik- und Rechenaufwand – erst später als Option.

Weitere Bausteine:
- **Spieldaten in JSON/YAML** (Gebäude, Waren, Preise, Rezepte) → Balancing ohne Code-Änderungen
- **pytest** für die Wirtschaftslogik (läuft ohne Grafik)
- **Grafik:** zum Start freie Assets (z. B. Kenney.nl, CC0), später eigene
- **Speichern:** JSON-Spielstand

## 4. Architektur (Grundidee)

Die wichtigste Regel: **Simulation und Darstellung strikt trennen.** Die Wirtschaft läuft als reines Python ohne pygame – dadurch testbar, schneller zu entwickeln und später austauschbar.

```
schlumpfwelt/
├── main.py                 # Start, Spielschleife
├── sim/                    # Reine Spiellogik, kein pygame
│   ├── world.py            # Insel, Kachelraster, Gelände
│   ├── buildings.py        # Gebäude, Bauplätze, Bauzustand
│   ├── economy.py          # Lager, Waren, Produktionsketten, Markt
│   ├── villagers.py        # Bewohner, Jobs, Bedürfnisse
│   ├── pathfinding.py      # Wege (A*)
│   └── clock.py            # Feste Simulations-Ticks (z. B. 10/s)
├── ui/                     # pygame: Zeichnen, Kamera, Eingabe, Menüs
├── data/                   # buildings.json, goods.json, shop.json, theme.json
├── assets/                 # Grafiken, Sounds
├── saves/
└── tests/
```

## 5. Spielmechanik – erste Version

**Rohstoffe & Ketten (bewusst klein halten):**

| Gebäude | braucht | erzeugt |
|---|---|---|
| Holzfällerhütte | Bäume in der Nähe | Holz |
| Steinbruch | Felsen | Stein |
| Beerensammler | Büsche | Beeren |
| Sägewerk | Holz | Bretter |
| Bäckerei / Küche | Beeren | Kuchen |
| Marktplatz | Waren | **Geld** |

**Kreislauf:** Sammeln → Verarbeiten → Verkaufen → Geld → Shop (neue Gebäude, Deko, Insel-Erweiterungen, mehr Bewohner) → mehr Produktion.

**Bewohner:** Jeder hat einen Job, läuft sichtbar zwischen Arbeitsplatz und Lager hin und her (das macht den Siedler-Charme aus). Einfaches Bedürfnis „Essen“ – satte Bewohner arbeiten schneller.

**Shop:** Pilzhäuser, Brücken, Brunnen, Gärten, neue Inselteile, besondere Gebäude (z. B. ein Labor mit lustigen Effekten).

## 6. Roadmap in Meilensteinen

Jeder Meilenstein endet mit etwas **Spielbarem**. Aufwand grob geschätzt für Hobby-Tempo mit KI-Unterstützung (Abende/Wochenenden).

| # | Meilenstein | Ergebnis | Aufwand |
|---|---|---|---|
| **M0** | Fundament | Projektstruktur, pygame-Fenster, Spielschleife, Tests, GitHub Actions | 1 Abend |
| **M1** | Die Insel | Insel aus Kacheln (Wasser, Gras, Wald, Fels), Kamera scrollen/zoomen | 1–2 Abende |
| **M2** | Bauen | Gebäude aus Menü wählen, auf freie Kacheln setzen, Baukosten | 2 Abende |
| **M3** | Wirtschaft (ohne Figuren) | Gebäude produzieren pro Tick ins zentrale Lager, Lageranzeige, Marktplatz verkauft → Geld | 2–3 Abende |
| **M4** | Shop | Geld ausgeben: neue Gebäude freischalten, Deko kaufen | 1–2 Abende |
| **M5** | Speichern/Laden | Spielstand als JSON | 1 Abend |
| — | **🎉 Erster spielbarer Prototyp** | | **~2–3 Wochen** |
| **M6** | Lebendige Bewohner | Figuren laufen per Wegfindung, tragen Waren, Wege bauen | 1–2 Wochen |
| **M7** | Bedürfnisse & Wachstum | Essen, Wohnhäuser, Bevölkerungswachstum | 1 Woche |
| **M8** | Look & Feel | Eigene Grafiken, Animationen, Tag/Nacht, Musik, Sounds | offen |
| **M9** | Ausbau | Insel-Erweiterungen, Aufträge/Quests, Ereignisse (Regen, Händlerschiff) | offen |
| **M10** | Optional | Isometrische Ansicht, Web-Version (pygbag), Android | offen |

**Bewusst die Wirtschaft (M3) vor den laufenden Figuren (M6):** So ist früh testbar, ob das Spiel Spaß macht, bevor die aufwendigste Technik gebaut wird.

## 7. Arbeitsweise

- **Branch pro Meilenstein**, Pull Request, kurz durchsehen, mergen
- **GitHub Issues** pro Meilenstein als Aufgabenliste
- **Tests** für `sim/` (Wirtschaft, Bauen, Speichern); UI wird durch Spielen getestet
- **Balancing-Tabelle** in `data/` – Preise und Produktionszeiten ohne Code-Änderung justieren
- **Spieletests mit der Zielgruppe** (Kinder?) nach M5 und M7

## 8. Offene Entscheidungen

1. **Für wen ist das Spiel?** Kinder (einfacher, bunter) oder du selbst (tiefere Wirtschaft)?
2. **Bleibt es privat?** Davon hängt der Umgang mit Name/Figuren ab (siehe Abschnitt 2).
3. **Ansicht:** Draufsicht zum Start okay, oder ist der Siedler-Iso-Look von Anfang an Pflicht?
4. **Plattform:** nur Ubuntu-PC, oder auch Windows/Browser/Tablet?
