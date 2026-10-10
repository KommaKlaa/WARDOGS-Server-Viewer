# WARDOGS Server Viewer

Unofficial local WARDOGS live server browser.

Find fresher rounds and level-compatible community servers.

**Not affiliated with or endorsed by BULKHEAD or Team17.**  
Server data is provided by [Wardog Servers](https://wardogservers.com).

## Requirements

- Windows
- [Node.js 22 LTS](https://nodejs.org/)
- Internet connection (live server data)

## Start (one click)

1. Install Node.js 22 LTS once
2. Double-click `Start WARDOGS Viewer.bat`
3. Your browser opens at `http://localhost:3030`
4. Keep the console window open while using the viewer

## Features

- Live server list via local backend proxy
- DE / EN interface
- Region, map, level, round-age and occupancy filters
- Optional local settings storage (opt-in)
- In-app update check against GitHub Releases

## Updates

After you publish a GitHub Release, the app can detect and install updates.

Configured repository:

- Owner: `KommaKlaa`
- Repo: `WARDOGS-Server-Viewer`

## Development

```bash
npm install
npm start
npm test
```

Desktop mode (opens browser):

```bash
set WARDOGS_DESKTOP=1
npm start
```

## Disclaimer

WARDOGS name, logo and artwork belong to their respective rights holders.  
Official press-kit artwork is used only to present this unofficial community viewer.
