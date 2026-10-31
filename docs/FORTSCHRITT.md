# Fortschritt – autonomer Lauf M0–M9

Gedächtnis des Orchestrators. Bei Neustart: „Setze laut `docs/FORTSCHRITT.md` fort“.

## Aktueller Stand
- **Aktueller Meilenstein:** M4 – Shop (Issue #5, Branch `m4-shop`)
- **Status:** M3 gemergt (PR #15, 2 Korrekturrunden)
- **Nächster Schritt:** Branch `m4-shop` von `main` anlegen, Builder M4 starten

## Meilensteine
| # | Issue | Branch | PR | Status |
|---|---|---|---|---|
| M0 | #1 | m0-fundament | #11 | fertig |
| M1 | #2 | m1-insel | #12 | fertig |
| M2 | #3 | m2-gestalten | #13 | fertig |
| M3 | #4 | m3-wirtschaft | #15 | fertig |
| M4 | #5 | m4-shop | – | offen |
| M5 | #6 | m5-speichern | – | offen |
| M6 | #7 | m6-schluempfe | – | offen |
| M7 | #8 | m7-wohnen | – | offen |
| M8 | #9 | m8-kinderfreundlich | – | offen |
| M9 | #10 | m9-look-sound | – | offen |

## Modelle
- Orchestrator und Subagenten laut Tabelle im Prompt (`opus`/`sonnet`/`haiku`, Effort wie vorgegeben). Bisher war kein Ersatzmodell nötig.

## Offene Punkte
- Pages-Deployment funktioniert (M0, Lauf grün). Die Live-Seite ist aus dem Container nicht abrufbar (github.io durch Netzwerk-Policy gesperrt) – Erfolg wird über den grünen Deploy-Job geprüft.
- Kosmetik für M9 (Stil-Leitfaden): Felsboden und Sand ähnlich hell; Waldboden im Weitblick nur dezent dunkler.
- Für M5 (Laden): unbekannte Bautypen im Spielstand verwerfen/umschlüsseln, `normalizePaths` beim Laden aufrufen; für jedes Produktionsgebäude einen `production`-Eintrag sicherstellen, Waisen entfernen, danach `refreshStatuses` (`normalizeInventory` gibt es schon).
- M3-Einschränkungen: Balancing grob (nach Kindertest in M10 nachziehen); zweizeilige Hinweisleiste überdeckt oben die Radius-Vorschau; Zäune sehr klein (M9); Schild-/Produktionssuche je Tick linear (bei Kinderdorf-Größen unkritisch).
- Spieldesign-Änderung M3 (im Plan nachgezogen): Der Markt kauft auch Beeren (1 Taler, Reserve 4), damit man ohne Abreißen nie festsitzt; Holzfäller kostet nur Taler.
- Nacharbeit: Issue #14 (Deko-Auswahl auf 320×568).
- `npm run smoke` dauert headless 6–10 min (ca. 8 fps Software-Rendering).
