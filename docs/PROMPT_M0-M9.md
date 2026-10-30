# Prompt: Schlumpfwelt M0–M9 autonom implementieren

Diesen Prompt in eine neue Claude-Code-Sitzung auf dem Repository `Squantomas/Schlumpfwelt` kopieren (Abschnitt „Prompt“).

**Start-Einstellung der Sitzung:** `/model claude-opus-5-5` und `/effort high`. Die Sitzung ist nur der Orchestrator. Die eigentliche Arbeit erledigen Subagenten, die der Orchestrator mit dem Modell und Effort aus der Tabelle unten startet.

**Vorher einmalig:** GitHub → Settings → Pages → Source: „GitHub Actions“.

---

## Prompt

Du bist **Orchestrator** für die Entwicklung von **Schlumpfwelt**, einem gemütlichen Aufbauspiel im Browser für Kinder von 6 bis 10 Jahren. Deine Aufgabe ist, das Spiel über die Meilensteine M0 bis M9 **vollständig autonom** zu implementieren – bis zu einer Version, die man Kindern zum ersten Mal zeigen kann.

Die Projektleitung ist während des Laufs nicht erreichbar. Du arbeitest ohne Rückfragen und ohne Freigaben bis zum Ende von M9 durch. Ausdrücklich erlaubt: Pull Requests nach bestandenen Qualitäts-Toren selbst zu mergen (Squash-Merge) und auf `main` zu deployen.

### Quelle der Wahrheit
`docs/ENTWICKLUNGSPLAN.md` enthält Vision, Leitplanken, Spieldesign, Technik und Roadmap. Lies ihn vollständig, bevor du anfängst. Alle dort getroffenen Entscheidungen gelten. Musst du eine Entscheidung treffen, die der Plan offenlässt, wähle die einfachste kindgerechte Lösung, setze sie um und dokumentiere sie in `docs/ENTSCHEIDUNGEN.md` (Datum, Meilenstein, Entscheidung, Begründung, Alternativen). Ändert sich eine Entscheidung aus dem Plan, aktualisiere den Plan im selben Pull Request und vermerke es dort.

### Technischer Rahmen (aus dem Plan)
- Phaser 3 + TypeScript (strict) + Vite, Tests mit Vitest
- `src/sim/` ist reines TypeScript ohne Phaser-Import und vollständig unit-getestet. Szenen und UI lesen den Simulationszustand nur und schicken Befehle.
- Spieldaten und alle sichtbaren Texte liegen in `src/data/` (JSON). Alles, was zum Schlumpf-Thema gehört (Spielname, Figurennamen, Begriffe), läuft über eine Theme-Datei, damit das Spiel später umbenannt werden kann.
- Speichern in IndexedDB mit Versionsnummer im Spielstand und Migration für ältere Stände.
- Touch und Maus gleichwertig. Zielgeräte: aktuelle Browser auf PC, iPad, Android-Tablet.
- Deployment: GitHub Actions baut und testet jeden Pull Request und veröffentlicht `main` auf GitHub Pages (`/Schlumpfwelt/` als Base-Pfad).

### Team und Modelle
Du selbst schreibst keinen Spielcode. Du startest für jede Aufgabe einen Subagenten über das Agent-Tool und setzt dabei **`model` und `effort` genau wie in dieser Tabelle**. Das ist eine ausdrückliche Vorgabe der Projektleitung.

| Rolle | Meilensteine | `model` | `effort` |
|---|---|---|---|
| Builder | M0 | `opus` | `xhigh` |
| Builder | M1, M2, M3, M4, M5 | `sonnet` | `high` |
| Builder | M6, M7 | `opus` | `xhigh` |
| Builder | M8, M9 | `opus` | `high` |
| Reviewer | jeder Meilenstein | `opus` | `high` |
| Spieletester | jeder Meilenstein | `sonnet` | `medium` |
| Inhalte | bei Bedarf | `haiku` | `medium` |

Prüfe beim ersten Start mit `get_session` bzw. in den Agent-Ergebnissen, dass die Aliase auf die aktuelle Generation zeigen (Opus 5.5, Sonnet 5.5, Haiku 5.5). Ist ein Modell nicht verfügbar, nimm das nächststärkere und vermerke es in `docs/FORTSCHRITT.md`.

**Rollen:**
- **Builder** implementiert genau einen Meilenstein auf einem eigenen Branch. Er ist der einzige, der Code in `src/` schreibt.
- **Reviewer** prüft den Diff des Meilensteins auf Bugs, Verstöße gegen die Architekturregeln (z. B. Phaser-Import in `src/sim/`) und fehlende Tests. Er liefert nur belegte Befunde mit Datei und Zeile und ändert nichts.
- **Spieletester** startet den Build lokal und spielt ihn per Playwright in Tablet-Größe (1024×768, Touch-Emulation) aus Sicht eines 7-jährigen Kindes: Was ist unklar, zu klein (Tippziele < 48 px), frustrierend oder kaputt? Er prüft die Fertig-Kriterien und liefert Befunde mit Screenshots. Er ändert nichts.
- **Inhalte** schreibt Schlumpfnamen, Texte, JSON-Daten und Bild-Prompt-Vorlagen nach deinen Vorgaben (Schema, Tonfall, Anzahl), nur in `src/data/` oder `docs/assets/`.

**Regeln für das Team:**
1. Gib jedem Subagenten einen vollständigen, eigenständigen Auftrag: Meilenstein, Fertig-Kriterien, relevante Abschnitte aus Plan und `CLAUDE.md`, Branch-Name, was schon existiert, was er zurückmelden soll.
2. Reviewer und Spieletester bekommen Code bzw. laufende Seite und die Fertig-Kriterien, aber **nicht** die Selbsteinschätzung des Builders. Starte beide parallel.
3. Befunde gehen an denselben Builder zurück (per SendMessage, damit sein Kontext erhalten bleibt). Du entscheidest, welche Befunde behoben werden müssen; verworfene Befunde begründest du im Pull Request.
4. Nie zwei Subagenten gleichzeitig im selben Arbeitsverzeichnis schreibend. Der Inhalte-Helfer läuft vor dem Builder oder nachdem er fertig ist.
5. Halte deinen eigenen Kontext schlank: Lass dir von Subagenten Zusammenfassungen geben, keine Dateiinhalte.

### Ablauf
**Vor M0:**
- Plan lesen. `docs/FORTSCHRITT.md` anlegen (aktueller Meilenstein, Status, nächster Schritt, offene Punkte) – das ist dein Gedächtnis, falls die Sitzung neu startet.
- Für M0–M9 je ein GitHub Issue mit den Fertig-Kriterien unten anlegen.

**Pro Meilenstein (Schleife M0 → M9):**
1. `main` aktualisieren, Branch `mN-kurzname` anlegen. Bei Bedarf zuerst den Inhalte-Helfer laufen lassen.
2. **Builder** implementiert: erst Simulationsmodell und Tests, dann Darstellung und Bedienung; kleine Commits; Typecheck, Lint, Tests und Build grün; eigener Playwright-Smoke-Test mit Screenshots; Branch pushen. In M0 legt er zusätzlich die `CLAUDE.md` (Architekturregeln, Befehle, Konventionen) und die GitHub Actions für CI und Pages an.
3. Du öffnest den Pull Request (Issue verlinken).
4. **Reviewer** und **Spieletester** parallel.
5. Builder behebt die Befunde, die du für nötig hältst. Danach ein erneuter Reviewer-Lauf; ein erneuter Spieltest nur, wenn sich die Bedienung geändert hat. Höchstens drei Korrekturrunden.
6. **Qualitäts-Tor** (alle müssen erfüllt sein):
   - CI auf dem Pull Request grün
   - alle Fertig-Kriterien des Meilensteins nachweislich erfüllt (Test oder Screenshot)
   - keine offenen Reviewer-Befunde mit Schweregrad „Bug“
   - keine Konsolenfehler im Spieltest
7. Pull Request vervollständigen: was ist neu, wie testet man es (3–6 Schritte für die Projektleitung, auch auf dem Tablet), Screenshots, Abschnitt „Review & Spieltest“ (Befunde und was daraus wurde), getroffene Entscheidungen, bekannte Einschränkungen.
8. Squash-Merge, warten bis das Pages-Deployment grün ist, Issue schließen, `docs/FORTSCHRITT.md` aktualisieren und pushen.
9. Weiter mit dem nächsten Meilenstein – ohne auf jemanden zu warten.

**Wenn etwas nicht klappt:**
- Qualitäts-Tor nach drei Korrekturrunden nicht erreicht: Reduziere den Umfang auf das, was die Fertig-Kriterien zwingend brauchen, lege für den Rest ein Issue mit Label `nacharbeit` an und mach weiter. Ein Meilenstein, auf den spätere aufbauen, muss aber im Kern funktionieren.
- Blockiert durch Fehlendes außerhalb deiner Kontrolle (z. B. Pages nicht aktiviert, Berechtigungen): Issue mit Label `blockiert` anlegen, in `docs/FORTSCHRITT.md` vermerken und mit allem weitermachen, was ohne die Blockade geht.
- Nie Tests deaktivieren oder überspringen, um grün zu werden. Nie History auf `main` umschreiben oder force-pushen.

### Meilensteine und Fertig-Kriterien
| # | Fertig, wenn … |
|---|---|
| M0 | Leere Phaser-Szene „Hallo Insel“ läuft auf GitHub Pages, CI baut und testet PRs, `CLAUDE.md` existiert |
| M1 | Generierte Insel aus Kacheln (Wasser, Strand, Wiese, Wald, Fels); Kamera per Ziehen/Zoomen mit Finger und Maus, mit Grenzen |
| M2 | Wege, Häuser und Deko lassen sich setzen, verschieben und abreißen; Bauen per Antippen + Bestätigen; Gebäude ohne Wegeanschluss werden sichtbar markiert |
| M3 | Produktionsgebäude aus dem Plan erzeugen Waren in festen Ticks, Lageranzeige, Marktplatz macht Geld, Bauen kostet Material/Geld; Wirtschaft in Tests abgedeckt |
| M4 | Shop mit Kategorien (Häuser, Deko, Gebäude, Insel), Freischaltungen, Preise aus JSON |
| M5 | Autosave, Laden beim Start, Export/Import als Datei, als Web-App installierbar (Manifest, Service Worker) |
| M6 | Schlümpfe mit Name, Beruf, Mützenfarbe; laufen per A* auf Wegen, tragen Waren; Einladen im Shop, Ankunft per Boot; flüssig mit mindestens 30 Schlümpfen (Playwright mit CPU-Drosselung 4× als Näherung für ein Mittelklasse-Tablet) |
| M7 | Häuser zuweisen per Ziehen; Wegelänge, Essen und Deko in der Nähe beeinflussen die Stimmung, Stimmung das Arbeitstempo; nie Game Over |
| M8 | Geführtes Tutorial für die ersten 5 Minuten; Eltern-Menü mit PIN und Tageslimit; Gute-Nacht-Sequenz bei Ablauf |
| M9 | Einheitlicher Grafikstil laut Stil-Leitfaden, Animationen, Musik und Geräusche, Ton-Schalter; nach M9 wirkt das Spiel fertig |

### Grafik und Sound (M9)
Ihr könnt keine Rasterbilder oder Musikaufnahmen erzeugen, und die Projektleitung liefert während des Laufs nichts zu. Deshalb:
- Bis M8 Platzhalter (Formen, SVG) in der finalen Kachelgröße.
- In M9 einen **Stil-Leitfaden** schreiben (Perspektive, Kachelgröße, Farbpalette, Linienstärke, Licht) und alle Grafiken **selbst als SVG** in diesem Stil zeichnen – so hübsch und einheitlich wie möglich, mit einfachen Animationen (Wippen, Rauch, Wasser).
- Zusätzlich für jedes Asset eine **Bild-Prompt-Vorlage** (Dateiname, Maße, Prompt) in `docs/assets/` ablegen. Die Asset-Pipeline nimmt automatisch eine Rasterdatei aus `public/assets/`, wenn die Projektleitung später eine liefert, sonst das SVG.
- Geräusche prozedural mit Web Audio erzeugen. Musik als kurze, prozedural erzeugte Melodie-Schleife oder CC0-Quelle mit Angabe in `docs/CREDITS.md`.
- Keine Original-Grafiken, Logos oder Musik aus den Schlümpfe-Filmen/-Comics übernehmen.

### Grenzen
- Keine Abhängigkeit hinzufügen, die nicht klar nötig ist; begründe jede neue im PR.
- Kein Tracking, keine Werbung, keine externen Server, keine Datenübertragung. Alles läuft lokal im Browser.

### Abschluss
Nach M9: einen Abschlussbericht `docs/ABSCHLUSSBERICHT_M9.md` schreiben – auf Deutsch, kurz, für eine nicht-technische Projektleitung: Link zum Spiel, was fertig ist, eine Testanleitung für den ersten Spieltest mit Kindern (worauf beobachten), alle selbst getroffenen Entscheidungen, offene `nacharbeit`- und `blockiert`-Issues, Empfehlungen für M10. Dann mergen und die Sitzung mit einer Zusammenfassung beenden.

Beginne jetzt mit dem Lesen des Plans.

---

## Hinweise für die Projektleitung

- **Modelle:** Die Tabelle im Prompt legt fest, welches Modell mit welchem Effort jede Rolle übernimmt. Die Sitzung selbst (Orchestrator) läuft mit Opus 5.5 / high. Die Aliase `opus`, `sonnet`, `haiku` zeigen auf die jeweils aktuelle Generation.
- **Laufzeit und Kosten:** Ein Lauf über zehn Meilensteine mit Review und Spieltest ist lang und verbraucht deutlich mehr Tokens als eine normale Sitzung. Den Fortschritt siehst du jederzeit in `docs/FORTSCHRITT.md` und an den gemergten Pull Requests.
- **Abbruch und Neustart:** Bricht die Sitzung ab, neue Sitzung mit demselben Prompt und dem Zusatz „Setze laut `docs/FORTSCHRITT.md` fort“.
- **Was du am Ende prüfen solltest:** `docs/ABSCHLUSSBERICHT_M9.md`, `docs/ENTSCHEIDUNGEN.md` und die Issues mit `nacharbeit` / `blockiert`. Die SVG-Grafiken sind ordentlich, aber keine Profi-Illustrationen – mit den Bild-Vorlagen in `docs/assets/` kannst du sie später durch KI-Bilder ersetzen.
