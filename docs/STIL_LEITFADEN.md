# Stil-Leitfaden – Aussehen und Klang

Dieser Leitfaden gilt für alles, was man im Spiel sieht und hört: für die Bilder, die das Spiel selbst zeichnet
(`src/art/`), für gemalte Bilder, die sie ersetzen (`public/assets/`, Anleitung in [assets/README.md](assets/README.md)),
und für die Geräusche (`src/audio/`, `src/data/sounds.json`). Alle Farben stehen als Tokens in `src/ui/style.ts`;
nichts im Spiel hat eine Farbe, die nicht dort steht.

**Ziel:** ein ruhiges, warmes Wimmelbild für Kinder von 6 bis 10. Man erkennt alles auf einen Blick, nichts blinkt,
nichts erschreckt, nichts drängt.

## 1. Perspektive und Raster

- **Draufsicht auf ein quadratisches Raster**, eine Kachel ist **64 × 64 Welt-Pixel** (`TILE_SIZE`). Das ist endgültig.
- Der **Boden** wird genau von oben gezeigt. **Dinge** (Häuser, Bäume, Felsen, Bewohner, Boot) stehen in leichter
  Vorderansicht darauf: man sieht ihre Vorderseite und ein wenig Dach.
- Dinge dürfen **nach oben über ihre Kachel hinausragen**, nie zur Seite oder nach unten. Ihr **Fußpunkt** liegt unten
  in der Mitte ihres Grundrisses; nach ihm wird sortiert (weiter unten = weiter vorn).
- Bilder werden mit **doppelter Auflösung** gezeichnet (`ART_SCALE = 2`, scharf auf Tablets mit Retina-Schirm); der
  Boden mit einfacher, weil er in 8 × 8 Kacheln großen Blöcken gemalt wird.

## 2. Farben (Tokens)

Die Palette ist hell, warm und satt. Wichtige Tokens (`COLORS` in `src/ui/style.ts`):

| Bereich | Tokens | Wert |
|---|---|---|
| Wasser | `water`, `waterShallow`, `foam` | `#8ed8f8`, `#b5e8fb`, `#ffffff` |
| Strand | `sand`, `sandShade` | `#f7e4a9`, `#e6cb83` |
| Wiese | `grass`, `grassShade` | `#8ad463`, `#69b946` |
| Waldboden | `forestFloor`, `forestFloorDark`, `forestMoss` | `#3f8c3c`, `#2e7430`, `#63ad4a` |
| Felsboden | `rockFloor`, `rockFloorLight`, `rockFloorDark` | `#a3a49c`, `#c0c1b8`, `#82847c` |
| Felsen | `rock`, `rockLight`, `rockShade` | `#a9a195`, `#d3ccc0`, `#827a6f` |
| Bäume | `treeCrown`, `treeCrownLight` | `#4fa83d`, `#72c95a` |
| Wege | `pathFill`, `pathStone`, `pathStoneDark` | `#e4cf9c`, `#f3e6c0`, `#cfb57f` |
| Holz | `wood`, `woodLight`, `woodDark` | `#b5833f`, `#d9a95d`, `#8a5f2b` |
| Taler | `coin`, `coinShine`, `coinRim` | `#ffc93c`, `#fff3b0`, `#d9941a` |
| Bedienung | `panel`, `toolFace`, `buttonRim`, `confirm`, `cancel` | `#2a6f97`, `#fff6dc`, `#ffffff`, `#4fc65a`, `#ff7a6b` |
| Schrift | `textFill`, `textOutline` | `#ffffff`, `#2a6f97` |
| Abend und Nacht | `duskWarm`, `nightSky`, `moon` | `#ff8a3d`, `#1b2350`, `#fff4c2` |

- **Mützen** (`HAT_COLORS`): Rot, Blau, Gelb, Grün, Orange, Lila, Rosa, Türkis – jede mit einer dunkleren Schattenfarbe.
- **Bewohner:** Haut, Wangen, Kleidung und Schuhe kommen aus `src/data/theme.json` (`figure`). Ein anderes Theme
  bekommt damit andere Bewohner, ohne Code.
- **Kontrast:** Benachbarte Böden unterscheiden sich deutlich in der Helligkeit: Strand am hellsten, dann Wiese,
  Felsboden (grau, dunkler als Sand), Waldboden am dunkelsten. Dinge heben sich durch Umriss und Schatten vom Boden ab.
- Rot, Gelb und Grün in der Bedienung haben eine feste Bedeutung: **Grün = ja / geht**, **Rot = nein / geht nicht**,
  **Gelb = Achtung / gleich**. Kein Bild benutzt diese Farben für etwas anderes in der Bedienung.

## 3. Umriss

- Jede Form hat einen **weichen Umriss**: die eigene Farbe, zu 55 % mit der warmen Tinte `STYLE.ink` (`#3a2a1e`)
  gemischt (`outlineOf`). **Nie reines Schwarz.**
- Breite `STYLE.line` = **2 Welt-Pixel** (im Bild doppelter Auflösung 4 px); kleine Teile (Augen, Steine im Weg)
  dünner.
- Bei Formen aus mehreren Kreisen (Baumkronen, Büsche, Wolken) läuft der Umriss **nur außen herum** (`cluster`).

## 4. Licht und Schatten

- **Licht von links oben.** Flächen haben einen sanften Verlauf: oben links heller (`lighter`), unten rechts dunkler
  (`darker`); runde Dinge bekommen ein kleines Glanzlicht oben links.
- **Schatten nach rechts unten:** eine weiche, flache Ellipse unter dem Ding in `STYLE.shadow` (`#24401c`) mit 26 %
  Deckkraft, um 12 % ihrer Breite nach rechts verschoben (`shadow`).
- Keine harten Schlagschatten, keine Lichtquellen von anderswo – auch nicht nachts (die Nacht ist eine Farbfläche über
  allem).

## 5. Formen

- **Rund und dick:** Kreise, Ellipsen, Bögen und abgerundete Ecken. Keine spitzen Zacken, keine dünnen Striche als
  Hauptform, nichts Bedrohliches.
- Häuser sind **Pilzhäuser** mit runder Kappe und Tupfen; Produktionsgebäude zeigen ihr Werkzeug oder ihre Ware groß
  und deutlich (Säge, Brot, Beeren, Stein).
- **Bewohner** sind kleine runde Wichtel: großer Kopf, große Augen, rote Wangen, **Zipfelmütze**, deren Spitze zur
  Seite fällt, mit Bommel; schlichter Kittel, runde Schuhe. Sie sind eigene Figuren – **keine Figur aus Film, Comic
  oder Spiel wird nachgezeichnet**, kein Logo, kein Markenname.
- **Kein Text in Bildern.** Wörter und Zahlen setzt das Spiel selbst (Systemschriften, `FONT_FAMILY`).
- Bilder der Bedienung sind **einfache Zeichen** (Lautsprecher, Schloss, Stern, Hand), in einem Quadrat von 64 px
  gezeichnet und auf jede Knopfgröße skaliert; Tippziele bleiben mindestens 48 CSS-px groß.

## 6. Bewegung

Animationen sind **ruhig und nur Anzeige** – die Simulation weiß nichts von ihnen, und sie kosten kaum Bildzeit:

| Was | Wie |
|---|---|
| Wellen am Strand | laufen in 4,2 s langsam an den Strand und verblassen |
| Bäume, Blumen, Büsche | wiegen sich um höchstens etwa 1,3°, jeder versetzt; nur im Bild und ab Zoom 0,4 |
| Rauch | steigt alle etwa 1,1 s aus den Schornsteinen arbeitender Gebäude, 3,2 s lang |
| Neues Gebäude | hüpft einmal kurz (140 ms) |
| Abreißen | eine kleine Staubwolke |
| Bewohner | gehen, tragen Waren, zeigen ab und zu ein Herz oder eine Wolke; schlafen nachts mit einem großen „z“ |

Nichts blinkt schneller als einmal pro Sekunde, nichts springt, nichts wackelt hektisch. Abend und Nacht blenden über
mehrere Sekunden.

## 7. Klang

- **Selbst erzeugt** mit Web Audio (`src/audio/`), keine Tondateien, keine fremden Aufnahmen. Die Rezepte stehen in
  `src/data/sounds.json` (Wellenform, Tonhöhe, Dauer, Lautstärke, Mindestabstand).
- **Weich und kurz:** Sinus und Dreieck, sanfte Ein- und Ausblendung, kein Knacken. Jedes Geräusch hat einen
  **Mindestabstand** zu sich selbst (Taler höchstens alle 1,6 s und leise), höchstens 10 Stimmen gleichzeitig, kleine
  Abweichungen in der Tonhöhe, damit sich nichts abnutzt.
- **Musik:** eine ruhige pentatonische Schleife (76 Schläge pro Minute, vier Akkorde, sehr leise). Am Abend wird sie
  langsam leiser, nachts ist sie aus; „Gute Nacht“ ist eine kleine absteigende Melodie aus drei Tönen.
- **Stumm**, wenn die Seite versteckt ist; ohne Web Audio still und ohne Fehler. Ton an/aus hinter dem Zahnrad, Musik
  und Geräusche getrennt im Eltern-Menü. Standard: an, leise.

## 8. Schrift und fertiges Gefühl

- **Nur Systemschriften** (zuerst gerundete wie „Arial Rounded MT Bold“), weiß mit blauem Rand, nie kleiner als 12 px.
- Startschirm: das Titelbild (kleine Insel mit Pilzhäusern, Bäumen, Bewohnern und Boot) auf der Farbe des Wassers, quer
  rechts daneben der Spielname aus dem Theme und der Knopf „Tippen zum Spielen“, hochkant der Name darüber und der
  Knopf darunter.
- Neue Bilder erst in den Katalog (`src/art/catalog.ts`, fester Schlüssel, Größe, Fußpunkt, Beschreibung), dann
  `npm run prompts` für die Vorlage.
