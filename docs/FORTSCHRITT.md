# Fortschritt – autonomer Lauf M0–M9

Gedächtnis des Orchestrators. Bei Neustart: „Setze laut `docs/FORTSCHRITT.md` fort“.

## Aktueller Stand
- **Aktueller Meilenstein:** M2 – Gestalten (Issue #3, Branch `m2-gestalten`)
- **Status:** M1 gemergt (PR #12)
- **Nächster Schritt:** Branch `m2-gestalten` von `main` anlegen, Builder M2 starten

## Meilensteine
| # | Issue | Branch | PR | Status |
|---|---|---|---|---|
| M0 | #1 | m0-fundament | #11 | fertig |
| M1 | #2 | m1-insel | #12 | fertig |
| M2 | #3 | m2-gestalten | – | offen |
| M3 | #4 | m3-wirtschaft | – | offen |
| M4 | #5 | m4-shop | – | offen |
| M5 | #6 | m5-speichern | – | offen |
| M6 | #7 | m6-schluempfe | – | offen |
| M7 | #8 | m7-wohnen | – | offen |
| M8 | #9 | m8-kinderfreundlich | – | offen |
| M9 | #10 | m9-look-sound | – | offen |

## Modelle
- Orchestrator: Opus 5.5 (`claude-opus-5-5`), Effort high – per `get_session` geprüft.
- Subagenten laut Tabelle im Prompt (`opus`/`sonnet`/`haiku`). Builder M0 meldet Opus 5.5 – Alias `opus` zeigt auf die aktuelle Generation.

## Offene Punkte
- Pages-Deployment funktioniert (M0, Lauf grün). Die Live-Seite ist aus dem Container nicht abrufbar (github.io durch Netzwerk-Policy gesperrt) – Erfolg wird über den grünen Deploy-Job geprüft.
- Kosmetik für M9 (Stil-Leitfaden): Felsboden und Sand ähnlich hell; Waldboden im Weitblick nur dezent dunkler.
- `npm run smoke` dauert headless 6–10 min (ca. 8 fps Software-Rendering).
