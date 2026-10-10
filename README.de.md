# WARDOGS Server Viewer

[English](README.md)

Inoffizieller **lokaler** WARDOGS Live-Server-Browser.

Finde frischere Runden und levelpassende Community-Server auf deinem eigenen PC.

**Nicht mit BULKHEAD oder Team17 verbunden und nicht von diesen unterstützt.**  
Serverdaten kommen von [Wardog Servers](https://wardogservers.com).

Repository: [KommaKlaa/WARDOGS-Server-Viewer](https://github.com/KommaKlaa/WARDOGS-Server-Viewer)

---

## Voraussetzungen

- Windows 10/11
- [Node.js 22 LTS](https://nodejs.org/) (einmalig installieren)
- Internetverbindung für Live-Serverdaten

## Schnellstart

1. Neueste Release-Datei herunterladen **oder** dieses Repository klonen
2. Falls nötig Node.js 22 LTS installieren: https://nodejs.org/
3. Doppelklick auf **`Start WARDOGS Viewer.bat`**
4. Der Browser öffnet sich unter `http://localhost:3030`
5. Das schwarze Konsolenfenster offen lassen, solange du den Viewer nutzt  
   Fenster schließen = Viewer beenden

Beim ersten Start werden Abhängigkeiten automatisch installiert (`npm install`).

## Bedienung

- Sprache umschalten mit **DE / EN**
- Filtern nach Region, Karte, Servertyp, deinem Level, Level-Cap, Runden-/Kartenalter, freien Plätzen
- Sortieren nach frischesten Runden, Spielern, freien Plätzen oder Name
- Beitrittscode mit einem Klick kopieren
- Optional: **Einstellungen auf diesem Gerät speichern** aktivieren (lokal im Browser, keine Tracking-Cookies)

## Updates

Die App zeigt deine installierte Version und kann auf GitHub Releases prüfen.

1. Viewer öffnen
2. **Nach Updates suchen**
3. Falls verfügbar: **Jetzt aktualisieren**

Updates funktionieren erst, wenn für dieses Repository ein GitHub Release existiert.

## Portable Build (für Entwickler)

```bash
npm run build:portable
```

Erstellt:

`dist/WARDOGS-Server-Viewer-Portable-0.4.0.zip`

## Entwicklung

```bash
npm install
npm test
npm start
```

Desktop-Modus (Browser öffnet automatisch):

```bash
set WARDOGS_DESKTOP=1
npm start
```

## Support

Über [GitHub Issues](https://github.com/KommaKlaa/WARDOGS-Server-Viewer/issues).

## Hinweis

Name, Logo und Artwork von WARDOGS gehören den jeweiligen Rechteinhabern.  
Offizielles Press-Kit-Material wird nur zur Darstellung dieses inoffiziellen Community-Viewers verwendet.

Lizenz: [MIT](LICENSE)
