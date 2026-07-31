import express from "express";
import cors from "cors";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BIN_DIR = path.join(__dirname, "bin");
const IS_WINDOWS = process.platform === "win32";
const BIN_NAME = IS_WINDOWS ? "yt-dlp.exe" : "yt-dlp";
const BIN_PATH = process.env.YT_DLP_PATH || path.join(BIN_DIR, BIN_NAME);

async function ensureYtDlpBinary() {
  if (fs.existsSync(BIN_PATH)) {
    // Periodically update binary to latest release if older than 12 hours
    try {
      const stats = fs.statSync(BIN_PATH);
      const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      if (ageHours < 12) return BIN_PATH;
      console.log(`yt-dlp binary is ${ageHours.toFixed(1)}h old. Updating to latest...`);
    } catch (_) {}
  }

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const downloadUrl = IS_WINDOWS
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

  console.log(`Downloading latest yt-dlp binary from ${downloadUrl}...`);

  return new Promise((resolve, reject) => {
    const downloadFile = (url) => {
      https
        .get(url, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            return downloadFile(response.headers.location);
          }

          if (response.statusCode !== 200) {
            return reject(new Error(`Failed to download yt-dlp binary: HTTP status ${response.statusCode}`));
          }

          const fileStream = fs.createWriteStream(BIN_PATH);
          response.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close(() => {
              if (!IS_WINDOWS) {
                fs.chmodSync(BIN_PATH, 0o755);
              }
              console.log("yt-dlp binary downloaded & updated successfully.");
              resolve(BIN_PATH);
            });
          });

          fileStream.on("error", (err) => {
            fs.unlink(BIN_PATH, () => { });
            reject(err);
          });
        })
        .on("error", reject);
    };

    downloadFile(downloadUrl);
  });
}

async function runYtDlp(url) {
  let executable = BIN_PATH;

  try {
    executable = await ensureYtDlpBinary();
  } catch (err) {
    if (!fs.existsSync(BIN_PATH)) {
      console.warn("Could not download local yt-dlp, attempting system 'yt-dlp':", err.message);
      executable = "yt-dlp";
    }
  }

  const args = [
    "--dump-json",
    "--no-playlist",
    "--skip-download",
    "--no-warnings",
    "--no-check-certificates",
    "--extractor-args", "youtube:player_client=tv_embedded,android_vr,web_creator,mweb",
    url
  ];

  const cookiesPath = path.join(__dirname, "cookies.txt");
  if (fs.existsSync(cookiesPath)) {
    args.push("--cookies", cookiesPath);
  } else if (process.env.YOUTUBE_COOKIES) {
    const tmpCookies = path.join(__dirname, "yt_cookies.txt");
    try {
      const rawEnv = process.env.YOUTUBE_COOKIES.trim();
      const cookieData = rawEnv.startsWith("#") ? rawEnv : Buffer.from(rawEnv, "base64").toString("utf-8");
      fs.writeFileSync(tmpCookies, cookieData);
      args.push("--cookies", tmpCookies);
    } catch (_) {}
  } else if (IS_WINDOWS && process.env.NODE_ENV !== "production") {
    // For local Windows development, attempt to read directly from local Chrome browser cookies
    args.push("--cookies-from-browser", "chrome");
  }

  return new Promise((resolve, reject) => {
    execFile(executable, args, { maxBuffer: 1024 * 1024 * 16 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(stderr || error.message || "Failed to execute yt-dlp"));
      }
      try {
        const json = JSON.parse(stdout);
        resolve(json);
      } catch (parseErr) {
        reject(new Error("Failed to parse yt-dlp JSON output: " + parseErr.message));
      }
    });
  });
}

function extractYouTubeId(url) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

async function extractFromPipedApi(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;

  const PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.video",
    "https://pipedapi.palvelut.org"
  ];

  for (const instance of PIPED_INSTANCES) {
    try {
      const resp = await fetch(`${instance}/streams/${videoId}`);
      if (!resp.ok) continue;
      const data = await resp.json();

      if (!data || (!data.videoStreams && !data.audioStreams)) continue;

      const audioStreams = (data.audioStreams || [])
        .filter((s) => s.url)
        .map((s) => ({
          formatId: s.format || "audio",
          url: s.url,
          ext: s.mimeType?.includes("webm") ? "webm" : "m4a",
          acodec: s.codec || s.mimeType || "audio",
          abr: s.bitrate ? Math.round(s.bitrate / 1000) : 128,
          filesize: s.contentLength || null,
          formatNote: s.quality || "audio"
        }))
        .sort((a, b) => (b.abr || 0) - (a.abr || 0));

      const videoStreams = (data.videoStreams || [])
        .filter((s) => s.url)
        .map((s) => ({
          formatId: s.format || "video",
          url: s.url,
          ext: s.mimeType?.includes("webm") ? "webm" : "mp4",
          resolution: s.quality || (s.height ? `${s.height}p` : "video"),
          width: s.width,
          height: s.height || 0,
          fps: s.fps || 30,
          vcodec: s.codec || s.mimeType || "video",
          acodec: s.videoOnly ? "none" : "audio",
          hasAudio: !s.videoOnly,
          filesize: s.contentLength || null,
          formatNote: s.quality || null
        }))
        .sort((a, b) => (b.height || 0) - (a.height || 0));

      return {
        id: videoId,
        title: data.title || "YouTube Video",
        description: data.description || "",
        thumbnail: data.thumbnailUrl || (data.uploaderAvatar ? data.uploaderAvatar : null),
        duration: data.duration || 0,
        uploader: data.uploader || null,
        webpageUrl: url,
        extractor: "piped:api",
        audioStreams,
        videoStreams
      };
    } catch (_) {}
  }
  return null;
}

async function extractMetadata(url) {
  // 1. Try yt-dlp first
  try {
    const rawData = await runYtDlp(url);
    const formats = rawData.formats || [];

    const audioStreams = formats
      .filter((f) => f.url && (f.vcodec === "none" || (f.acodec !== "none" && !f.height)))
      .map((f) => ({
        formatId: f.format_id,
        url: f.url,
        ext: f.ext,
        acodec: f.acodec,
        abr: f.abr || 0,
        filesize: f.filesize || f.filesize_approx || null,
        formatNote: f.format_note || null,
        httpHeaders: f.http_headers || null
      }))
      .sort((a, b) => (b.abr || 0) - (a.abr || 0));

    const videoStreams = formats
      .filter((f) => f.url && f.vcodec !== "none")
      .map((f) => ({
        formatId: f.format_id,
        url: f.url,
        ext: f.ext,
        resolution: f.resolution || (f.height ? `${f.height}p` : `${f.width || 0}x${f.height || 0}`),
        width: f.width,
        height: f.height || 0,
        fps: f.fps,
        vcodec: f.vcodec,
        acodec: f.acodec,
        hasAudio: f.acodec && f.acodec !== "none",
        filesize: f.filesize || f.filesize_approx || null,
        formatNote: f.format_note || null,
        httpHeaders: f.http_headers || null
      }))
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    if (videoStreams.length > 0 || audioStreams.length > 0) {
      return {
        id: rawData.id,
        title: rawData.title,
        description: rawData.description,
        thumbnail: rawData.thumbnail || (rawData.thumbnails && rawData.thumbnails[rawData.thumbnails.length - 1]?.url),
        duration: rawData.duration,
        uploader: rawData.uploader || rawData.channel || null,
        webpageUrl: rawData.webpage_url || url,
        extractor: rawData.extractor,
        audioStreams,
        videoStreams
      };
    }
  } catch (ytDlpErr) {
    console.warn(`[EdgeDL Server] yt-dlp extraction failed: ${ytDlpErr.message}. Attempting Piped API fallback...`);
  }

  // 2. Fallback to Piped API (Bypasses YouTube bot blocks on Render datacenter IPs)
  const pipedData = await extractFromPipedApi(url);
  if (pipedData) {
    console.log(`[EdgeDL Server] Successfully extracted metadata via Piped API fallback for ${url}`);
    return pipedData;
  }

  throw new Error("Unable to extract video streams from both yt-dlp and fallback service.");
}

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "EdgeDL API Server" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/extract", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ success: false, error: "Missing 'url' query parameter" });
  }

  try {
    const data = await extractMetadata(targetUrl);
    res.json({ success: true, data });
  } catch (err) {
    console.error("Extraction error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`EdgeDL Server running on http://localhost:${PORT}`);
});

export default app;
