# Schlumpfwelt – Entwicklungsplan

Stand: 30.10.2026 · Version 2 (nach Grilling-Runde)

## 1. Vision

Ein gemütliches Aufbauspiel im Browser für **Kinder von 6 bis 10 Jahren**: Auf einer Insel gestalten sie ihr eigenes Schlumpfdorf. Schlümpfe arbeiten, verdienen Geld, und davon kauft man Häuser, Deko und lädt neue Schlümpfe ein.

**Kern-Spaß: das Dorf gestalten.** Die Wirtschaft ist Mittel zum Zweck, nicht Selbstzweck.

## 2. Leitplanken (Entscheidungen)

| Thema | Entscheidung | Folge für das Design |
|---|---|---|
| Zielgruppe | Kinder 6–10 | Große Buttons, Symbole + kurze Sätze, max. 2-stufige Produktionsketten |
| Kern-Spaß | Gestalten | Viel Deko, verschieben/abreißen kostenlos, kein Platzmangel-Stress |
| Scheitern | Sanfter Druck | Hungrige/unglückliche Schlümpfe arbeiten langsamer – nichts geht kaputt, kein Game Over |
| Bauen | Freies Raster + Wege | Gebäude brauchen Wegeanschluss, Schlümpfe laufen auf Wegen |
| Wohnen | Spieler weist zu, welcher Schlumpf in welchem Haus wohnt | Wohnung nah am Arbeitsplatz = kurze Wege = mehr Ertrag |
| Neue Schlümpfe | Im Shop einladen | Schlümpfe sind die wertvollste Kaufware, jeder mit Name und Beruf |
| Texte | Kurze Sätze ok | Deutsch, Texte zentral in einer Datei |
| Spielzeit | Tageslimit durch Eltern | Schlümpfe gehen nach Ablauf „schlafen“, Einstellung mit Eltern-PIN |
| Extras | Musik & Sounds, Schlümpfe mit Namen, Tutorial | siehe Meilensteine |
| Plattform | Browser auf PC, Tablet, Handy | Touch-Bedienung gleichwertig zu Maus |
| Technik | Phaser 3 + TypeScript + Vite | siehe Abschnitt 4 |
| Speichern | Lokal im Browser | IndexedDB, plus Export/Import als Datei |
| Hosting | GitHub Pages (Repository ist öffentlich) | Automatisches Deployment bei jedem Push auf `main`, Adresse: squantomas.github.io/Schlumpfwelt |
| Grafik | KI-generiert | Stilvorgabe früh festlegen, bis dahin Platzhalter |
| Thema | Schlümpfe, nicht kommerziell | Seite ist öffentlich erreichbar → Markenrecht Peyo/IMPS beachten: Name, Figuren und Texte in einer Theme-Datei bündeln, damit ein Umbenennen jederzeit möglich ist |
| Arbeitsweise | Claude baut, Projektleitung testet und entscheidet | Kleine Meilensteine, jeder sofort im Browser spielbar |

## 3. Spieldesign

### Spielkreislauf
Sammeln → Verarbeiten → Verkaufen → **Geld** → Shop (Häuser, Deko, Schlümpfe, Inselteile) → schöneres, größeres Dorf.

### Produktionsketten (Start)
| Gebäude | Beruf | braucht | erzeugt |
|---|---|---|---|
| Holzfällerhütte | Holzfäller-Schlumpf | Bäume | Holz |
| Beerengarten | Gärtner-Schlumpf | – | Schlumpfbeeren |
| Steinbruch | Steinmetz-Schlumpf | Felsen | Stein |
| Schreinerei | Schreiner-Schlumpf | Holz | Möbel |
| Bäckerei | Bäcker-Schlumpf | Beeren | Beerenkuchen |
| Marktplatz | Händler-Schlumpf | Waren | Geld |

Bau-Materialien (Holz, Stein) werden fürs Bauen verbraucht, Endprodukte (Möbel, Kuchen) bringen auf dem Markt Geld. Kuchen ist zugleich Essen.

### Schlümpfe
- Name, Beruf, Mützenfarbe, Stimmung (fröhlich / normal / traurig) – antippen zeigt eine Karte
- **Zuhause**: Spieler zieht Schlumpf auf ein Haus. Wohnort nah an der Arbeit → mehr Ertrag
- **Bedürfnisse (sanft)**: Essen, ein Zuhause, Deko in der Nähe → Stimmung → Arbeitstempo
- Neue Schlümpfe kommen per Boot, nachdem man sie im Shop eingeladen hat. Voraussetzung: ein freies Haus

### Shop
Häuser (verschiedene Pilzhaus-Varianten), Deko (Blumen, Brunnen, Zäune, Bänke, Laternen), Produktionsgebäude, Schlümpfe, Insel-Erweiterungen.

### Tageslimit
- Eltern-Menü mit PIN: Minuten pro Tag
- Bei Ablauf: Abenddämmerung, Schlümpfe gehen ins Bett, Spiel speichert und pausiert
- Kein Ertrag im Hintergrund (kein Grund für Suchtschleifen)

## 4. Technik

- **Phaser 3 + TypeScript**, Build mit **Vite**
- **Simulation getrennt von Darstellung**: `src/sim/` ist reines TypeScript ohne Phaser → mit **Vitest** testbar
- **Spieldaten in JSON** (`src/data/`): Gebäude, Waren, Preise, Schlümpfe, Texte → Balancing ohne Code
- **Feste Simulations-Ticks** (z. B. 10/s), Darstellung interpoliert
- **Wegfindung**: A* auf dem Wegeraster
- **Speichern**: IndexedDB, Autosave jede Minute + Export/Import als `.json`
- **Touch**: Ziehen = Kamera, Zwei-Finger = Zoom, Tippen = Auswahl, Bauen per „Antippen + Bestätigen“ statt Drag & Drop
- **Deployment**: GitHub Actions baut bei jedem Push auf `main` und veröffentlicht auf **GitHub Pages**; Pull Requests werden vorher gebaut und getestet

```
src/
├── main.ts
├── sim/          # Welt, Gebäude, Wirtschaft, Schlümpfe, Wege, Uhr – kein Phaser
├── scenes/       # Phaser-Szenen: Boot, Insel, UI, Shop, Eltern
├── ui/           # Buttons, Karten, Dialoge
├── data/         # buildings.json, goods.json, smurfs.json, texts.de.json
└── save/         # IndexedDB, Export/Import
public/assets/    # Grafiken, Sounds
tests/
.github/workflows/  # Build, Tests, Deployment auf GitHub Pages
```

### Technische Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| **iPad/Safari löscht Browser-Speicher** nach 7 Tagen ohne Nutzung | Als Web-App zum Home-Bildschirm hinzufügen (PWA), Export-Knopf |
| Audio startet auf Tablets erst nach Berührung | Startbildschirm „Tippen zum Spielen“ |
| Leistung auf alten Tablets | Früh auf dem schwächsten Familiengerät testen, Anzahl Schlümpfe begrenzen |
| KI-Grafiken passen stilistisch nicht zusammen | Verbindlicher Stil-Leitfaden + feste Prompt-Vorlage, einheitliche Perspektive und Kachelgröße |
| Tageslimit lässt sich durch Browser-Löschen umgehen | Für 6–10-Jährige ausreichend; serverseitig nur bei Bedarf |

## 5. Roadmap

Jeder Meilenstein endet mit einer Version, die auf GitHub Pages läuft und auf dem Tablet getestet werden kann.

| # | Meilenstein | Ergebnis |
|---|---|---|
| **M0** | Fundament | Vite + Phaser + TS, Vitest, GitHub Actions + GitHub Pages – „Hallo Insel“ im Tablet-Browser |
| **M1** | Die Insel | Kachel-Insel (Wasser, Strand, Wiese, Wald, Fels), Kamera mit Touch und Maus |
| **M2** | Gestalten | Wege, Häuser, Deko setzen, verschieben, abreißen – **schon allein ein Spielzeug** |
| **M3** | Wirtschaft | Produktionsgebäude, Lager, Markt → Geld, Baukosten |
| **M4** | Shop | Häuser, Deko, Gebäude kaufen und freischalten |
| **M5** | Speichern | IndexedDB-Autosave, Export/Import, als Web-App installierbar |
| — | **Prototyp-Check (ohne Kinder)** | Projektleitung spielt selbst: Trägt die Schleife Gestalten + Geldverdienen? |
| **M6** | Schlümpfe | Namen, Berufe, laufen auf Wegen, tragen Waren, Einladen im Shop, Ankunft per Boot |
| **M7** | Wohnen & Stimmung | Häuser zuweisen, Wegelänge, Essen, Deko-Bonus, Stimmung → Arbeitstempo |
| **M8** | Kinderfreundlich | Tutorial (erste 5 Min), Eltern-Menü mit PIN und Tageslimit, Gute-Nacht-Sequenz |
| **M9** | Look & Sound | Stil-Leitfaden, KI-Grafiken, Animationen, Musik, Geräusche |
| — | **🎉 Erster Spieltest mit den Kindern** | Komplettes Spiel mit Tutorial, Grafik und Sound. Beobachten statt erklären, Erkenntnisse als Issues → fließen in M10 |
| **M10** | Ausbau | Insel-Erweiterungen, Aufträge, Ereignisse (Händlerschiff, Regenbogen), Jahreszeiten |

**Begründung der Reihenfolge:** Gestalten (M2) kommt vor der Wirtschaft, weil es der Kern-Spaß ist. Die laufenden Schlümpfe (M6) sind der technisch aufwendigste Teil und kommen erst, wenn die Grundschleife trägt. **Die Kinder testen erst nach M9**, damit ihr erster Eindruck ein fertig wirkendes Spiel mit Grafik, Sound und Tutorial ist – Platzhaltergrafik würde das Urteil verfälschen. Bis dahin testet die Projektleitung allein.

## 6. Arbeitsweise

- Ein GitHub Issue und ein Branch pro Meilenstein, Pull Request, Projektleitung testet die Vorschau und gibt frei
- Tests für `src/sim/`, die Oberfläche wird durch Spielen getestet
- Bis M9: Projektleitung testet jeden Meilenstein selbst (auch auf dem Tablet), Beobachtungen als Issues
- Nach M9: Spieltests mit den Kindern; Risiko: Erkenntnisse zur Kindertauglichkeit kommen spät – deshalb Bedienung und Texte schon vorher kritisch aus Kinderperspektive prüfen

## 7. Noch offen (klärbar später)

- Welche Geräte genau (iPad-Modell/Android)? → schwächstes Gerät als Referenz für die Leistung
- Gibt es Lieblingsschlümpfe der Kinder, die als Erstes auf die Insel sollen?
