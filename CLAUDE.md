# CLAUDE.md – Schlumpfwelt

Gemütliches Aufbauspiel im Browser für Kinder von 6–10 Jahren: Auf einer Insel gestalten sie ihr eigenes Dorf, die Bewohner arbeiten und verdienen Geld, davon kauft man Häuser, Deko und neue Bewohner. Kern-Spaß ist das Gestalten – die Wirtschaft ist Mittel zum Zweck, es gibt kein Game Over.

- **Quelle der Wahrheit:** `docs/ENTWICKLUNGSPLAN.md` (Leitplanken, Spieldesign, Technik, Roadmap)
- **Eigene Entscheidungen:** als Tabellenzeile in `docs/ENTSCHEIDUNGEN.md` (Datum, Meilenstein, Entscheidung, Begründung, Alternativen)
- **Live:** https://squantomas.github.io/Schlumpfwelt/ (jeder Push auf `main` wird veröffentlicht)

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver: http://localhost:5173/Schlumpfwelt/ (`npm run dev -- --host` für Tablet im WLAN) |
| `npm run build` | Produktions-Build nach `dist/` (ohne Typecheck) |
| `npm run preview` | `dist/` ausliefern: http://localhost:4173/Schlumpfwelt/ |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, keine Warnung erlaubt |
| `npm test` | Vitest einmalig (`npm run test:watch` im Watch-Modus) |
| `npm run check` | typecheck + lint + test + build – **muss vor jedem Push grün sein** |
| `npm run smoke` | Playwright-Smoke-Test, nur lokal (siehe unten) |

CI (`.github/workflows/ci.yml`) prüft jeden Pull Request (bei jedem Push auf den PR-Branch); `.github/workflows/pages.yml` prüft `main` und veröffentlicht nur `main` auf GitHub Pages.

## Ordner

```
src/main.ts          Einstieg: Phaser-Spiel, Szenenliste, Viewport
src/sim/             Simulation – reines, deterministisches TypeScript ohne Phaser/Browser, vollständig getestet
src/scenes/          Phaser-Szenen (BootScene = „Tippen zum Spielen“, IslandScene)
src/ui/              Bausteine: Buttons, Texte, Farben, Viewport/Render-Skalierung
src/data/            JSON-Daten: texts.de.json, theme.json (+ texts.ts mit t())
src/save/            ab M5: IndexedDB, Export/Import
public/assets/       Grafiken, Sounds (werden unverändert ausgeliefert)
tests/               Vitest-Tests, spiegeln src/ (tests/sim/clock.test.ts ↔ src/sim/clock.ts)
scripts/smoke.mjs    lokaler Playwright-Smoke-Test
docs/screenshots/mN/ Screenshots je Meilenstein
```

## Architekturregeln (verbindlich)

1. **`src/sim/` ist reines, deterministisches TypeScript:** kein Phaser, kein Browser, kein Netz, keine Timer, keine Wanduhr, kein `Math.random`. Zeit kommt nur über die Ticks, Zufall später nur über einen eigenen Seed-RNG in `src/sim/`. ESLint (`eslint.config.js`, Block `src/sim/**`) meldet als Fehler:
   - Imports von `phaser` und aus `scenes/`, `ui/`, `save/`, `main` sowie dynamische Imports,
   - Browser-, Netz- und Timer-Globals (`window`, `self`, `globalThis`, `document`, `navigator`, `location`, Storage/`indexedDB`/`caches`, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, `setTimeout`/`setInterval` (+ `clear…`), `queueMicrotask`, `requestAnimationFrame`/`requestIdleCallback`, `performance`, `crypto`, `Phaser`),
   - `Date.now`, `new Date()` ohne Argument, `Date()` und `Math.random`.

   `tests/architecture.test.ts` prüft jeden dieser Fälle. Die Regeln fangen nur direkte Zugriffe – was über Parameter hereingereicht wird, sieht ESLint nicht; das bleibt Review-Sache. Jede Sim-Datei hat Unit-Tests.
2. **Lesen + Befehle:** Szenen und UI lesen `simulation.state` (Typ `DeepReadonly<SimState>`, auf jeder Ebene schreibgeschützt) und ändern nur über `simulation.send({ type: … })`. Befehle werden zu Beginn des nächsten Ticks in Sendereihenfolge angewendet. Neuer Befehl = Union in `src/sim/commands.ts` erweitern, in `applyCommand` behandeln, testen.
3. **Feste Ticks:** 10 Ticks/s (`src/sim/clock.ts`). `simulation.update(deltaMs)` wird an genau einer Stelle aufgerufen (`IslandScene.update`) und gibt `alpha` ∈ [0, 1) zurück: die seit dem letzten Tick vergangene Zeit als Anteil eines Ticks (während der Pause 0). `(state.tick + alpha) * simulation.tickMs` ist eine gleichmäßig laufende Sim-Zeit für die Darstellung. Die Simulation hält nur den aktuellen Zustand; wer zwischen zwei Ticks überblenden will, merkt sich den vorherigen Zustand in der Szene selbst. Tick-Dauer immer über `simulation.tickMs`, nicht über die Konstante. Frames > 250 ms werden gekappt → nichts wird nachgeholt, kein Ertrag im Hintergrund.
4. **Texte:** Alle sichtbaren Texte stehen in `src/data/texts.de.json` (flache Schlüssel `bereich.name`) und werden nur über `t('key', params?)` aus `src/data/texts.ts` geholt. Keine Text-Literale in Szenen/UI.
5. **Theme (Markenrecht):** Alles Schlumpf-Spezifische (Spielname, Bewohner-Begriffe, Mützen …) steht nur in `src/data/theme.json`. Texte nutzen Platzhalter (`{gameName}`, `{creature}`, `{creatures}`, `{creaturesDative}`, `{creatureCompound}`, `{village}`, `{hat}`, `{hats}`). Ein Test verbietet die Markenbegriffe überall sonst in `src/` und `index.html` – auch in Kommentaren. Der `<title>` wird beim Build (`%GAME_NAME%`) und zur Laufzeit aus dem Theme gesetzt.
6. **Spieldaten als JSON** in `src/data/` (Gebäude, Waren, Preise …), damit Balancing ohne Code geht.
7. **Keine externen Server, kein Tracking, keine Werbung**, keine Fonts/Skripte von CDNs, keine Datenübertragung. Alles liegt lokal im Repo.
   - **Assets aus `public/` immer relativ laden** (`this.load.image('baum', 'assets/baum.png')`) oder über `import.meta.env.BASE_URL` (`` `${import.meta.env.BASE_URL}assets/baum.png` ``). Nie mit führendem `/` (`/assets/…`): Das Spiel liegt auf Pages unter `/Schlumpfwelt/`, ein absoluter Pfad ergibt dort einen 404, obwohl es lokal mit `npm run dev` funktioniert.
8. **Touch = Maus:** Jede Aktion funktioniert mit Finger und Maus gleich, nichts nur per Hover oder Rechtsklick. **Tippziele ≥ 48 CSS-px** (`MIN_TAP_SIZE` in `src/ui/style.ts`). Bauen per „Antippen + Bestätigen“ statt Drag & Drop.
9. **Layout in CSS-Pixeln:** Jede Szene ruft `onViewportChange(this, layout)` aus `src/ui/viewport.ts` auf – das setzt den Kamera-Zoom auf die Render-Skalierung (scharf auf Retina, max. 2×) und ruft `layout` bei jeder Größenänderung/Drehung neu auf. Hochkant und quer müssen funktionieren. Texte über `createLabel`/`setLabelSize` (`src/ui/label.ts`). Zusätzliche Kameras (z. B. Weltkamera in M1) multiplizieren ihren Zoom mit `renderScaleOf(scene)`.
10. **Platzhaltergrafik bis M8** (Formen/SVG), aber schon in der finalen Kachelgröße. Farben in `src/ui/style.ts`.
11. **Audio** ist bis M9 aus (`audio.noAudio` in `src/main.ts`); freigeschaltet wird es später im Startbildschirm-Tipp (`BootScene.startGame`), weil Tablets Ton erst nach einer Berührung erlauben.

## Konventionen

- Code-Bezeichner und Code-Kommentare **Englisch**; sichtbare Texte, Doku, Commit-Messages und Testnamen **Deutsch**.
- TypeScript strict (+ `noUncheckedIndexedAccess`), kein `any`, Typ-Importe mit `import type`.
- Tests liegen in `tests/` und spiegeln `src/`. Tests **nie** deaktivieren oder überspringen (`.skip`/`.only`/`.todo` sind per Lint verboten).
- Kleine Commits; vor jedem Push `npm run check` grün und Smoke-Test ohne Konsolenfehler.
- Szenen-Keys in `src/scenes/keys.ts`; jede Szene ruft in `create()` `markActiveScene(…)` auf.
- Neue Abhängigkeiten nur mit klarem Grund (im PR begründen). **Playwright nie als Abhängigkeit hinzufügen.**

## Lokal testen mit Playwright

- Playwright und Chromium sind in der Agenten-Umgebung **global** vorinstalliert – nicht im Projekt. Nicht installieren, kein `playwright install`. `scripts/smoke.mjs` lädt es über `NODE_PATH` bzw. `npm root -g`; eigene Skripte: `createRequire(import.meta.url)('playwright')`, `chromium.launch()` ohne Optionen.
- `npm run smoke` baut, startet `vite preview` auf Port 4173, öffnet das Spiel als Tablet (1024×768, Touch, DPR 2, quer + hochkant) und Desktop (1280×800), tippt „Tippen zum Spielen“ und speichert Screenshots. Optionen: `-- --no-build`, `-- --out docs/screenshots/m1`. Exitcode ≠ 0 bei Konsolenfehlern, Seitenfehlern oder HTTP-Fehlern.
- Läuft **nicht in CI** (dort gibt es kein Playwright).
- Aktive Szene steht in `<html data-scene="…">`: `page.waitForSelector('html[data-scene="island"]', { state: 'attached' })`.
- Screenshots mit `scale: 'css'` aufnehmen (klein halten) und selbst ansehen. WebGL-Warnungen „GPU stall due to ReadPixels“ kommen von den Screenshots im Headless-Chromium und sind harmlos.
