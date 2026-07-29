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


// Download yt-dlp binary if not present locally or in PATH

async function ensureYtDlpBinary() {
  if (fs.existsSync(BIN_PATH)) {
    return BIN_PATH;
  }

  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  const downloadUrl = IS_WINDOWS
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

  console.log(`Downloading yt-dlp binary from ${downloadUrl}...`);

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
              console.log("yt-dlp binary downloaded successfully.");
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


//  Runs yt-dlp --dump-json on the target URL

async function runYtDlp(url) {
  let executable = BIN_PATH;

  if (!fs.existsSync(BIN_PATH)) {
    try {
      executable = await ensureYtDlpBinary();
    } catch (err) {
      console.warn("Could not download local yt-dlp, attempting system 'yt-dlp':", err.message);
      executable = "yt-dlp";
    }
  }

  const args = [
    "--dump-json",
    "--no-warnings",
    "--no-call-home",
    "--no-check-certificates",
    "--prefer-free-formats",
    url
  ];

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


//  Extracts formatted audio and video stream URLs

async function extractMetadata(url) {
  const rawData = await runYtDlp(url);
  const formats = rawData.formats || [];

  const audioStreams = formats
    .filter((f) => f.url && (f.vcodec === "none" || (f.acodec !== "none" && !f.height)))
    .map((f) => ({
      formatId: f.format_id,
      url: f.url,
      ext: f.ext,
      acodec: f.acodec,
      abr: f.abr || null,
      filesize: f.filesize || f.filesize_approx || null,
      formatNote: f.format_note || null
    }));

  const videoStreams = formats
    .filter((f) => f.url && f.vcodec !== "none")
    .map((f) => ({
      formatId: f.format_id,
      url: f.url,
      ext: f.ext,
      resolution: f.resolution || `${f.width || 0}x${f.height || 0}`,
      width: f.width,
      height: f.height,
      fps: f.fps,
      vcodec: f.vcodec,
      acodec: f.acodec,
      hasAudio: f.acodec && f.acodec !== "none",
      filesize: f.filesize || f.filesize_approx || null,
      formatNote: f.format_note || null
    }));

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

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "EdgeDL API Server" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server operational" });
});

const handleExtract = async (req, res) => {
  const targetUrl = req.query.url || (req.body && req.body.url);

  if (!targetUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing 'url' parameter. Provide ?url=... in query or JSON body { \"url\": \"...\" }"
    });
  }

  try {
    const data = await extractMetadata(targetUrl);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("Extraction error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to process media URL"
    });
  }
};

app.get("/api/extract", handleExtract);
app.post("/api/extract", handleExtract);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});


export default app;
