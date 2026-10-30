# Entscheidungen

Selbst getroffene Entscheidungen während des autonomen Laufs, die der Entwicklungsplan offenlässt.

| Datum | Meilenstein | Entscheidung | Begründung | Alternativen |
|---|---|---|---|---|
| 30.10.2026 | – | Ein Issue pro Meilenstein (#1 = M0 … #10 = M9), Branch `mN-kurzname` | Vorgabe des Prompts, einfache Zuordnung | Ein Sammel-Issue |
| 30.10.2026 | M0 | Phaser 3.90 (letzte 3.x) statt Phaser 4 | Plan legt Phaser 3 fest; 3.90 ist stabil und gut dokumentiert | Phaser 4.x (neuere API, weniger Beispiele) |
| 30.10.2026 | M0 | TypeScript 6.0 statt 7.0 | typescript-eslint unterstützt TypeScript nur bis < 6.1; 6.0 ist die neueste passende Version | TypeScript 7 (nativer Compiler) ohne typbasiertes Linting |
| 30.10.2026 | M0 | Tests in `tests/`, Struktur spiegelt `src/` | Entspricht der Ordnerstruktur im Plan, `src/` bleibt reiner Spielcode | `*.test.ts` neben dem Code |
| 30.10.2026 | M0 | `src/sim/`-Regel per ESLint: verbotene Imports, Browser-/Netz-/Timer-Globals, Wanduhr (`Date.now`, `new Date()`) und `Math.random`, dynamische Imports; dazu ein Test pro Fall, der die Regel selbst prüft (nach Review ergänzt) | Architekturregel technisch erzwungen, Simulation deterministisch (Zufall später nur über eigenen Seed-RNG); der Test merkt, falls die Lint-Konfiguration kaputtgeht | Nur Review-Regel |
| 30.10.2026 | M0 | Befehle werden gesammelt und zu Beginn des nächsten Ticks in Sendereihenfolge angewendet; erster Befehl `setPaused` | Deterministisch und testbar; Pause wird für Tageslimit/Gute-Nacht (M8) gebraucht | Befehle sofort anwenden |
| 30.10.2026 | M0 | Uhr kappt Frames auf 250 ms, Zeit im Hintergrund wird nicht nachgeholt | Verhindert Ruckel-Spiralen auf langsamen Tablets; passt zu „kein Ertrag im Hintergrund“ | Alle Zeit nachsimulieren |
| 30.10.2026 | M0 | Render-Skalierung = devicePixelRatio, begrenzt auf 0,5–2 und 4K-Pixelbudget; Phaser `Scale.NONE` mit `zoom = 1/Skalierung`, Kamera-Zoom = Skalierung, Szenen layouten in CSS-Pixeln | Scharf auf Retina, aber bezahlbar; `Scale.RESIZE` rendert in Phaser 3 nur in CSS-Auflösung (unscharf) | `Scale.RESIZE` ohne HiDPI; volle DPR 3 |
| 30.10.2026 | M0 | Startbildschirm „Tippen zum Spielen“: Tippen irgendwo startet (Knopf zeigt nur, wo), dazu Enter/Leertaste | Für Kinder ist ein großes Ziel am einfachsten; nötig fürs Audio-Freischalten | Nur der Knopf ist tippbar |
| 30.10.2026 | M0 | Audio bis M9 ausgeschaltet (`audio.noAudio`) | Noch keine Sounds; vermeidet Autoplay-Warnungen, M9 schaltet es beim Start-Tipp frei | Web Audio schon jetzt initialisieren |
| 30.10.2026 | M0 | Systemschriften (gerundete zuerst), keine Schriftdatei | Keine externen Server; eine eigene Schrift gehört zum Stil-Leitfaden in M9 | Freie Schrift (OFL) lokal einbinden |
| 30.10.2026 | M0 | Texte mit flachen Schlüsseln `bereich.name`, Platzhalter `{name}` aus Theme und Parametern, Zahlen deutsch formatiert; Test verbietet Markenbegriffe außerhalb von `theme.json` | Einfach typisierbar (`TextKey`), Umbenennen des Spiels nur in einer Datei | Verschachtelte Schlüssel, i18n-Bibliothek |
| 30.10.2026 | M0 | `<title>` beim Build aus dem Theme (`%GAME_NAME%`, kleines Vite-Plugin) und zur Laufzeit per `t('app.title')` | Titel stimmt schon vor dem Laden von JavaScript (Lesezeichen, Home-Bildschirm) | Nur zur Laufzeit setzen |
| 30.10.2026 | M0 | `<meta name="robots" content="noindex, nofollow">` | Öffentliche, nicht-kommerzielle Fan-Seite: nicht in Suchmaschinen auftauchen (Markenrecht) | Indexierung erlauben |
| 30.10.2026 | M0 | `npm run build` ohne Typecheck; `typecheck` separat, `check` macht alles | Kein doppelter `tsc`-Lauf in `check` und CI | `tsc --noEmit && vite build` |
| 30.10.2026 | M0 | CI nur auf `pull_request` (+ manuell); Pages-Workflow prüft `main` selbst und veröffentlicht nur von `main` (`if` am Deploy-Job) (nach Review geändert) | Kein doppelter Lauf bei Pushes auf PR-Branches; ein manueller Lauf auf einem anderen Branch kann nichts veröffentlichen | CI auch auf `push` |
| 30.10.2026 | M0 | Smoke-Test `scripts/smoke.mjs` nutzt globales Playwright (NODE_PATH bzw. `npm root -g`), aktive Szene als `<html data-scene>` | Keine Playwright-Abhängigkeit im Projekt; stabiler Wartepunkt ohne Phaser-Interna | Playwright als devDependency |
| 30.10.2026 | M0 | Dev-Abhängigkeit `globals` | Offizielle Liste der Node-/Browser-Globals für ESLint Flat Config (Skripte) | Globals von Hand pflegen |
| 30.10.2026 | M0 | Sim-Zustand für Szenen als `DeepReadonly<SimState>`, `Simulation` kopiert den Startzustand, `step()` ist privat (nach Review) | Szenen können den Zustand auf keiner Ebene ändern; Tests und Szenen nutzen denselben Weg `update()` | Flaches `Readonly`, öffentliches `step()` |
