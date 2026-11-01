# Credits – woher Bilder, Klang und Schriften kommen

## Bilder

| Was | Herkunft | Lizenz |
|---|---|---|
| Alle Bilder im Spiel (Boden, Natur, Häuser, Wege, Schilder, Waren, Bewohner, Boot, Stimmung, Effekte, Bilder der Knöpfe, Titelbild) | Eigene Zeichnungen als SVG im Code, `src/art/` (Formen und Farben aus `src/ui/style.ts` und `src/data/theme.json`), beim Start im Browser gemalt | wie das Projekt |
| Symbole der Web-App (`public/icons/*.png`, `public/favicon.svg`) | Eigene Zeichnungen, erzeugt mit `scripts/makeIcons.mjs` | wie das Projekt |
| Gemalte Ersatzbilder in `public/assets/` | **Zurzeit keine.** Jedes neue Bild bekommt hier eine Zeile: Schlüssel, Herkunft (Werkzeug oder Name der Illustratorin), Datum, Nutzungsrecht. | – |

Keine Grafik ist aus Filmen, Comics oder anderen Spielen übernommen oder nachgezeichnet.

## Klang

| Was | Herkunft | Lizenz |
|---|---|---|
| Geräusche (Tippen, Bauen, Weg, Abreißen, Taler, Neu im Shop, Boot, Fehler, Umziehen, Gute Nacht) | Im Browser erzeugt mit Web Audio aus den eigenen Rezepten in `src/data/sounds.json` (`src/audio/`) – keine Tondateien, keine Aufnahmen | wie das Projekt |
| Musik (ruhige Schleife) | Im Browser erzeugt: eigene pentatonische Melodie und Bass aus `src/audio/music.ts` und `src/data/sounds.json` | wie das Projekt |

## Schriften

Nur die Systemschriften des Geräts (`FONT_FAMILY` in `src/ui/style.ts`, zuerst gerundete wie „Arial Rounded MT
Bold“). Es wird keine Schrift geladen oder mitgeliefert.

## Software

| Was | Lizenz |
|---|---|
| [Phaser](https://phaser.io) 3 – Spiel-Bibliothek, im Spiel enthalten | MIT |
| Vite, Vitest, TypeScript, ESLint, typescript-eslint, globals – nur zum Bauen und Prüfen, nicht im Spiel | MIT bzw. Apache-2.0 (TypeScript) |
