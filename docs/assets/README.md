# Bilder ersetzen – Anleitung für die Projektleitung

Jedes Bild im Spiel hat einen **festen Schlüssel** (zum Beispiel `bld-bakery` für die Bäckerei). Das Spiel zeichnet
jedes Bild selbst als SVG, aus den Farben in `src/ui/style.ts` und `src/data/theme.json`. Liegt im Ordner
`public/assets/` eine gemalte Datei mit demselben Schlüssel als Namen, nimmt das Spiel **diese Datei statt der
gezeichneten**. Sonst ändert sich nichts: gleiche Größe, gleicher Fußpunkt, gleiche Stelle im Spiel.

Die Vorlagen in diesem Ordner sind aus dem Katalog `src/art/catalog.ts` erzeugt (`npm run prompts`, ein Test prüft, dass
sie auf dem Stand sind). Für jedes Bild stehen dort Dateiname, Größe, Fußpunkt, Hauptfarben und eine fertige Vorlage
für einen Bildgenerator oder als Auftrag für eine Illustratorin.

## Die Vorlagen

| Datei | Was |
|---|---|
| [titel.md](titel.md) | Titelbild des Startschirms |
| [bewohner.md](bewohner.md) | Bewohner (acht Mützenfarben), Boot, Ring um einen Bewohner |
| [gebaeude.md](gebaeude.md) | Häuser, Deko, Produktionsgebäude, Insel-Artikel im Shop |
| [natur.md](natur.md) | Bäume und Felsen |
| [boden.md](boden.md) | Bodenmuster (nahtlos) und kleine Dinge auf dem Boden |
| [wege.md](wege.md) | 16 Wegstücke (je nach Nachbarn) |
| [schilder.md](schilder.md) | Schilder über Gebäuden („Weg fehlt“, Ware, Baum, Fels) |
| [waren.md](waren.md) | Waren und Taler, Bedarf an Baum und Fels |
| [stimmung.md](stimmung.md) | Herz, Gesicht, Wolke, Schlaf-„z“ |
| [effekte.md](effekte.md) | Glitzern, Welle, Tipp-Ring, Staubwolke, Rauch |
| [bedienung.md](bedienung.md) | Bilder der Knöpfe, Schloss, Stern, Hand des geführten Starts, Mond und Sterne |

## So wird ein Bild ersetzt

1. **Bild aussuchen.** Am meisten bringen Titelbild, Bewohner und Häuser; danach Bäume, Boden und Waren.
2. **Vorlage kopieren.** Der Text im grauen Kasten ist englisch, weil Bildgeneratoren Englisch am besten verstehen. Er
   beginnt bei jedem Bild mit **derselben Stil-Präambel** (weiche, runde Formen, Umriss in einer dunkleren Farbe statt
   Schwarz, Licht von links oben, Schatten nach rechts unten, leichte Draufsicht). Die Präambel nie weglassen oder
   ändern – nur so passen alle Bilder zusammen. Die Regeln dahinter stehen in [../STIL_LEITFADEN.md](../STIL_LEITFADEN.md).
3. **Bild machen lassen**, mehrere Versuche, das ruhigste nehmen. Zum Vergleich das gezeichnete Bild im Spiel ansehen.
4. **Auf die genaue Größe bringen**, die unter „Größe“ steht (zum Beispiel 80 × 136 px). Ein anderes Format wird
   verzerrt. Der **Fußpunkt** („Anker“) ist die Stelle, an der das Ding auf dem Boden steht: dort muss im Bild der Fuß
   des Hauses, des Baums oder des Bewohners sein. Alles außerhalb des Dings ist **durchsichtig** – außer bei den
   Bodenmustern (`ground-…`): die sind ganz gefüllt und **nahtlos**, die rechte Kante passt an die linke, die untere an
   die obere.
5. **Speichern** als `public/assets/<Schlüssel>.webp` (bevorzugt, kleiner) oder `.png`, also zum Beispiel
   `public/assets/bld-bakery.webp`. Nur Kleinbuchstaben, Ziffern und Bindestriche; liegen beide da, gewinnt `.webp`.
   Eine Datei sollte unter etwa 200 KB bleiben (das Spiel lädt alle Bilder beim Start und hält sie offline vor).
6. **Ansehen:** `npm run dev` und die Adresse öffnen, die der Befehl nennt. Im Element `<html>` zeigt
   `data-assets`, wie viele Bilder gemalt (`raster`) und wie viele gezeichnet (`svg`) sind; `failed` nennt Dateien,
   die sich nicht laden ließen – dann zeigt das Spiel wieder das gezeichnete Bild und schreibt eine Warnung in die
   Konsole.
7. **Prüfen und hochladen:** `npm run check` muss grün sein, dann committen und pushen. Die Liste der Dateien entsteht
   beim Bauen von selbst; neue Dateien kommen auch von selbst in den Offline-Speicher der Web-App.

**Zurück zum gezeichneten Bild:** die Datei aus `public/assets/` löschen.

## Was nie in ein Bild gehört

- **Keine fremden Figuren, Logos oder Bilder** – nichts aus Filmen, Comics oder anderen Spielen nachzeichnen oder
  nachmachen lassen, keine Markennamen in der Vorlage und kein Verweis auf das Aussehen eines fremden Werks. Die Bewohner sind eigene kleine Wichtel
  mit Zipfelmütze; ihre Farben kommen aus `src/data/theme.json`.
- **Kein Text, keine Zahlen, kein Wasserzeichen** im Bild – alle Wörter setzt das Spiel selbst (sie stehen in
  `src/data/texts.de.json`).
- **Nur Bilder, die wir verwenden dürfen.** Bei einem Bildgenerator die Nutzungsbedingungen prüfen, bei einer
  Illustratorin die Rechte schriftlich klären. Woher ein Bild kommt, gehört in [../CREDITS.md](../CREDITS.md).
- Nichts Gruseliges, keine Waffen, nichts Trauriges außer der kleinen Regenwolke der Stimmung.
