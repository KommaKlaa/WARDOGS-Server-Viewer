"use strict";

const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function parseSemver(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/^v/i, "");
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), raw: s };
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

function createAppUpdate({
  rootDir = path.join(__dirname, ".."),
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const pkgPath = path.join(rootDir, "package.json");
  const configPath = path.join(rootDir, "update-config.json");
  const statePath = path.join(rootDir, "data", "update-state.json");

  function readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return fallback;
    }
  }

  function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  }

  function getLocalVersion() {
    const pkg = readJson(pkgPath, { version: "0.0.0" });
    return String(pkg.version || "0.0.0");
  }

  function getConfig() {
    const cfg = readJson(configPath, {});
    const owner = String(process.env.WARDOGS_GITHUB_OWNER || cfg.githubOwner || "").trim();
    const repo = String(process.env.WARDOGS_GITHUB_REPO || cfg.githubRepo || "").trim();
    return { owner, repo, configured: Boolean(owner && repo) };
  }

  function getState() {
    return readJson(statePath, {
      lastCheckedAt: null,
      lastUpdatedAt: null,
      lastKnownRemoteVersion: null,
    });
  }

  function saveState(patch) {
    const next = { ...getState(), ...patch };
    writeJson(statePath, next);
    return next;
  }

  function getVersionInfo() {
    const localVersion = getLocalVersion();
    const state = getState();
    const cfg = getConfig();
    return {
      localVersion,
      lastCheckedAt: state.lastCheckedAt,
      lastUpdatedAt: state.lastUpdatedAt,
      lastKnownRemoteVersion: state.lastKnownRemoteVersion,
      updateConfigured: cfg.configured,
      github: cfg.configured ? `${cfg.owner}/${cfg.repo}` : null,
    };
  }

  async function checkForUpdate() {
    const localVersion = getLocalVersion();
    const cfg = getConfig();
    const checkedAt = new Date(now()).toISOString();

    if (!cfg.configured) {
      const state = saveState({ lastCheckedAt: checkedAt });
      return {
        ok: true,
        configured: false,
        localVersion,
        remoteVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        downloadUrl: null,
        lastCheckedAt: state.lastCheckedAt,
        lastUpdatedAt: state.lastUpdatedAt,
        message: "update_not_configured",
      };
    }

    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/latest`;
    const res = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "WardogsViewer-UpdateCheck",
      },
    });

    if (!res.ok) {
      saveState({ lastCheckedAt: checkedAt });
      const err = new Error(`GitHub release check failed (${res.status})`);
      err.status = res.status === 404 ? 404 : 502;
      throw err;
    }

    const release = await res.json();
    const remoteVersion = String(release.tag_name || release.name || "").replace(/^v/i, "");
    const updateAvailable = compareSemver(localVersion, remoteVersion) < 0;
    const asset =
      Array.isArray(release.assets) &&
      release.assets.find((a) =>
        /wardogs|viewer|\.zip$/i.test(String(a.name || ""))
      );

    const state = saveState({
      lastCheckedAt: checkedAt,
      lastKnownRemoteVersion: remoteVersion || null,
    });

    return {
      ok: true,
      configured: true,
      localVersion,
      remoteVersion: remoteVersion || null,
      updateAvailable,
      releaseUrl: release.html_url || null,
      downloadUrl: asset?.browser_download_url || release.zipball_url || null,
      zipballUrl: release.zipball_url || null,
      lastCheckedAt: state.lastCheckedAt,
      lastUpdatedAt: state.lastUpdatedAt,
      message: updateAvailable ? "update_available" : "up_to_date",
    };
  }

  function copyUpdateTree(fromDir, toDir) {
    const keep = new Set([
      "server.js",
      "package.json",
      "package-lock.json",
      "update-config.json",
      "lib",
      "public",
      "Start WARDOGS Viewer.bat",
      "Start WARDOGS Viewer.vbs",
      "SO EINFACH STARTEN.txt",
      "README.md",
      "README.de.md",
    ]);
    for (const name of fs.readdirSync(fromDir)) {
      if (!keep.has(name)) continue;
      const src = path.join(fromDir, name);
      const dest = path.join(toDir, name);
      fs.cpSync(src, dest, { recursive: true, force: true });
    }
  }

  async function extractZip(zipPath, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === "win32") {
      await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
        ],
        { windowsHide: true }
      );
      return;
    }
    await execFileAsync("unzip", ["-o", zipPath, "-d", destDir]);
  }

  function findExtractedRoot(extractDir) {
    const entries = fs
      .readdirSync(extractDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());
    if (entries.length === 1) {
      const nested = path.join(extractDir, entries[0].name);
      if (fs.existsSync(path.join(nested, "package.json"))) return nested;
      // GitHub zipball often has package at nested root
      const kids = fs.readdirSync(nested);
      for (const k of kids) {
        const p = path.join(nested, k);
        if (fs.existsSync(path.join(p, "package.json"))) return p;
      }
      return nested;
    }
    if (fs.existsSync(path.join(extractDir, "package.json"))) return extractDir;
    throw new Error("Could not locate updated application files in archive");
  }

  async function applyUpdate({ downloadUrl } = {}) {
    const check = await checkForUpdate();
    if (!check.configured) {
      const err = new Error("Update source is not configured");
      err.status = 400;
      err.code = "update_not_configured";
      throw err;
    }
    if (!check.updateAvailable) {
      return { ...check, applied: false, message: "up_to_date" };
    }

    const url = downloadUrl || check.downloadUrl || check.zipballUrl;
    if (!url) {
      const err = new Error("No download URL for update");
      err.status = 502;
      throw err;
    }

    const tmpRoot = path.join(rootDir, "data", "update-tmp");
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
    const zipPath = path.join(tmpRoot, "update.zip");
    const extractDir = path.join(tmpRoot, "extract");

    const res = await fetchImpl(url, {
      headers: { "User-Agent": "WardogsViewer-UpdateApply", Accept: "application/octet-stream" },
      redirect: "follow",
    });
    if (!res.ok) {
      const err = new Error(`Download failed (${res.status})`);
      err.status = 502;
      throw err;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(zipPath, buf);

    await extractZip(zipPath, extractDir);
    const sourceRoot = findExtractedRoot(extractDir);
    copyUpdateTree(sourceRoot, rootDir);

    try {
      await execFileAsync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        ["install", "--omit=dev"],
        { cwd: rootDir, windowsHide: true }
      );
    } catch {
      // Dependencies may already be present; continue.
    }

    const updatedAt = new Date(now()).toISOString();
    saveState({
      lastUpdatedAt: updatedAt,
      lastKnownRemoteVersion: check.remoteVersion,
      lastCheckedAt: updatedAt,
    });

    return {
      ok: true,
      applied: true,
      localVersion: check.localVersion,
      remoteVersion: check.remoteVersion,
      restartRequired: true,
      message: "update_applied",
      lastUpdatedAt: updatedAt,
    };
  }

  function scheduleRestart() {
    const bat = path.join(rootDir, "Start WARDOGS Viewer.bat");
    setTimeout(() => {
      try {
        if (process.platform === "win32" && fs.existsSync(bat)) {
          spawn("cmd.exe", ["/c", bat], {
            cwd: rootDir,
            detached: true,
            stdio: "ignore",
            windowsHide: false,
          }).unref();
        } else {
          spawn(process.execPath, [path.join(rootDir, "server.js")], {
            cwd: rootDir,
            detached: true,
            stdio: "ignore",
            env: { ...process.env, WARDOGS_DESKTOP: "1" },
          }).unref();
        }
      } finally {
        process.exit(0);
      }
    }, 800);
  }

  return {
    compareSemver,
    parseSemver,
    getVersionInfo,
    checkForUpdate,
    applyUpdate,
    scheduleRestart,
    getConfig,
  };
}

module.exports = {
  createAppUpdate,
  compareSemver,
  parseSemver,
};
