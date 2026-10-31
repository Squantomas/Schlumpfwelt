# Fortschritt – autonomer Lauf M0–M9

Gedächtnis des Orchestrators. Bei Neustart: „Setze laut `docs/FORTSCHRITT.md` fort“.

## Aktueller Stand
- **Aktueller Meilenstein:** M6 – Bewohner (Issue #7, Branch `m6-schluempfe`, Builder `opus`/`xhigh`)
- **Status:** M5 gemergt (PR #18, 3 Korrekturrunden); M4 hatte ebenfalls 3 Korrekturrunden
- **Nächster Schritt:** Branch `m6-schluempfe` von `main` anlegen, Builder M6 starten (Namen ggf. über Inhalte-Helfer nur in `src/data/`)

## Meilensteine
| # | Issue | Branch | PR | Status |
|---|---|---|---|---|
| M0 | #1 | m0-fundament | #11 | fertig |
| M1 | #2 | m1-insel | #12 | fertig |
| M2 | #3 | m2-gestalten | #13 | fertig |
| M3 | #4 | m3-wirtschaft | #15 | fertig |
| M4 | #5 | m4-shop | #16 | fertig |
| M5 | #6 | m5-speichern | #18 | fertig |
| M6 | #7 | m6-schluempfe | – | offen |
| M7 | #8 | m7-wohnen | – | offen |
| M8 | #9 | m8-kinderfreundlich | – | offen |
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
