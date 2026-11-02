# Abschlussbericht nach M9

Stand: 2. November 2026 · Meilensteine M0–M9 fertig

**Spiel:** https://squantomas.github.io/Schlumpfwelt/ (jeder Merge auf `main` wird automatisch veröffentlicht)

## Kurz gesagt

Das Spiel ist ein komplettes, ruhiges Aufbauspiel für Kinder von 6 bis 10 Jahren. Es läuft im Browser auf Tablet, Handy und Computer, auch offline als Web-App.

- Man gestaltet eine Insel: Wege, Häuser, Deko, Bäume, Strand.
- Die Bewohner arbeiten und verdienen Taler. Davon kauft man Neues im Shop.
- Es gibt kein Game Over und man sitzt nie fest. Abreißen erstattet alles, Verschieben ist gratis.
- Alle Bilder und Töne sind selbst gemacht.
- Es gibt keine Server, kein Tracking und keine Werbung. Alles bleibt auf dem Gerät.

Jeder Meilenstein lief durch Bauen, Code-Review und Spieltest aus Kindersicht, mit bis zu drei Korrekturrunden. Am Ende stehen 2062 automatische Tests. Was übrig blieb, steht in Issues mit dem Label `nacharbeit`.

## Was fertig ist

| Meilenstein | Was das Kind erlebt |
|---|---|
| M0 Fundament | Das Spiel startet auf dem Tablet. Jede Änderung geht automatisch online. |
| M1 Insel | Eine Insel mit Wasser, Strand, Wiese, Wald und Felsen. Ziehen, Zwei-Finger-Zoom, Mausrad. |
| M2 Gestalten | Wege, Häuser und Deko setzen, verschieben, abreißen. Immer per Antippen und ✓. |
| M3 Wirtschaft | Holzfäller, Steinbruch, Beerengarten, Bäckerei, Schreinerei, Markt. Taler und Waren in der Leiste oben. |
| M4 Shop | Shop mit vier Reitern (Häuser, Deko, Gebäude, Insel). Neues wird durch Fortschritt frei: „Neu im Shop“ mit Stern. Eigene Bäume, Felsen, Strand und Wiese. |
| M5 Speichern | Das Dorf speichert sich sofort. Datei sichern und laden. Als App auf den Home-Bildschirm, offline spielbar. |
| M6 Bewohner | Bewohner mit Namen, Beruf und Mütze. Sie laufen auf Wegen und tragen Waren. Neue kommen per Boot. |
| M7 Wohnen & Stimmung | Deko macht fröhlich, ein weiter Weg oder Hunger traurig. Fröhliche arbeiten etwas schneller. Umziehen per Ziehen oder Knopf. |
| M8 Kinderfreundlich | Geführter Start mit zeigender Hand. Eltern-Menü mit PIN und Tageslimit. Gute-Nacht-Abend, in der Nacht ruht das Dorf. |
| M9 Aussehen & Ton | Einheitlicher, gezeichneter Stil. Wellen, wiegende Bäume, Rauch. Leise Musik und Geräusche, Ton-Schalter. |

## Erster Spieltest mit den Kindern

**Vorbereitung**
- Das Gerät nehmen, das die Kinder wirklich nutzen. Zuerst das schwächste Gerät der Familie.
- Auf iPad/iPhone die Seite in Safari öffnen, dann über „Teilen → Zum Home-Bildschirm“ als App anlegen. Die App hat einen eigenen Speicher, getrennt von Safari.
- **Vorher selbst** Zahnrad → „Für Eltern“ öffnen und eine PIN setzen. Wer das Menü zuerst öffnet, setzt die PIN.
- Ton laut genug stellen. Ein Tageslimit nur setzen, wenn ihr den Abend sehen wollt (15 Minuten reichen dafür).

**Ablauf:** Gerät hinlegen, „Tippen zum Spielen“, möglichst nichts erklären. 15–20 Minuten zusehen, Auffälliges notieren, danach kurz fragen.

**Worauf achten**

| Bereich | Fragen |
|---|---|
| Erster Eindruck | Wirkt der Startschirm einladend? Wie lange dauert das Laden? |
| Geführter Start | Folgt das Kind der Hand? Versteht es die Sätze oder braucht es Vorlesen? Bricht es ab? |
| Bauen | Findet es Shop, Platz und ✓? Stört das ✓, oder ist es hilfreich? Passieren Fehlbauten? |
| Wirtschaft | Versteht es, dass Taler vom Markt kommen? Wartet es geduldig oder wird es ungeduldig? Wann kommt das erste „Neu im Shop“? |
| Bewohner | Tippt es Bewohner an? Versucht es, sie zu ziehen? Freut es sich über das Boot? |
| Stimmung | Bemerkt es Herzen und Wolken? Stellt es Blumen gezielt neben Häuser? |
| Ton | Ist die Musik angenehm oder nervt sie nach 10 Minuten? Sind die Taler-Geräusche zu häufig? |
| Abend und Nacht | Wie reagiert das Kind auf „Gute Nacht“? Gibt es Frust? Hilft der sanfte Satz 5 Minuten vorher? |
| Bedienung | Wo tippt es daneben? Was sucht es vergeblich? Welche Wörter versteht es nicht? |
| Technik | Ruckelt es? Ist der Akku schnell leer? Ist das Dorf nach dem Schließen und Öffnen wieder da? |

Erkenntnisse bitte als GitHub-Issues anlegen, je Beobachtung ein Issue. Sie fließen in M10.

## Wichtigste eigene Entscheidungen

Alle 228 Entscheidungen mit Begründung und Alternativen stehen in [`docs/ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md). Die wichtigsten:

### M0 – Fundament
- **Nur im Browser, nichts verlässt das Gerät:** keine Server, kein Tracking, keine Werbung, keine Online-Schriften. Wichtig für ein Kinderspiel.
- **Markenbegriffe nur an einer Stelle:** Spielname und Figurenbezeichnung stehen in einer einzigen Datei (`src/data/theme.json`). Ein Test wacht darüber, und die Seite ist für Suchmaschinen gesperrt.

### M1 – Insel
- **Feste Draufsicht und Kachelgröße:** einfach zu zeichnen und gut zu tippen. Ein späterer Wechsel würde alle Bilder entwerten.
- **Jede neue Insel ist anders,** hat aber immer Wiese, Wald, Fels und Strand. Die Kamera verliert die Insel nie aus dem Bild.

### M2 – Gestalten
- **Bauen nur per Antippen und ✓/✕ an festem Platz, nie per Ziehen.** Das ist für Kinder berechenbar.
- **Ein Haus ohne Weg ist erlaubt.** Es zeigt ein freundliches Schild statt einer Fehlermeldung. Das Startdorf ist nicht leer.

### M3 – Wirtschaft
- **Man sitzt nie fest:** Wege und Verschieben sind gratis, Abreißen erstattet alles, Beerengarten und Markt bringen immer Geld.
- **Nichts wird knapp:** Bäume und Felsen werden nicht verbraucht.
- **Fehlt etwas, sagt ein Satz, was fehlt und wie man es bekommt.**

### M4 – Shop
- **Karte antippen heißt wählen und platzieren.** Bezahlt wird erst beim Setzen, es gibt keinen Besitz zu verwalten.
- **Neues wird durch Fortschritt frei,** ohne zweite Währung und für immer.
- **Erklärungen verschwinden nie nach Zeit,** die Schrift ist mindestens 12 px groß.
- **Die Preise wurden für einen schnelleren Start gesenkt.**

### M5 – Speichern
- **Jede Änderung wird sofort gespeichert,** zusätzlich jede Minute.
- **Ein kaputter Spielstand bekommt vorher eine Kopie.** Ein Spielstand aus einer neueren Version wird nie überschrieben.
- **Bei zwei Fenstern speichert das neueste.** Das alte zeigt „Hier weiterspielen“.

### M6 – Bewohner
- **Jedes Produktionsgebäude hat sofort einen Arbeiter.** Tragen ist nur Anzeige, Bewohner bremsen die Wirtschaft nie.
- **Wer kein Zuhause hat, zieht von selbst ins nächste freie Haus.** Niemand wird weggeschickt.
- **Einladen kostet 30 Taler** und braucht ein freies Haus.

### M7 – Stimmung
- **Die Stimmung folgt aus dem Dorf,** Gestalten wird belohnt.
- **Traurige arbeiten langsamer, aber nie unter etwa drei Viertel.** Es gibt keinen Stillstand und keinen Auszug.

### M8 – Eltern
- **PIN ohne Sperre:** Wer die PIN vergessen hat, löst eine Malaufgabe.
- **Tageslimit ist standardmäßig aus.** Gezählt wird nur sichtbare Spielzeit.
- **Die Nacht hält das Dorf ohne Ertrag an.**
- **Die Einstellungen liegen getrennt vom Dorf.** Ein Import ändert sie nicht.

### M9 – Aussehen & Ton
- **Alle Bilder und Töne sind selbst erzeugt,** ohne Fremddateien und ohne Lizenzfragen.
- **Gemalte Bilder können jede Zeichnung ersetzen** (Anleitung unten).
- **Leise Musik, nachts aus.** Kinder haben einen Ton-Schalter, Eltern schalten Musik und Geräusche getrennt.

### Bitte bewusst prüfen
- **Aussehen der Bewohner:**
  - Blaue Haut, weiße Kleidung und Pilzhäuser erinnern stark an die bekannte Vorlage.
  - Formal ist das sauber: alles selbst gezeichnet, kein Original-Material, Markenbegriffe nur im Theme.
  - Ob das Spiel so nah an der Vorlage bleiben soll, entscheidest du. Die Farben stehen in `src/data/theme.json` und lassen sich ohne Code ändern.
- **Balancing ist geschätzt, nicht mit Kindern gemessen:**
  - Betrifft Preise, Takte, Freischalt-Schwellen, Arbeitstempo nach Stimmung (120/100/80 %) und Essen alle 3 Minuten.
  - Alles steht in JSON-Dateien in `src/data/`.
- **Soll Traurigkeit überhaupt etwas kosten** (langsamer arbeiten), oder nur sichtbar sein?
- **PIN:** 4 Ziffern, schützt vor Kindern, nicht vor Fachleuten. Die Malaufgabe lässt sich mit einem Taschenrechner lösen.
- **Tageslimit:** Es lässt sich durch Löschen der Browserdaten oder Vorstellen des Datums umgehen. Für 6- bis 10-Jährige ist das als ausreichend akzeptiert.
- **Speicher:** Safari und die Home-Bildschirm-App haben getrennte Dörfer. Safari kann den Speicher nach 7 Tagen ohne Nutzung löschen; die App ist davor geschützt, deshalb ab und zu „Als Datei sichern“.
- **Leistung:** In sehr dichten Dörfern mit über 100 Bewohnern liegt die Bildzeit über dem Ziel.

## Offene Issues

Es gibt kein Issue mit `blockiert`, keine Arbeit war von außen blockiert. Offen sind fünf Sammel-Issues mit `nacharbeit`. Keines bricht ein Abnahmekriterium.

| Issue | Inhalt (Auswahl) |
|---|---|
| [#19](https://github.com/Squantomas/Schlumpfwelt/issues/19) M5 Speichern | Ein Fenster ohne Autosave übernimmt trotzdem. Zahnrad ohne Beschriftung. Keine Anzeige „gespeichert“. |
| [#21](https://github.com/Squantomas/Schlumpfwelt/issues/21) M6 Bewohner | Bewohner auf Gebäuden bei weitem Zoom schwer zu treffen. Gedränge auf einer Wegkachel. Arbeitslose stehen lange still. |
| [#23](https://github.com/Squantomas/Schlumpfwelt/issues/23) M7 Wohnen & Stimmung | Die Kamera läuft beim Ziehen am Rand nicht mit. „Weiter Weg“ wird grob gezählt. Bildzeit unter Last knapp. |
| [#25](https://github.com/Squantomas/Schlumpfwelt/issues/25) M8 Kinderfreundlich | Die Hand fehlt, wenn das Kind die Kamera weit weggezogen hat. Kurze Lücken ohne Hand auf dem Handy quer. Beschriftung des Nacht-Knopfs. |
| [#27](https://github.com/Squantomas/Schlumpfwelt/issues/27) M9 Aussehen & Ton | Das Nacht-„z“ fehlt an einigen Rändern. Kleine Bilder auf manchen Shop-Karten am Handy quer. Mond auf fast quadratischen Schirmen. Ein Test ist unter Last knapp. |

**Nicht automatisch prüfbar, bitte im Gerätetest ansehen:**
- Ist der Ton wirklich hörbar und angenehm leise?
- Funktioniert auf dem echten iPad das Teilen-Blatt beim Sichern?
- Kommt der Ton nach einem Anruf oder dem Sperrbildschirm zurück?
- Wie lange dauert das Laden auf eurem Gerät?

## Eigene Bilder einsetzen (optional)

Die Zeichnungen sind ordentlich, aber keine Profi-Illustrationen. In [`docs/assets/`](assets/README.md) steht für jedes der 113 Bilder eine Vorlage: Dateiname, genaue Größe, Fußpunkt, Hauptfarben und ein englischer Prompt für einen Bildgenerator.

So geht es:
1. Bild erzeugen und **genau auf die angegebene Größe** bringen. Das Spiel prüft die Größe nicht; ein falsches Format wird verzerrt.
2. Die Datei als `public/assets/<Schlüssel>.webp` oder `.png` ablegen.
3. Pushen. Das Spiel nimmt die Datei, sonst weiter die Zeichnung.

Am besten mit dem Titelbild und den Häusern anfangen und das Ergebnis zuerst auf dem Tablet ansehen.

## Empfehlungen für M10

1. **Zuerst der Spieltest mit den Kindern,** dann priorisieren. Die Beobachtungen wiegen mehr als die Liste unten.
2. **Balancing nach dem Test nachziehen:** Wie schnell kommen Taler, wann kommt Neues? Das geht in `src/data/` ohne Code.
3. **Die Nacharbeit mitnehmen,** die die Kinder tatsächlich treffen, zuerst #25 (geführter Start) und #23 (Ziehen am Rand).
4. **Inhalt laut Plan:**
   - Insel-Erweiterungen (neue Inselteile),
   - kleine Aufträge („Baue drei Blumen“),
   - Ereignisse (Händlerschiff, Regenbogen),
   - Jahreszeiten.
5. **Optional schöner:** gemalte Bilder für Titelbild, Häuser und Bewohner über die Vorlagen in `docs/assets/`.
6. **Technik:**
   - Leistung auf dem schwächsten Familiengerät messen.
   - Bei Bedarf die Zahl der Bewohner begrenzen.
   - Eine kleine Anzeige „gespeichert“ einbauen (#19).
