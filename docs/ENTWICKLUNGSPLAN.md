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
| Arbeitsweise | M0–M9 laufen autonom (Claude-Agententeam, siehe `docs/PROMPT_M0-M9.md`), Projektleitung prüft nach M9 | Kleine Meilensteine, jeder sofort im Browser spielbar; Entscheidungen in `docs/ENTSCHEIDUNGEN.md` |

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

Bau-Materialien (Holz, Stein) werden fürs Bauen verbraucht, Endprodukte (Möbel, Kuchen) bringen auf dem Markt Geld. Kuchen ist zugleich Essen. Der Markt kauft zusätzlich überschüssige Beeren für wenig Geld (Reserve für die Bäckerei bleibt): So führt schon ein Beerengarten mit Markt immer wieder zu Geld, und der Holzfäller kostet nur Taler – man kann sich nie festspielen (Entscheidung M3, Korrekturrunde 1).

### Schlümpfe
- Name, Beruf, Mützenfarbe, Stimmung (fröhlich / normal / traurig, ab M7) – antippen zeigt eine Karte
- **Arbeit**: Jedes Produktionsgebäude hat sofort einen Arbeiter (ein freier Schlumpf oder ein neuer, der kostenlos mit dem Boot kommt). Die Schlümpfe tragen die Waren sichtbar zum Markt; der Ertrag hängt davon nicht ab, so bremsen sie die Wirtschaft nie (Entscheidung M6)
- **Zuhause**: Häuser haben Platz für 2–4 Schlümpfe; wer keins hat, zieht von selbst ins nächste Haus mit Platz (Entscheidung M6: kein Ziehen per Drag & Drop, kein Ertrag nach Wohnort – ein Umzug über die Karte ist ab M7 denkbar)
- **Bedürfnisse (sanft)**: Essen, ein Zuhause, Deko in der Nähe → Stimmung → Arbeitstempo
- Neue Schlümpfe kommen per Boot, nachdem man sie im Shop eingeladen hat (Reiter Häuser). Voraussetzung: ein freies Haus

### Shop
Ein Feld über der Insel mit vier Reitern: **Häuser** (Pilzhaus-Varianten: klein in Rot/Blau/Gelb, groß, mit Garten), **Deko** (Blumen, Beet, Busch, Zaun, Bank, Laterne, Teich, Brunnen), **Gebäude** (die sechs Produktionsgebäude), **Insel** (Baum pflanzen, Fels setzen, Strand aufschütten, Wiese anlegen – die Vorstufe der Insel-Erweiterungen aus M10). Seit M6 lädt man im Reiter Häuser auch Schlümpfe ein (erste Karte, braucht ein freies Haus). Alle Artikel, Preise, Reihenfolge und Bedingungen stehen in `src/data/buildings.json`.
- **Kaufen = Platzieren:** Ein Tipp auf eine Karte schließt den Shop und startet das Platzieren; bezahlt wird erst beim Setzen (✓), es gibt keinen Besitz-Bestand. Zu teure Karten sind grau, aber wählbar (der Hinweis sagt, was fehlt); gesperrte Karten zeigen ein Schloss und die Bedingung.
- **Freischaltungen** laufen automatisch über den Dorf-Fortschritt, ohne zweite Währung und ohne Extra-Zahlung: „N Gebäude vom Typ X stehen“ (z. B. Schreinerei und Steinbruch nach dem ersten Holzfäller), „N Häuser stehen“, „der Markt hat N Taler verdient“. Ist eine Bedingung einmal erfüllt, bleibt der Artikel für immer frei. Neues im Shop wird gemeldet (Meldung, Stern). Was man zum Weiterkommen braucht (Holzfäller, Beerengarten, Markt), ist nie gesperrt.
- **Insel gestalten:** Baum und Fels (Wiese → Wald/Fels, zählen für Holzfäller und Steinbruch; nur selbst Gepflanztes lässt sich mit Erstattung wieder abreißen), Strand aufschütten (Wasser am Land, endgültig) und Wiese anlegen (Strand → Wiese, endgültig); die Insel bleibt von Wasser umgeben.

### Tageslimit
- Eltern-Menü mit PIN: Minuten pro Tag
- Bei Ablauf: Abenddämmerung, Schlümpfe gehen ins Bett, Spiel speichert und pausiert
- Kein Ertrag im Hintergrund (kein Grund für Suchtschleifen)

## 4. Technik

- **Phaser 3 + TypeScript**, Build mit **Vite**
- **Simulation getrennt von Darstellung**: `src/sim/` ist reines TypeScript ohne Phaser → mit **Vitest** testbar
- **Spieldaten in JSON** (`src/data/`): Gebäude, Waren, Preise, Schlümpfe, Texte → Balancing ohne Code
- **Feste Simulations-Ticks** (z. B. 10/s), Darstellung interpoliert
- **Wegfindung**: A* auf dem Kachelraster – Wege sind billig und schnell, Wiese geht auch (langsamer), Gebäude nur im Notfall, Wasser nie
- **Speichern**: IndexedDB, Autosave jede Minute + Export/Import als `.json`
- **Touch**: Ziehen = Kamera, Zwei-Finger = Zoom, Tippen = Auswahl, Bauen per „Antippen + Bestätigen“ statt Drag & Drop
- **Deployment**: GitHub Actions baut bei jedem Push auf `main` und veröffentlicht auf **GitHub Pages**; Pull Requests werden vorher gebaut und getestet

```
src/
├── main.ts
├── sim/          # Welt, Gebäude, Wirtschaft, Schlümpfe, Wege, Uhr – kein Phaser
├── scenes/       # Phaser-Szenen: Boot, Insel, UI, Shop, Eltern
├── ui/           # Buttons, Karten, Dialoge
├── data/         # buildings.json, goods.json, residents.json, names.json, texts.de.json
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
| **M4** | Shop | Reiter Häuser, Deko, Gebäude, Insel; Freischaltungen über Dorf-Fortschritt; Insel gestalten (Baum, Fels, Strand, Wiese) |
| **M5** | Speichern | IndexedDB-Autosave, Export/Import, als Web-App installierbar |
| **M6** | Schlümpfe | Namen, Berufe, laufen auf Wegen, tragen Waren, Einladen im Shop, Ankunft per Boot |
| **M7** | Wohnen & Stimmung | Häuser zuweisen, Wegelänge, Essen, Deko-Bonus, Stimmung → Arbeitstempo |
| **M8** | Kinderfreundlich | Tutorial (erste 5 Min), Eltern-Menü mit PIN und Tageslimit, Gute-Nacht-Sequenz |
| **M9** | Look & Sound | Stil-Leitfaden, KI-Grafiken, Animationen, Musik, Geräusche |
| — | **🎉 Erster Spieltest mit den Kindern** | Komplettes Spiel mit Tutorial, Grafik und Sound. Beobachten statt erklären, Erkenntnisse als Issues → fließen in M10 |
| **M10** | Ausbau | Insel-Erweiterungen, Aufträge, Ereignisse (Händlerschiff, Regenbogen), Jahreszeiten |

**Begründung der Reihenfolge:** Gestalten (M2) kommt vor der Wirtschaft, weil es der Kern-Spaß ist. Die laufenden Schlümpfe (M6) sind der technisch aufwendigste Teil und kommen erst, wenn die Grundschleife trägt. **Die Kinder testen erst nach M9**, damit ihr erster Eindruck ein fertig wirkendes Spiel mit Grafik, Sound und Tutorial ist – Platzhaltergrafik würde das Urteil verfälschen. Bis dahin übernehmen automatische Tests, ein Reviewer- und ein Spieletester-Agent die Qualitätssicherung.

## 6. Arbeitsweise

- Ein GitHub Issue und ein Branch pro Meilenstein, Pull Request mit Review und Spieltest durch Agenten, Merge nach bestandenem Qualitäts-Tor ohne manuelle Freigabe
- Tests für `src/sim/`, die Oberfläche wird durch Spielen getestet
- Bis M9: kein manueller Test nötig; Fortschritt in `docs/FORTSCHRITT.md`, Projektleitung kann jederzeit auf GitHub Pages reinschauen
- Nach M9: Spieltests mit den Kindern; Risiko: Erkenntnisse zur Kindertauglichkeit kommen spät – deshalb Bedienung und Texte schon vorher kritisch aus Kinderperspektive prüfen

## 7. Noch offen (klärbar später)

- Welche Geräte genau (iPad-Modell/Android)? → schwächstes Gerät als Referenz für die Leistung
- Gibt es Lieblingsschlümpfe der Kinder, die als Erstes auf die Insel sollen?
