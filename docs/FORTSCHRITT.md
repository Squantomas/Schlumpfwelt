# Fortschritt – autonomer Lauf M0–M9

Gedächtnis des Orchestrators. Bei Neustart: „Setze laut `docs/FORTSCHRITT.md` fort“.

## Aktueller Stand
- **Aktueller Meilenstein:** M1 – Die Insel (Issue #2, Branch `m1-insel`)
- **Status:** M0 gemergt (PR #11), Pages-Deployment wird geprüft
- **Nächster Schritt:** Branch `m1-insel` von `main` anlegen, Builder M1 starten

## Meilensteine
| # | Issue | Branch | PR | Status |
|---|---|---|---|---|
| M0 | #1 | m0-fundament | #11 | fertig |
| M1 | #2 | m1-insel | – | offen |
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
- GitHub Pages muss in den Repo-Einstellungen auf „GitHub Actions“ stehen (Prüfung beim ersten Deployment).
