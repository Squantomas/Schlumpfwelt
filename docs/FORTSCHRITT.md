# Fortschritt – autonomer Lauf M0–M9

Gedächtnis des Orchestrators. Bei Neustart: „Setze laut `docs/FORTSCHRITT.md` fort“.

## Aktueller Stand
- **Aktueller Meilenstein:** M9 – Look & Sound (Issue #10, Branch `m9-look-sound`, Builder `opus`/`high`)
- **Status:** M8 gemergt (PR #24, 2 Korrekturrunden); Reste in #25 (`nacharbeit`)
- **Nächster Schritt:** Branch `m9-look-sound` von `main` anlegen, Builder M9 starten; danach `docs/ABSCHLUSSBERICHT_M9.md`

## Meilensteine
| # | Issue | Branch | PR | Status |
|---|---|---|---|---|
| M0 | #1 | m0-fundament | #11 | fertig |
| M1 | #2 | m1-insel | #12 | fertig |
| M2 | #3 | m2-gestalten | #13 | fertig |
| M3 | #4 | m3-wirtschaft | #15 | fertig |
| M4 | #5 | m4-shop | #16 | fertig |
| M5 | #6 | m5-speichern | #18 | fertig |
| M6 | #7 | m6-schluempfe | #20 | fertig |
| M7 | #8 | m7-wohnen | #22 | fertig |
| M8 | #9 | m8-kinderfreundlich | #24 | fertig |
| M9 | #10 | m9-look-sound | – | offen |

## Modelle
- Orchestrator und Subagenten laut Tabelle im Prompt (`opus`/`sonnet`/`haiku`, Effort wie vorgegeben). Bisher war kein Ersatzmodell nötig.

## Offene Punkte
- Pages-Deployment funktioniert (M0, Lauf grün). Die Live-Seite ist aus dem Container nicht abrufbar (github.io durch Netzwerk-Policy gesperrt) – Erfolg wird über den grünen Deploy-Job geprüft.
- Kosmetik für M9 (Stil-Leitfaden): Felsboden und Sand ähnlich hell; Waldboden im Weitblick nur dezent dunkler.
- Erledigt mit M5 (Laden): unbekannte Bautypen im Spielstand verwerfen/umschlüsseln, `normalizePaths` beim Laden aufrufen; für jedes Produktionsgebäude einen `production`-Eintrag sicherstellen, Waisen entfernen, danach `refreshStatuses` (`normalizeInventory` gibt es schon). Ab M4 zusätzlich: Gelände `world.tiles` mitspeichern (ändert sich durch Insel-Artikel), Normalisierer für Gelände und `earnedCoins` fehlen noch; `normalizeUnlocked` und `normalizePlanted` (`{ index, type }`) gibt es. Laden darf keine falschen „Neu im Shop“-Meldungen erzeugen (Meldungen zählen nach Id). Beim Szenen-Neustart gibt `releaseGroundBlocks` die Boden-Blöcke frei.
- M3-Einschränkungen: Balancing grob (nach Kindertest in M10 nachziehen); zweizeilige Hinweisleiste überdeckt oben die Radius-Vorschau; Zäune sehr klein (M9); Schild-/Produktionssuche je Tick linear (bei Kinderdorf-Größen unkritisch).
- Spieldesign-Änderung M3 (im Plan nachgezogen): Der Markt kauft auch Beeren (1 Taler, Reserve 4), damit man ohne Abreißen nie festsitzt; Holzfäller kostet nur Taler.
- M4-Einschränkungen: Balancing nur in der Simulation gemessen (Startdorf ca. 0,6 Taler/s, zweites Haus nach ca. 85 s, alle Taler-Freischaltungen nach 6–9 min); Kinderzeiten geschätzt. Boden-Upload-Ersparnis nur rechnerisch belegt (Headless ohne GPU). Hinweise auf 320×568 bis vierzeilig.
- Issue #14 (Deko-Auswahl auf 320×568) mit M4 erledigt: Blättern mit mehreren Reihen, ≥ 4 Karten pro Seite bei 8–20 Artikeln.
- `npm run smoke` dauert headless voll etwa 25 min (ca. 8 fps Software-Rendering); `--m4-only` etwa 5 min.
- M5 erledigt (PR #18, schließt auch #17): Autosave sofort nach jeder Änderung und jede Minute, Laden beim Start, Datei sichern/laden hinter dem Zahnrad, Web-App offline. Adressregel: `?seed=N` lädt und speichert normal, nur `&nosave=1` schaltet ab (Tests/Smoke). Fensterregel: das neueste Fenster speichert, ein altes wird mit „Hier weiterspielen“ abgedeckt. Unlesbarer Stand wird vorher gesichert (`backup`).
- M5-Einschränkungen: Echtes iPad/Safari ungeprüft (Teilen-Blatt, Home-Bildschirm-App mit eigenem Speicher, Weg ohne Web Locks) – in den Kindertest aufnehmen. Offline ohne Schrägstrich am Ende (`/Schlumpfwelt`) startet nicht. Beim Fensterwechsel geht im alten Fenster höchstens die Produktion der letzten Minute verloren. Der Smoke-Fall „Hartes Schließen“ schlug nach dem Fix einmal unter Last fehl (danach grün, Ursache offen). R16 (Infokarte bei 568×320 im Headless gelegentlich nicht geöffnet) mit bis zu drei Versuchen im Smoke abgefangen.
- Für M6: Neue Zustandsfelder (Bewohner, Wege-Ziele, getragene Waren) brauchen `SAVE_VERSION`-Erhöhung, Migration, Normalisierer und Test; Obergrenzen in `src/sim/limits.ts`.
- `npm run smoke` dauert headless voll etwa 37 min; `--m5-only` etwa 12 min.
- M6 erledigt (PR #20): Bewohner mit Name (Seed-RNG), Beruf, Mütze, Karte beim Antippen; A*-Wege (Gebäude kosten 200, Landmassen-Nummern); Tragen nur Anzeige (Wirtschaft wie M5); Einladen im Shop (30 Taler, nur mit freiem Platz), Boot mit sanfter Kamerafahrt; Zuhause von selbst (Ziehen kommt mit M7); Spielstand Version 3. Leistung als Hauptthread-JS-Budget je Bild (`data-perf`, 4× CPU-Drosselung): 40 Bewohner Mittel ca. 9 ms, p95 14–18 ms; 100 Bewohner im dichten Dorf p95 ca. 24 ms. Schnelle Formen über `addGraphics` (`FastGraphics`).
- M6-Einschränkungen (#21): Bewohner auf antwortenden Gebäuden bei weitem Zoom schwer zu treffen; Stopp der Kamerafahrt nur per Unit-Test belegt; laufende Bewohner im Headless schwer zu treffen; Gedränge auf einer Wegkachel.
- Für M7: Zuhause per Ziehen – `settleResidents` ändert `home` nur bei Obdachlosen oder überfülltem Haus, ein von Hand gesetztes Zuhause bleibt. Stimmung braucht `SAVE_VERSION` 4 mit Migration und Normalisierer. Stimmung darf die Wirtschaft nur sanft beeinflussen (nie festsitzen), Wegelänge wirkt nur auf die Stimmung.
- `npm run smoke` dauert headless voll etwa 40 min; `--m6-only` etwa 3 min je Gerät.
- M7 erledigt (PR #22): Stimmung (fröhlich/normal/traurig) wird berechnet, nicht gespeichert: +1 Deko bis 2 Kacheln ums Haus, −1 weiter Weg (> 12 Schritte), −1 Hunger. Essen alle 3 min (Kuchen, sonst Beeren), Hunger wirkt nur auf die Stimmung. Arbeitstempo 120/100/80 % über die Rundenlänge, nie Stillstand. Umziehen per Ziehen (ab Zoom 0,5, Haus erst nach 250 ms Verweilen grün – gegen versehentliches Umziehen) und über „Umziehen“ auf der Karte (Haus antippen, ✓). Spielstand Version 4. Bildzeit 40 Bewohner Tablet Mittel 8–12 ms, p95 12–23 ms (Grenze 16/25).
- M7-Einschränkungen (#23): Kamera läuft beim Ziehen am Rand nicht mit; „weiter Weg“ quer über Kacheln gezählt; Gelb beim Warten und schnelles Wischen nur im Headless belegt; p95 unter Last knapp an 25 ms; Karte/Hinweisbox verdecken auf kleinen Schirmen Teile des Dorfs.
- Für M8: Tutorial für die ersten 5 Minuten soll Ziehen und Umziehen nicht zwingend verlangen (der Knopf „Umziehen“ ist der einfache Weg); Elternmenü mit PIN und Tageslimit, Gute-Nacht-Sequenz. Hinweisleiste wird stark genutzt – Tutorial-Sätze dürfen „Neu im Shop“ und Hinweise des Tragens nicht verschlucken.
- M8 erledigt (PR #24): Geführter Start (7 Schritte mit Hand, nur neues Dorf, überspringbar, Fortschritt in den Eltern-Einstellungen; Fehler, Meldungen und Trage-Hinweise gehen immer vor). Eltern-Menü hinter dem Zahnrad mit 4-stelliger PIN (gesalzener Hash, „PIN vergessen?“ = Malaufgabe 12–29), Limit Aus/15/30/45/60/90, +10 Minuten, PIN ändern, Tutorial noch einmal; eigene IndexedDB `village-settings<Basispfad>`, nie in der Dorf-Datei. Tageskonto zählt nur sichtbares Spiel aus der rohen Bildzeit, je Kalendertag (nur ein späterer Tag beginnt neu). Abend → alle gehen heim → Nacht (pausiert, gespeichert, Tipps verschluckt), nur PIN oder neuer Tag beenden sie. Schicht `src/parent/` ohne Phaser; `state.bedtime` in der Simulation, nicht gespeichert (keine neue `SAVE_VERSION`).
- M8-Einschränkungen (#25): Bildzeit im geführten Start beim Kameraziehen weit weg vom Dorf; Hand fehlt, wenn das Kind die Kamera selbst weit weg gezogen hat; kurze Lücken ohne Hand auf 568×320; Limit umgehbar durch Browserdaten löschen oder Datum vorstellen; wer zuerst „Für Eltern“ öffnet, setzt die PIN.
- Für M9: Platzhaltergrafik ersetzen (Stil-Leitfaden, SVG, Rasterdatei bevorzugt), Animationen, Ton (prozedurales Web Audio oder CC0 mit `docs/CREDITS.md`), Ton-Schalter (sinnvoll im Eltern-Menü oder Zahnrad), Bild-Prompt-Vorlagen in `docs/assets/`. Das „z“ über schlafenden Häusern ist klein; Felsboden/Sand ähnlich hell. Bildzeit-Grenze 16/25 ms (40 Bewohner, 4× Drosselung) einhalten.
- `npm run smoke` dauert headless voll etwa 75 min; `--m8-only` etwa 13 min je Gerät.
