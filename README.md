# WARDOGS Server Viewer

[Deutsch / German](README.de.md)

Unofficial **local** WARDOGS live server browser.

Find fresher rounds and level-compatible community servers on your own PC.

**Not affiliated with or endorsed by BULKHEAD or Team17.**  
Server data is provided by [Wardog Servers](https://wardogservers.com).

Repository: [KommaKlaa/WARDOGS-Server-Viewer](https://github.com/KommaKlaa/WARDOGS-Server-Viewer)

---

## Requirements

- Windows 10/11
- [Node.js 22 LTS](https://nodejs.org/) (one-time install)
- Internet connection for live server data

## Quick start

1. Download the latest release **or** clone this repository
2. Install Node.js 22 LTS if needed: https://nodejs.org/
3. Double-click **`Start WARDOGS Viewer.bat`**
4. Your browser opens at `http://localhost:3030`
5. Keep the black console window open while using the viewer  
   Close that window to quit

On first start, dependencies are installed automatically (`npm install`).

## Using the viewer

- Switch language with **DE / EN**
- Filter by region, map, server type, your level, level cap, round/map age, free slots
- Sort by freshest rounds, players, free slots, or name
- Copy join codes with one click
- Optional: enable **Remember settings on this device** to store filters locally (no tracking cookies)

## Updates

The app shows your installed version and can check GitHub Releases for updates.

1. Open the viewer
2. Use **Check for updates**
3. If an update is available, choose **Update now**

Updates only work after a GitHub Release exists for this repository.

## Portable build (developers)

```bash
npm run build:portable
```

Creates:

`dist/WARDOGS-Server-Viewer-Portable-0.4.0.zip`

## Development

```bash
npm install
npm test
npm start
```

Desktop mode (auto-open browser):

```bash
set WARDOGS_DESKTOP=1
npm start
```

## Support

Use [GitHub Issues](https://github.com/KommaKlaa/WARDOGS-Server-Viewer/issues).

## Disclaimer

WARDOGS name, logo and artwork belong to their respective rights holders.  
Official press-kit artwork is used only to present this unofficial community viewer.

License: [MIT](LICENSE)
