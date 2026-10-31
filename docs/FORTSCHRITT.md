# Fortschritt – autonomer Lauf M0–M9

Gedächtnis des Orchestrators. Bei Neustart: „Setze laut `docs/FORTSCHRITT.md` fort“.

## Aktueller Stand
- **Aktueller Meilenstein:** M3 – Wirtschaft (Issue #4, Branch `m3-wirtschaft`)
- **Status:** M2 gemergt (PR #13)
- **Nächster Schritt:** Branch `m3-wirtschaft` von `main` anlegen, Builder M3 starten

## Meilensteine
| # | Issue | Branch | PR | Status |
|---|---|---|---|---|
| M0 | #1 | m0-fundament | #11 | fertig |
| M1 | #2 | m1-insel | #12 | fertig |
| M2 | #3 | m2-gestalten | #13 | fertig |
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
- Für M5 (Laden): unbekannte Bautypen im Spielstand verwerfen/umschlüsseln, `normalizePaths` beim Laden aufrufen.
- Nacharbeit: Issue #14 (Deko-Auswahl auf 320×568).
- `npm run smoke` dauert headless 6–10 min (ca. 8 fps Software-Rendering).
