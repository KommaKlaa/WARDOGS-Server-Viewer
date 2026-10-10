WARDOGS Server Viewer — Plesk Node.js Toolkit / Passenger

Domain: wardogs.lusor.eu
Target Node: 22.x (engines: >=22 <25)

Plesk application settings (manual):
  Application Root:  /wardogs.lusor.eu
  Document Root:     /wardogs.lusor.eu/public
  Application Mode:  production
  Startup File:      server.js
  Package Manager:   npm

Upload this ZIP contents to the application root so that package.json and
server.js are directly in /wardogs.lusor.eu (no nested WardogsViewer folder).

Then in Plesk Node.js:
  - Enable Node.js
  - NPM Install
  - Restart App

Optional environment variables:
  NODE_ENV=production
  TRUST_PROXY=1          (only after verifying reverse-proxy hop count)
  WARDOGS_DEBUG=1        (dev only; leave unset in public production)

Support: dev@lusor.eu

PUBLIC RELEASE blockers may still apply (operator address, log retention,
SSL/functional verification). Creating this package is not a launch approval.
