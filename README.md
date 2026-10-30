# Schlumpfwelt
Auf einer Insel baut man sich sein eigenes Schlumpfdorf. Es gibt eine kleine  Wirtschaftssimulation in der die Schlümpfe Geld verdienen können und sich dann coole Sachen für die Insel kaufen können. Ähnlich wie bei dem Spiel die Siedler.

**Spielen:** https://squantomas.github.io/Schlumpfwelt/ (läuft im Browser auf PC, iPad und Android-Tablet)

## Entwicklungsplan
Vision, Entscheidungen, Technik und Meilensteine: [docs/ENTWICKLUNGSPLAN.md](docs/ENTWICKLUNGSPLAN.md)

## Entwickeln
Voraussetzung: Node.js 22.

```bash
npm ci            # Abhängigkeiten installieren
npm run dev       # Entwicklungsserver: http://localhost:5173/Schlumpfwelt/
npm run check     # Typecheck, Lint, Tests und Build
npm run build     # Build nach dist/
npm run preview   # Build ansehen: http://localhost:4173/Schlumpfwelt/
```

Technik: Phaser 3, TypeScript, Vite, Vitest. Regeln für die Mitarbeit stehen in [CLAUDE.md](CLAUDE.md).
