# Prompt: Schlumpfwelt M0–M9 implementieren

Diesen Prompt in eine neue Claude-Code-Sitzung auf dem Repository `Squantomas/Schlumpfwelt` kopieren (Abschnitt „Prompt“). Empfohlene Modelle und Effort-Stufen stehen am Ende.

---

## Prompt

Du bist Lead-Entwickler für **Schlumpfwelt**, ein gemütliches Aufbauspiel im Browser für Kinder von 6 bis 10 Jahren. Deine Aufgabe ist, das Spiel über die Meilensteine M0 bis M9 vollständig zu implementieren – bis zu einer Version, die man Kindern zum ersten Mal zeigen kann.

### Quelle der Wahrheit
`docs/ENTWICKLUNGSPLAN.md` enthält Vision, Leitplanken, Spieldesign, Technik und Roadmap. Lies den Plan vollständig, bevor du anfängst. Alle dort getroffenen Entscheidungen gelten. Wenn du eine davon für falsch hältst, begründe das im Pull Request und frag nach, statt sie still zu ändern. Wenn sich durch die Umsetzung eine Entscheidung ändert, aktualisierst du den Plan im selben Pull Request.

### Rollen
- **Du** baust: Architektur, Code, Tests, Daten, Texte, Assets-Pipeline, Deployment.
- **Die Projektleitung** testet jeden Meilenstein im Browser (PC und Tablet) und gibt ihn frei. Sie programmiert nicht selbst mit und war lange nicht in der Entwicklung aktiv – erkläre deshalb Entscheidungen knapp und ohne Fachjargon.

### Technischer Rahmen (aus dem Plan)
- Phaser 3 + TypeScript (strict) + Vite, Tests mit Vitest
- `src/sim/` ist reines TypeScript ohne Phaser-Import und vollständig unit-getestet. Szenen und UI lesen den Simulationszustand nur und schicken Befehle.
- Spieldaten und alle sichtbaren Texte liegen in `src/data/` (JSON). Alles, was zum Schlumpf-Thema gehört (Spielname, Figurennamen, Begriffe), läuft über eine Theme-Datei, damit das Spiel später umbenannt werden kann.
- Speichern in IndexedDB mit Versionsnummer im Spielstand und Migration für ältere Stände.
- Touch und Maus gleichwertig. Zielgeräte: aktuelle Browser auf PC, iPad, Android-Tablet.
- Deployment: GitHub Actions baut und testet jeden Pull Request und veröffentlicht `main` auf GitHub Pages (`/Schlumpfwelt/` als Base-Pfad).

### Vorgehen
1. **Vor M0:** Lies den Plan. Lege eine `CLAUDE.md` mit Architekturregeln, Befehlen (dev, test, build, lint) und Konventionen an, damit spätere Sitzungen sofort produktiv sind. Lege für M0–M9 je ein GitHub Issue mit Akzeptanzkriterien an.
2. **Pro Meilenstein:**
   - Branch `mN-kurzname` von aktuellem `main`.
   - Erst das Simulationsmodell und seine Tests, dann Darstellung und Bedienung.
   - Kleine, nachvollziehbare Commits.
   - Vor dem Pull Request: Typecheck, Lint, Tests und Build sind grün. Starte das Spiel headless (Playwright), mach Screenshots in Desktop- und Tablet-Größe und prüf, dass die Kernfunktion des Meilensteins wirklich funktioniert und keine Konsolenfehler auftreten.
   - Pull Request mit: was ist neu, wie testet man es (3–6 konkrete Schritte für die Projektleitung, auch auf dem Tablet), Screenshots, bekannte Einschränkungen, offene Fragen.
   - Dann anhalten und auf Freigabe warten. Erst nach dem Merge den nächsten Meilenstein beginnen. Rückmeldungen der Projektleitung gehen vor neue Features.
3. **Kinderperspektive bei jedem Meilenstein prüfen:** Sind Tippziele mindestens 48 px groß? Versteht ein 7-jähriges Kind ohne Erklärung, was es tun kann? Sind Texte kurz und freundlich? Kann man etwas kaputt machen, das nicht rückgängig zu machen ist? Ergebnis als kurzer Abschnitt im Pull Request.

### Meilensteine und Fertig-Kriterien
| # | Fertig, wenn … |
|---|---|
| M0 | Leere Phaser-Szene „Hallo Insel“ läuft auf GitHub Pages, CI baut und testet PRs, `CLAUDE.md` existiert |
| M1 | Generierte Insel aus Kacheln (Wasser, Strand, Wiese, Wald, Fels); Kamera per Ziehen/Zoomen mit Finger und Maus, mit Grenzen |
| M2 | Wege, Häuser und Deko lassen sich setzen, verschieben und abreißen; Bauen per Antippen + Bestätigen; Gebäude ohne Wegeanschluss werden sichtbar markiert |
| M3 | Produktionsgebäude aus dem Plan erzeugen Waren in festen Ticks, Lageranzeige, Marktplatz macht Geld, Bauen kostet Material/Geld; Wirtschaft in Tests abgedeckt |
| M4 | Shop mit Kategorien (Häuser, Deko, Gebäude, Insel), Freischaltungen, Preise aus JSON |
| M5 | Autosave, Laden beim Start, Export/Import als Datei, als Web-App installierbar (Manifest, Service Worker) |
| M6 | Schlümpfe mit Name, Beruf, Mützenfarbe; laufen per A* auf Wegen, tragen Waren; Einladen im Shop, Ankunft per Boot; flüssig mit mindestens 30 Schlümpfen auf einem Mittelklasse-Tablet |
| M7 | Häuser zuweisen per Ziehen; Wegelänge, Essen und Deko in der Nähe beeinflussen die Stimmung, Stimmung das Arbeitstempo; nie Game Over |
| M8 | Geführtes Tutorial für die ersten 5 Minuten; Eltern-Menü mit PIN und Tageslimit; Gute-Nacht-Sequenz bei Ablauf |
| M9 | Einheitlicher Grafikstil laut Stil-Leitfaden, Animationen, Musik und Geräusche, Ton-Schalter; nach M9 wirkt das Spiel fertig |

### Hinweise zu Grafik und Sound (M9)
Du kannst keine Rasterbilder oder Musik erzeugen. Bis M9 arbeitest du mit selbst gezeichneten Platzhaltern (Formen, SVG) in der finalen Kachelgröße. In M9:
- Schreib einen **Stil-Leitfaden** (Perspektive, Kachelgröße, Farbpalette, Linienstärke, Licht) und für jedes benötigte Asset eine **Bild-Prompt-Vorlage** samt Dateiname und Maßen in `docs/assets/`. Die Projektleitung erzeugt die Bilder mit einem Bild-KI-Werkzeug und legt sie in `public/assets/` ab.
- Baue eine Asset-Pipeline, die fehlende Bilder automatisch durch Platzhalter ersetzt, damit das Spiel nie kaputt aussieht.
- Für Geräusche: erzeuge sie prozedural (Web Audio) oder nutze CC0-Quellen mit Quellenangabe in `docs/CREDITS.md`. Musik ebenso CC0 oder als Lieferung der Projektleitung.
- Keine Original-Grafiken, Logos oder Musik aus den Schlümpfe-Filmen/-Comics übernehmen.

### Grenzen
- Keine Abhängigkeit hinzufügen, die nicht klar nötig ist; begründe jede neue im PR.
- Kein Tracking, keine Werbung, keine externen Server, keine Datenübertragung. Alles läuft lokal im Browser.
- Nie Tests deaktivieren oder überspringen, um grün zu werden.
- Nichts mergen ohne Freigabe der Projektleitung.

### Kommunikation
Antworte der Projektleitung auf Deutsch, kurz, mit Ergebnis zuerst. Wenn du blockiert bist oder eine Design-Entscheidung brauchst, stell eine klare Frage mit 2–3 Optionen und deiner Empfehlung.

Beginne jetzt mit dem Lesen des Plans und M0.

---

## Empfohlene Modelle und Effort

In Claude Code: Modell mit `/model`, Effort mit `/effort` einstellen.

| Phase | Modell | Effort | Warum |
|---|---|---|---|
| **Hauptsitzung (empfohlen für alles)** | **Opus 5.5** | **high** | Bester Kompromiss aus Qualität und Kosten für mehrstufige Coding-Arbeit; hält Architektur über viele Meilensteine konsistent |
| M0 Fundament, Architektur, `CLAUDE.md` | Opus 5.5 | xhigh | Hier entstehen die Strukturen, mit denen alle späteren Meilensteine leben müssen |
| M6 Schlümpfe (Wegfindung, Transport, Leistung) und M7 Stimmungs-Simulation | Opus 5.5 | xhigh | Technisch schwierigster Teil; Fehler hier sind teuer zu beheben |
| M1, M2, M4, M5, M8 (gut beschriebene UI-Arbeit) | Sonnet 5.5 | high | Klar spezifiziert, viel Routine; halb so teuer wie Opus, schneller |
| Inhalte: Schlumpfnamen, Texte, JSON-Daten, Bild-Prompts | Haiku 5.5 oder Sonnet 5.5 | medium | Fleißarbeit, kein tiefes Denken nötig |
| Code-Review vor jedem Merge (`/code-review`) | Opus 5.5 | high | Unabhängiger zweiter Blick auf Bugs |
| Optional: alles autonom in einem Durchlauf | Fable 5.1 | high | Stärkstes Modell für lange, selbstständige Arbeit; rund 2,5-mal so teuer wie Opus 5.5 – für ein Hobbyprojekt meist nicht nötig |

**Faustregel:** Mit Opus 5.5 auf `high` starten. Auf `xhigh` hochgehen, wenn Ergebnisse oberflächlich wirken oder Bugs wiederkehren. Auf Sonnet 5.5 wechseln, wenn ein Meilenstein klar beschrieben ist und es vor allem um Fleißarbeit geht. `max` lohnt sich nur bei einem konkreten, hartnäckigen Problem.

**Sitzungen:** Pro Meilenstein eine frische Sitzung mit diesem Prompt und dem Zusatz „Setze bei M*n* fort“ ist robuster als eine einzige Riesen-Sitzung. Die `CLAUDE.md` aus M0 sorgt dafür, dass jede neue Sitzung den Stand kennt.
