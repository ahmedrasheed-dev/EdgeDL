import express from "express";
import cors from "cors";
import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import { downloadManager } from "./downloadManager.js";
import ffmpegPath from "ffmpeg-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let userAppDataDir;
if (process.env.APPDATA) {
  userAppDataDir = path.join(process.env.APPDATA, "EdgeDL");
} else if (process.env.HOME) {
  userAppDataDir = path.join(process.env.HOME, ".edgedl");
} else {
  userAppDataDir = __dirname;
}

const settingsPath = path.join(userAppDataDir, "settings.json");

function getSettings() {
  const defaults = {
    port: 5000,
    updateChannel: "nightly",
    cookieSource: "none",
    customCookieFile: "",
    saveDir: null
  };
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      return { ...defaults, ...data };
    }
  } catch (_) {}
  return defaults;
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(userAppDataDir)) fs.mkdirSync(userAppDataDir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e) {
    console.warn("[EdgeDL Server] Failed to save settings:", e.message);
  }
}

function sanitizeFolderName(name) {
  if (!name) return "Playlist";
  return name.replace(/[\\/:*?"<>|]/g, "_").substring(0, 60).trim();
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function downloadImageWithHeaders(imageUrl, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = imageUrl.startsWith("https") ? https : http;
    const req = protocol.get(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": "https://www.youtube.com/"
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImageWithHeaders(response.headers.location, destPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP ${response.statusCode} downloading image`));
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => resolve(destPath));
      });
    });
    req.on("error", (err) => {
      if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch (_) {}
      reject(err);
    });
  });
}

const BIN_DIR = path.join(userAppDataDir, "bin");
const IS_WINDOWS = process.platform === "win32";
const BIN_NAME = IS_WINDOWS ? "yt-dlp.exe" : "yt-dlp";
const BIN_PATH = process.env.YT_DLP_PATH || path.join(BIN_DIR, BIN_NAME);
const BUNDLED_BIN_PATH = path.join(__dirname, "..", "bin", BIN_NAME);

// SSE clients for real-time progress streaming
const binarySseClients = new Set();

function broadcastBinaryProgress(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of binarySseClients) {
    try {
      res.write(payload);
    } catch (_) {
      binarySseClients.delete(res);
    }
  }
}

const binaryState = {
  status: "idle", // idle, checking, downloading, completed, up-to-date, error
  progress: 0,
  downloadedBytes: "0 MB",
  totalBytes: "0 MB",
  downloadedRaw: 0,
  totalRaw: 0,
  speed: "0 MB/s",
  error: null,
  needsUpdate: false,
  lastUpdated: null,
  ageHours: null,
  binaryPath: BIN_PATH,
  ffmpeg: { ok: false, version: null }
};

function getResolvedFfmpegPath() {
  const binaryName = IS_WINDOWS ? "ffmpeg.exe" : "ffmpeg";

  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  if (ffmpegPath) {
    let cleanPath = ffmpegPath;
    if (cleanPath.includes("app.asar")) {
      cleanPath = cleanPath.replace("app.asar", "app.asar.unpacked");
    }
    if (fs.existsSync(cleanPath)) {
      return cleanPath;
    }
  }

  if (process.resourcesPath) {
    const resourcePath = path.join(process.resourcesPath, "ffmpeg-static", binaryName);
    if (fs.existsSync(resourcePath)) {
      return resourcePath;
    }
    const unpackedPath = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-static", binaryName);
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }
  }

  const localNodePath = path.join(__dirname, "..", "node_modules", "ffmpeg-static", binaryName);
  if (fs.existsSync(localNodePath)) {
    return localNodePath;
  }

  return ffmpegPath || "ffmpeg";
}

function checkFfmpegHealth() {
  return new Promise((resolve) => {
    const resolvedPath = getResolvedFfmpegPath();
    if (!resolvedPath || (!fs.existsSync(resolvedPath) && resolvedPath !== "ffmpeg")) {
      const info = { ok: false, version: null, error: `FFmpeg binary not found at ${resolvedPath || 'path'}` };
      binaryState.ffmpeg = info;
      return resolve(info);
    }
    execFile(resolvedPath, ["-version"], { windowsHide: true, timeout: 6000 }, (err, stdout) => {
      if (err) {
        const info = { ok: false, version: null, error: err.message };
        binaryState.ffmpeg = info;
        return resolve(info);
      }
      const firstLine = (stdout || "").split("\n")[0] || "";
      const verMatch = firstLine.match(/ffmpeg\s+version\s+([^\s]+)/i);
      const version = verMatch ? verMatch[1] : (firstLine.substring(0, 25).trim() || "v6.x");
      const info = { ok: true, version, details: firstLine.trim() };
      binaryState.ffmpeg = info;
      resolve(info);
    });
  });
}

function getBinaryStats() {
  let exists = false;
  let ageHours = null;
  let lastUpdated = null;
  let sizeBytes = 0;

  try {
    if (fs.existsSync(BIN_PATH)) {
      exists = true;
      const stats = fs.statSync(BIN_PATH);
      ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      lastUpdated = stats.mtime.toISOString();
      sizeBytes = stats.size;
    }
  } catch (_) {}

  // If APPDATA binary doesn't exist but bundled binary exists, copy as initial seed
  if (!exists && fs.existsSync(BUNDLED_BIN_PATH)) {
    try {
      if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
      fs.copyFileSync(BUNDLED_BIN_PATH, BIN_PATH);
      if (!IS_WINDOWS) try { fs.chmodSync(BIN_PATH, 0o755); } catch (_) {}
      exists = true;
      const stats = fs.statSync(BIN_PATH);
      ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      lastUpdated = stats.mtime.toISOString();
      sizeBytes = stats.size;
    } catch (_) {}
  }

  const needsUpdate = !exists || (ageHours !== null && ageHours >= 24);
  binaryState.needsUpdate = needsUpdate;
  binaryState.lastUpdated = lastUpdated;
  binaryState.ageHours = ageHours !== null ? parseFloat(ageHours.toFixed(1)) : null;

  return { exists, ageHours, lastUpdated, needsUpdate, sizeBytes };
}

let activeDownloadPromise = null;

async function downloadDirectBinary() {
  const settings = getSettings();
  const channel = settings.updateChannel || "nightly";
  let binaryUrl;
  if (channel === "nightly") {
    binaryUrl = IS_WINDOWS
      ? "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe"
      : "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp";
  } else {
    binaryUrl = IS_WINDOWS
      ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
      : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
  }

  const tempPath = BIN_PATH + ".tmp";

  binaryState.status = "downloading";
  binaryState.progress = 5;
  binaryState.speed = "Connecting...";
  binaryState.error = null;
  broadcastBinaryProgress(binaryState);

  console.log(`[EdgeDL Server] Streaming fast binary download from GitHub CDN...`);

  const response = await fetch(binaryUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EdgeDL-Standalone/1.4.6"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading binary from GitHub`);
  }

  const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
  binaryState.totalRaw = contentLength;
  if (contentLength > 0) {
    binaryState.totalBytes = formatBytes(contentLength);
  } else {
    binaryState.totalBytes = "~ 18.2 MB";
  }

  const fileStream = fs.createWriteStream(tempPath, { highWaterMark: 1024 * 1024 });
  const reader = response.body.getReader();

  let downloaded = 0;
  let prevBytes = 0;
  let prevTime = Date.now();
  let lastBroadcast = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    fileStream.write(Buffer.from(value));
    downloaded += value.length;
    binaryState.downloadedRaw = downloaded;
    binaryState.downloadedBytes = formatBytes(downloaded);

    const now = Date.now();
    if (now - lastBroadcast >= 60) {
      const timeDiff = (now - prevTime) / 1000;
      if (timeDiff >= 0.1) {
        const bps = (downloaded - prevBytes) / timeDiff;
        binaryState.speed = (bps / (1024 * 1024)).toFixed(1) + " MB/s";
        prevBytes = downloaded;
        prevTime = now;
      }

      if (contentLength > 0) {
        binaryState.progress = Math.min(99, Math.round((downloaded / contentLength) * 100));
      } else {
        binaryState.progress = Math.min(95, Math.round((downloaded / (18.2 * 1024 * 1024)) * 100));
      }

      lastBroadcast = now;
      broadcastBinaryProgress(binaryState);
    }
  }

  await new Promise((res, rej) => {
    fileStream.end(() => res());
    fileStream.on("error", rej);
  });

  if (fs.existsSync(BIN_PATH)) {
    try { fs.unlinkSync(BIN_PATH); } catch (_) {}
  }
  fs.renameSync(tempPath, BIN_PATH);
  if (!IS_WINDOWS) {
    try { fs.chmodSync(BIN_PATH, 0o755); } catch (_) {}
  }

  binaryState.status = "completed";
  binaryState.progress = 100;
  binaryState.speed = "Ready";
  binaryState.downloadedBytes = formatBytes(downloaded);
  binaryState.totalBytes = formatBytes(downloaded);
  binaryState.needsUpdate = false;
  binaryState.lastUpdated = new Date().toISOString();
  binaryState.ageHours = 0;
  binaryState.error = null;

  broadcastBinaryProgress(binaryState);
  console.log(`[EdgeDL Server] High-speed binary download completed at ${BIN_PATH}`);
  return BIN_PATH;
}

function downloadYtDlpBinary(force = false) {
  const stats = getBinaryStats();

  if (activeDownloadPromise) {
    return activeDownloadPromise;
  }

  if (!fs.existsSync(BIN_DIR)) {
    try { fs.mkdirSync(BIN_DIR, { recursive: true }); } catch (_) {}
  }

  activeDownloadPromise = (async () => {
    try {
      // Direct high-speed stream download with real-time progress
      const res = await downloadDirectBinary();
      activeDownloadPromise = null;
      return res;
    } catch (err) {
      activeDownloadPromise = null;

      // Clean temp file
      const tempPath = BIN_PATH + ".tmp";
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }

      // Fallback to bundled binary if main is missing
      if (!fs.existsSync(BIN_PATH) && fs.existsSync(BUNDLED_BIN_PATH)) {
        try {
          fs.copyFileSync(BUNDLED_BIN_PATH, BIN_PATH);
          if (!IS_WINDOWS) try { fs.chmodSync(BIN_PATH, 0o755); } catch (_) {}
        } catch (_) {}
      }

      binaryState.status = "error";
      binaryState.error = err.message || "Failed to update binary";
      broadcastBinaryProgress(binaryState);
      console.warn(`[EdgeDL Server] Binary update error:`, err.message);

      if (fs.existsSync(BIN_PATH)) {
        return BIN_PATH;
      }
      throw err;
    }
  })();

  return activeDownloadPromise;
}

async function ensureYtDlpBinary() {
  if (fs.existsSync(BIN_PATH)) {
    return BIN_PATH;
  }
  const stats = getBinaryStats();
  if (stats.exists) {
    return BIN_PATH;
  }
  try {
    return await downloadYtDlpBinary(false);
  } catch (err) {
    if (fs.existsSync(BIN_PATH)) return BIN_PATH;
    throw err;
  }
}

function executeYtDlpCommand(executable, args) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { maxBuffer: 25 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr || stdout || error.message));
      }
      resolve(stdout);
    });
  });
}

async function runYtDlp(args) {
  let executable;
  try {
    executable = await ensureYtDlpBinary();
  } catch (err) {
    console.warn(`[EdgeDL Server] Binary auto-update failed, attempting local fallback:`, err.message);
    executable = fs.existsSync(BIN_PATH) ? BIN_PATH : "yt-dlp";
  }

  const baseBypassArgs = [
    "--js-runtimes", "node",
    "--extractor-args", "youtube:player_client=web_embedded,android"
  ];

  const settings = getSettings();
  let cookieArgs = [];
  if (settings.cookieSource && settings.cookieSource !== "none") {
    if (settings.cookieSource === "custom" && settings.customCookieFile && fs.existsSync(settings.customCookieFile)) {
      cookieArgs = ["--cookies", settings.customCookieFile];
    } else if (settings.cookieSource !== "custom") {
      cookieArgs = ["--cookies-from-browser", settings.cookieSource];
    }
  }

  try {
    return await executeYtDlpCommand(executable, [...baseBypassArgs, ...cookieArgs, ...args]);
  } catch (err) {
    if (cookieArgs.length > 0) {
      console.warn(`[EdgeDL Server] Retrying yt-dlp extraction without cookies due to error:`, err.message);
      return await executeYtDlpCommand(executable, [...baseBypassArgs, ...args]);
    }
    throw err;
  }
}

// Health Check Endpoint
app.get("/api/health", async (req, res) => {
  const stats = getBinaryStats();
  const ffmpegInfo = await checkFfmpegHealth();
  res.json({
    status: "ok",
    service: "EdgeDL Native Server",
    ytDlpAvailable: stats.exists,
    ffmpegAvailable: ffmpegInfo.ok,
    ffmpegVersion: ffmpegInfo.version,
    binaryNeedsUpdate: stats.needsUpdate,
    binaryAgeHours: stats.ageHours
  });
});

// Binary Status Endpoint
app.get("/api/binary/status", async (req, res) => {
  const stats = getBinaryStats();
  const ffmpegInfo = await checkFfmpegHealth();
  res.json({
    success: true,
    data: {
      ...binaryState,
      exists: stats.exists,
      needsUpdate: stats.needsUpdate,
      ageHours: stats.ageHours,
      lastUpdated: stats.lastUpdated,
      sizeBytes: stats.sizeBytes,
      ffmpeg: ffmpegInfo
    }
  });
});

// Startup Check Endpoint - checks FFmpeg & triggers yt-dlp update if missing or older than 24h
app.get("/api/binary/startup-check", async (req, res) => {
  try {
    const force = req.query.force === "true";
    const stats = getBinaryStats();
    const ffmpegInfo = await checkFfmpegHealth();

    let ytDlpVersion = null;
    if (stats.exists) {
      try {
        ytDlpVersion = await new Promise((resolve) => {
          execFile(BIN_PATH, ["--version"], { windowsHide: true, timeout: 4000 }, (err, stdout) => {
            if (err) resolve(null);
            else resolve(stdout.trim());
          });
        });
      } catch (_) {}
    }

    const needsUpdate = force || stats.needsUpdate || !stats.exists;

    if (needsUpdate) {
      downloadYtDlpBinary(true).catch((e) => {
        console.warn("[EdgeDL Server] Startup binary update background error:", e.message);
      });
    } else {
      binaryState.status = "up-to-date";
      binaryState.progress = 100;
      binaryState.speed = "Up to date";
    }

    res.json({
      success: true,
      needsUpdate,
      ffmpeg: ffmpegInfo,
      ytDlp: {
        exists: stats.exists,
        version: ytDlpVersion,
        lastUpdated: stats.lastUpdated,
        ageHours: stats.ageHours,
        needsUpdate
      },
      state: binaryState
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Binary Update Trigger Endpoint
app.post("/api/binary/update", async (req, res) => {
  const { force } = req.body || {};
  const stats = getBinaryStats();
  const ffmpegInfo = await checkFfmpegHealth();

  if (!force && !stats.needsUpdate && stats.exists) {
    return res.json({
      success: true,
      updated: false,
      message: "Binary is already up to date.",
      data: {
        ...binaryState,
        status: "up-to-date",
        exists: stats.exists,
        needsUpdate: false,
        ageHours: stats.ageHours,
        lastUpdated: stats.lastUpdated,
        ffmpeg: ffmpegInfo
      }
    });
  }

  // Trigger update asynchronously
  downloadYtDlpBinary(!!force).catch((e) => {
    console.warn("[EdgeDL Server] Async binary update error:", e.message);
  });

  res.json({
    success: true,
    updated: true,
    message: "Binary update started.",
    data: {
      ...binaryState,
      status: "downloading",
      ffmpeg: ffmpegInfo
    }
  });
});

// Binary Progress SSE Stream
app.get("/api/binary/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  binarySseClients.add(res);

  const stats = getBinaryStats();
  res.write(`data: ${JSON.stringify({ ...binaryState, exists: stats.exists, needsUpdate: stats.needsUpdate })}\n\n`);

  req.on("close", () => {
    binarySseClients.delete(res);
  });
});

// Settings GET Endpoint
app.get("/api/settings", (req, res) => {
  const settings = getSettings();
  res.json({
    success: true,
    settings
  });
});

// Settings POST Endpoint
app.post("/api/settings", (req, res) => {
  const newSettings = req.body || {};
  const current = getSettings();
  const updated = { ...current, ...newSettings };
  saveSettings(updated);
  res.json({ success: true, settings: updated });
});

// Config GET Endpoint
app.get("/api/config", (req, res) => {
  const settings = getSettings();
  res.json({
    success: true,
    port: activePort || settings.port || 5000,
    saveDir: settings.saveDir || null,
    settings
  });
});

// Config POST Port Endpoint - Persists settings and restarts HTTP listener
app.post("/api/config/port", (req, res) => {
  const { port } = req.body;
  const targetPort = parseInt(port, 10);
  if (!targetPort || targetPort < 1024 || targetPort > 65535) {
    return res.status(400).json({ success: false, error: "Invalid port number. Must be between 1024 and 65535." });
  }

  const settings = getSettings();
  settings.port = targetPort;
  saveSettings(settings);

  res.json({ success: true, port: targetPort, message: `Server restarting on port ${targetPort}...` });

  // Dynamically restart HTTP listener on the new port
  setTimeout(() => {
    startServer(targetPort);
  }, 100);
});

// Media Analysis Endpoint (Supports Single Media & Playlists)
app.get("/api/extract", async (req, res) => {
  const videoUrl = req.query.url;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: "Missing 'url' query parameter" });
  }

  try {
    const isPlaylistUrl = videoUrl.includes("list=") || videoUrl.includes("/playlist") || videoUrl.includes("/channel/") || videoUrl.includes("/@");

    if (isPlaylistUrl) {
      // Extract playlist items with flat dump
      const stdout = await runYtDlp([
        "--dump-single-json",
        "--flat-playlist",
        "--no-warnings",
        "--no-check-certificates",
        videoUrl
      ]);

      const info = JSON.parse(stdout);

      if (info._type === "playlist" || Array.isArray(info.entries)) {
        const entries = (info.entries || []).map((e, idx) => ({
          index: idx + 1,
          id: e.id,
          title: e.title || `Track ${idx + 1}`,
          duration: e.duration || 0,
          url: e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : videoUrl),
          thumbnail: e.thumbnail || (Array.isArray(e.thumbnails) ? e.thumbnails[0]?.url : null)
        }));

        return res.json({
          success: true,
          data: {
            isPlaylist: true,
            title: info.title || "Playlist",
            uploader: info.uploader || info.channel || "YouTube",
            entriesCount: entries.length,
            entries
          }
        });
      }
    }

    // Standard single video dump-json
    const stdout = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      "--skip-download",
      "--no-warnings",
      "--no-check-certificates",
      videoUrl
    ]);

    const info = JSON.parse(stdout);

    const videoStreams = [];
    const audioStreams = [];

    if (Array.isArray(info.formats)) {
      info.formats.forEach((f) => {
        if (!f.format_id) return;
        const vcodec = f.vcodec || "none";
        const acodec = f.acodec || "none";

        if (vcodec !== "none") {
          videoStreams.push({
            formatId: f.format_id,
            ext: f.ext || "mp4",
            resolution: f.resolution || (f.height ? `${f.height}p` : "video"),
            width: f.width,
            height: f.height,
            fps: f.fps,
            vcodec: f.vcodec,
            filesize: f.filesize || f.filesize_approx || null,
            hasAudio: acodec !== "none"
          });
        }

        if (acodec !== "none" && vcodec === "none") {
          const isOriginal = (f.language_preference !== undefined && f.language_preference >= 10) || (f.format_note && f.format_note.toLowerCase().includes("original"));
          audioStreams.push({
            formatId: f.format_id,
            ext: f.ext || "m4a",
            abr: f.abr || Math.round(f.tbr) || null,
            acodec: f.acodec,
            filesize: f.filesize || f.filesize_approx || null,
            language: f.language || (f.language_preference >= 10 ? "en (Original)" : null),
            formatNote: f.format_note || null,
            isOriginal: !!isOriginal
          });
        }
      });
    }

    videoStreams.sort((a, b) => (b.height || 0) - (a.height || 0));
    audioStreams.sort((a, b) => (b.abr || 0) - (a.abr || 0));

    res.json({
      success: true,
      data: {
        isPlaylist: false,
        id: info.id,
        title: info.title,
        description: info.description,
        thumbnail: info.thumbnail,
        duration: info.duration,
        uploader: info.uploader,
        webpageUrl: info.webpage_url || videoUrl,
        videoStreams,
        audioStreams
      }
    });
  } catch (err) {
    console.error(`[EdgeDL Server] Extract Error:`, err.message);
    let friendlyErr = err.message || "Failed to extract media information";
    let suggestion = "Please verify the URL or try again in a moment.";

    if (friendlyErr.includes("getaddrinfo") || friendlyErr.includes("Failed to resolve")) {
      friendlyErr = "Network Error: Could not resolve or connect to media host.";
      suggestion = "Please check your internet connection.";
    } else if (friendlyErr.includes("Video unavailable") || friendlyErr.includes("Private video")) {
      friendlyErr = "Video Unavailable: This video is private or has been removed.";
      suggestion = "Please verify the URL in your web browser.";
    } else if (friendlyErr.includes("403") || friendlyErr.includes("Forbidden")) {
      friendlyErr = "Access Blocked: Media stream was temporarily blocked by the host.";
      suggestion = "Please retry in a moment.";
    }

    res.status(500).json({ success: false, error: friendlyErr, rawError: err.message, suggestion });
  }
});

// Save Thumbnail Endpoint
app.post("/api/download/thumbnail", async (req, res) => {
  const { url, title, outputDir } = req.body;
  if (!url) return res.status(400).json({ success: false, error: "Missing thumbnail URL." });

  try {
    const finalDir = outputDir || path.join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads", "EdgeDL");
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

    const safeTitle = sanitizeFolderName(title || "thumbnail");
    const filePath = path.join(finalDir, `${safeTitle}_thumbnail.jpg`);

    await downloadImageWithHeaders(url, filePath);
    res.json({ success: true, filePath });
  } catch (err) {
    console.error("[EdgeDL Server] Thumbnail Download Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download Start Endpoint
app.post("/api/download/start", async (req, res) => {
  const { url, downloadType = "video-audio", videoFormatId, audioFormatId, quality = "best", outputFormat = "mp4", outputDir, title, speedLimit, subtitleOption, thumbnailOption, startTime, endTime } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: "Missing 'url' parameter" });
  }

  let executable;
  try {
    executable = await ensureYtDlpBinary();
  } catch (_) {
    executable = fs.existsSync(BIN_PATH) ? BIN_PATH : "yt-dlp";
  }

  try {
    const task = downloadManager.startDownload({
      url,
      downloadType,
      videoFormatId,
      audioFormatId,
      quality,
      outputFormat,
      outputDir,
      title,
      speedLimit,
      subtitleOption,
      thumbnailOption,
      startTime,
      endTime,
      binPath: executable,
      ffmpegPath: getResolvedFfmpegPath()
    });

    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Batch Playlist Download Endpoint with Automatic Subfolder Creation
app.post("/api/download/batch", async (req, res) => {
  const { items, playlistTitle, downloadType = "video-audio", videoFormatId, audioFormatId, quality = "best", outputFormat = "mp4", outputDir, speedLimit, subtitleOption, thumbnailOption } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "No items provided for batch download." });
  }

  // Auto-create Playlist Subfolder
  const baseDir = outputDir || path.join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads", "EdgeDL");
  const targetFolder = playlistTitle ? path.join(baseDir, sanitizeFolderName(playlistTitle)) : baseDir;
  if (!fs.existsSync(targetFolder)) {
    try { fs.mkdirSync(targetFolder, { recursive: true }); } catch (_) {}
  }

  let executable;
  try {
    executable = await ensureYtDlpBinary();
  } catch (_) {
    executable = fs.existsSync(BIN_PATH) ? BIN_PATH : "yt-dlp";
  }

  const tasks = [];
  for (const item of items) {
    if (!item.url) continue;
    try {
      const task = downloadManager.startDownload({
        url: item.url,
        downloadType,
        videoFormatId,
        audioFormatId,
        quality,
        outputFormat,
        outputDir: targetFolder,
        title: item.title,
        speedLimit,
        subtitleOption,
        thumbnailOption,
        binPath: executable,
        ffmpegPath: getResolvedFfmpegPath()
      });
      tasks.push(task);
    } catch (_) {}
  }

  res.json({ success: true, count: tasks.length, tasks, playlistFolder: targetFolder });
});

// Pause active download task
app.post("/api/download/pause", (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ success: false, error: "Missing 'taskId' parameter" });
  }

  const success = downloadManager.pauseDownload(taskId);
  res.json({ success, taskId });
});

// Resume paused download task
app.post("/api/download/resume", (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ success: false, error: "Missing 'taskId' parameter" });
  }

  const success = downloadManager.resumeDownload(taskId);
  res.json({ success, taskId });
});

// Cancel active download task
app.post("/api/download/cancel", (req, res) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ success: false, error: "Missing 'taskId' parameter" });
  }

  const success = downloadManager.cancelDownload(taskId);
  res.json({ success, taskId });
});

// Get all active & completed download tasks
app.get("/api/download/tasks", (req, res) => {
  res.json({ success: true, tasks: downloadManager.getAllTasks() });
});

// Storage Analytics Endpoint
app.get("/api/stats", (req, res) => {
  try {
    const defaultDir = path.join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads", "EdgeDL");
    let totalBytes = 0;
    let totalFiles = 0;

    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (stat.isFile() && !item.endsWith(".part")) {
            totalBytes += stat.size;
            totalFiles++;
          }
        } catch (_) {}
      }
    }

    scanDir(defaultDir);

    res.json({
      success: true,
      totalFiles,
      totalBytes,
      totalSizeFormatted: formatBytes(totalBytes),
      folderPath: defaultDir
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const initialSettings = getSettings();
const PORT = process.env.PORT || initialSettings.port || 5000;
let activePort = PORT;
let serverInstance = null;

function startServer(portToUse) {
  if (serverInstance) {
    try {
      serverInstance.close(() => {
        console.log(`[EdgeDL Server] Listener closed on old port.`);
      });
    } catch (_) {}
  }

  serverInstance = app.listen(portToUse, () => {
    activePort = portToUse;
    console.log(`==========================================`);
    console.log(`🚀 EdgeDL Standalone App running on http://localhost:${activePort}`);
    console.log(`==========================================`);
  });

  serverInstance.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[EdgeDL Server] Port ${portToUse} is in use. Trying port ${portToUse + 1}...`);
      if (portToUse < 5030) {
        startServer(portToUse + 1);
      }
    } else {
      console.error("[EdgeDL Server Error]:", err);
    }
  });
}

startServer(PORT);

export function getActivePort() {
  return activePort || PORT;
}

export default app;
