"use strict";

/**
 * Build a Windows portable ZIP for end users (no node_modules bundled).
 * First start runs npm install via Start WARDOGS Viewer.bat.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version || "0.0.0";
const distDir = path.join(root, "dist");
const stageName = `WARDOGS-Server-Viewer-Portable-${version}`;
const stageDir = path.join(distDir, stageName);
const zipPath = path.join(distDir, `${stageName}.zip`);

const INCLUDE = [
  "package.json",
  "package-lock.json",
  "server.js",
  "update-config.json",
  "LICENSE",
  "README.md",
  "README.de.md",
  "SO EINFACH STARTEN.txt",
  "Start WARDOGS Viewer.bat",
  "Start WARDOGS Viewer.vbs",
  "lib",
  "public",
];

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function main() {
  fs.mkdirSync(distDir, { recursive: true });
  rm(stageDir);
  rm(zipPath);
  fs.mkdirSync(stageDir, { recursive: true });

  for (const item of INCLUDE) {
    const src = path.join(root, item);
    if (!fs.existsSync(src)) {
      throw new Error(`Missing required file/folder: ${item}`);
    }
    copy(src, path.join(stageDir, item));
  }

  if (process.platform === "win32") {
    // Zip the folder so extract creates one clear app directory.
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${stageDir.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: "inherit", windowsHide: true }
    );
  } else {
    execFileSync("zip", ["-r", zipPath, stageName], {
      cwd: distDir,
      stdio: "inherit",
    });
  }

  const st = fs.statSync(zipPath);
  console.log(JSON.stringify({
    ok: true,
    version,
    zip: zipPath,
    bytes: st.size,
    mb: +(st.size / (1024 * 1024)).toFixed(2),
  }, null, 2));
}

main();
