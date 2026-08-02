import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import events from "events";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function parseBytesToNum(str) {
  if (!str || typeof str !== "string") return 0;
  const match = str.match(/([\d\.]+)\s*([kKMmGg][bB]?)?/);
  if (!match) return 0;
  let val = parseFloat(match[1]);
  if (isNaN(val)) return 0;
  const unit = (match[2] || "").toUpperCase();
  if (unit.startsWith("G")) val *= 1024 * 1024 * 1024;
  else if (unit.startsWith("M")) val *= 1024 * 1024;
  else if (unit.startsWith("K")) val *= 1024;
  return val;
}

class DownloadManager extends events.EventEmitter {
  constructor() {
    super();
    this.tasks = new Map(); // taskId -> taskObject
    this.processes = new Map(); // taskId -> ChildProcess
    this.maxConcurrent = 3;
  }

  getAllTasks() {
    const list = Array.from(this.tasks.values());
    for (const t of list) {
      this.enrichTaskWithDiskStats(t);
    }
    return list;
  }

  getTask(taskId) {
    const t = this.tasks.get(taskId);
    if (t) this.enrichTaskWithDiskStats(t);
    return t;
  }

  getActiveTasksCount() {
    let count = 0;
    for (const t of this.tasks.values()) {
      if (t.status === "starting" || t.status === "downloading" || t.status === "processing") {
        count++;
      }
    }
    return count;
  }

  processQueue() {
    let activeCount = this.getActiveTasksCount();
    if (activeCount >= this.maxConcurrent) return;

    for (const task of this.tasks.values()) {
      if (task.status === "queued" && task.params) {
        task.status = "starting";
        task.speed = "Decrypting streams...";
        task.eta = "Connecting...";
        const { binPath, args, finalDir } = task.params;
        console.log(`[DownloadManager] Promoting queued task ${task.id} to active.`);
        this.spawnAndMonitor(task.id, task, binPath, args, finalDir);

        activeCount++;
        if (activeCount >= this.maxConcurrent) break;
      }
    }
  }

  enrichTaskWithDiskStats(task) {
    if (!task) return;
    try {
      if (task.filePath && fs.existsSync(task.filePath)) {
        const stats = fs.statSync(task.filePath);
        if (stats.size > 0) {
          const szStr = formatSize(stats.size);
          if (szStr) {
            task.downloadedBytes = szStr;
            task.totalBytes = szStr;
          }
        }
      } else if (task.outputDir && fs.existsSync(task.outputDir)) {
        const files = fs.readdirSync(task.outputDir);
        for (const f of files) {
          if (f.includes(task.id) || (task.title && f.includes(task.title.substring(0, 10)))) {
            const p = path.join(task.outputDir, f);
            const stats = fs.statSync(p);
            if (stats.size > 0) {
              const szStr = formatSize(stats.size);
              if (szStr && (task.downloadedBytes === "0 MB" || task.downloadedBytes === "NA" || !task.downloadedBytes)) {
                task.downloadedBytes = szStr;
              }
            }
          }
        }
      }
    } catch (_) {}
  }

  killProcessTree(child) {
    if (!child || !child.pid) return;
    try {
      if (process.platform === "win32") {
        execFile("taskkill", ["/F", "/T", "/PID", String(child.pid)], () => {});
      } else {
        child.kill("SIGTERM");
      }
    } catch (_) {
      try { child.kill("SIGKILL"); } catch (_) {}
    }
  }

  startDownload({ url, downloadType = "video-audio", videoFormatId, audioFormatId, quality = "best", outputFormat = "mp4", outputDir, title, speedLimit, subtitleOption, thumbnailOption, binPath, ffmpegPath }) {
    const taskId = "dl_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    
    // Default download directory: User's Downloads/EdgeDL
    const finalDir = outputDir || path.join(process.env.USERPROFILE || process.env.HOME || ".", "Downloads", "EdgeDL");
    if (!fs.existsSync(finalDir)) {
      try { fs.mkdirSync(finalDir, { recursive: true }); } catch (_) {}
    }

    const outputTemplate = path.join(finalDir, `%(title)s [${taskId}].%(ext)s`);

    const task = {
      id: taskId,
      url,
      title: title || "Downloading Media",
      downloadType, // "video-audio", "video-only", "audio-only"
      status: "starting", // starting, downloading, queued, paused, processing, completed, canceled, error
      paused: false,
      progress: 0,
      speed: "Decrypting streams...",
      eta: "Connecting...",
      downloadedBytes: "0 MB",
      totalBytes: "0 MB",
      error: null,
      outputDir: finalDir,
      filePath: null,
      createdAt: new Date().toISOString(),
      currentStreamIndex: 0,
      startTimeMs: Date.now(),
      params: null
    };

    this.tasks.set(taskId, task);

    // Build valid yt-dlp arguments with --continue (-c) for Range byte resumption
    const args = [
      "--continue",
      "--progress",
      "--newline",
      "--no-playlist",
      "--no-check-certificates",
      "--progress-template", "download:[progress] %(progress._percent_str)s | %(progress._speed_str)s | %(progress._eta_str)s | %(progress._downloaded_bytes_str)s | %(progress._total_bytes_str)s",
      "-o", outputTemplate
    ];

    if (ffmpegPath) {
      args.push("--ffmpeg-location", ffmpegPath);
    }

    // Bandwidth Speed Limit Throttling
    if (speedLimit && speedLimit !== "unlimited") {
      args.push("--rate-limit", speedLimit);
    }

    // Subtitle Extraction & Embedding (Single English track match to prevent duplicate subtitle downloads)
    if (subtitleOption === "embed") {
      args.push(
        "--embed-subs",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs", "en",
        "--no-abort-on-error",
        "--ignore-errors"
      );
    } else if (subtitleOption === "srt") {
      args.push(
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs", "en",
        "--convert-subs", "srt",
        "--no-abort-on-error",
        "--ignore-errors"
      );
    }

    // Playlist / Single Video Thumbnail Downloading Option
    if (thumbnailOption === "download") {
      args.push("--write-thumbnail", "--convert-thumbnails", "jpg");
    }

    // Format & Quality Selection Logic
    if (downloadType === "audio-only") {
      const audioExt = outputFormat || "mp3";
      args.push("-x", "--audio-format", audioExt);
      if (audioFormatId) {
        args.push("-f", audioFormatId);
      }
    } else if (downloadType === "video-only") {
      if (videoFormatId) {
        args.push("-f", videoFormatId);
      } else {
        args.push("-f", "bestvideo");
      }
      args.push("--merge-output-format", outputFormat || "mp4");
    } else {
      // video-audio
      if (videoFormatId && audioFormatId) {
        args.push("-f", `${videoFormatId}+${audioFormatId}`);
      } else if (videoFormatId) {
        args.push("-f", videoFormatId);
      } else if (quality && quality !== "best") {
        const heightCap = parseInt(quality.replace("p", ""), 10);
        if (heightCap > 0) {
          args.push("-f", `bestvideo[height<=${heightCap}]+bestaudio/best[height<=${heightCap}]/best`);
        } else {
          args.push("-f", "bestvideo+bestaudio/best");
        }
      } else {
        args.push("-f", "bestvideo+bestaudio/best");
      }
      args.push("--merge-output-format", outputFormat || "mp4");
    }

    const cookiesPath = path.join(__dirname, "cookies.txt");
    if (fs.existsSync(cookiesPath)) {
      args.push("--cookies", cookiesPath);
    }

    args.push(url);

    // Store task params for pause / resume / queue capabilities
    task.params = { binPath, args, finalDir, videoFormatId, audioFormatId };

    const activeCount = this.getActiveTasksCount();
    if (activeCount >= this.maxConcurrent) {
      task.status = "queued";
      task.speed = "Queued";
      task.eta = "Waiting...";
      this.emit("task-updated", task);
      console.log(`[DownloadManager] Task ${taskId} queued (active count ${activeCount}/${this.maxConcurrent}).`);
    } else {
      this.spawnAndMonitor(taskId, task, binPath, args, finalDir);
    }

    return task;
  }

  pauseDownload(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== "downloading" && task.status !== "starting" && task.status !== "queued")) return false;

    task.paused = true;
    task.status = "paused";
    task.speed = "Paused";
    task.eta = "--:--";

    const child = this.processes.get(taskId);
    if (child) {
      this.killProcessTree(child);
      this.processes.delete(taskId);
    }

    this.processQueue();
    this.emit("task-updated", task);
    return true;
  }

  resumeDownload(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "paused" || !task.params) return false;

    const { binPath, args, finalDir } = task.params;

    task.paused = false;
    task.error = null;

    const activeCount = this.getActiveTasksCount();
    if (activeCount >= this.maxConcurrent) {
      task.status = "queued";
      task.speed = "Queued";
      task.eta = "Waiting...";
      console.log(`[DownloadManager] Resumed task ${taskId} queued due to max concurrent limits.`);
    } else {
      task.status = "starting";
      task.speed = "Decrypting streams...";
      task.eta = "Connecting...";
      this.spawnAndMonitor(taskId, task, binPath, args, finalDir);
    }

    this.emit("task-updated", task);
    return true;
  }

  cancelDownload(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.paused = false;
    task.status = "canceled";
    task.error = "Download canceled by user";

    const child = this.processes.get(taskId);
    if (child) {
      this.killProcessTree(child);
      this.processes.delete(taskId);
    }

    this.processQueue();
    this.emit("task-updated", task);
    return true;
  }

  spawnAndMonitor(taskId, task, binPath, args, finalDir) {
    console.log(`[DownloadManager] Spawning task ${taskId}:`, binPath, args.join(" "));

    const child = spawn(binPath, args, {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1"
      }
    });
    this.processes.set(taskId, child);

    this.emit("task-updated", task);

    // Real-Time Disk File Monitor (300ms Interval)
    let prevBytes = 0;
    let prevTime = Date.now();

    const monitorInterval = setInterval(() => {
      if (task.paused || task.status === "paused" || task.status === "canceled" || task.status === "completed" || task.status === "queued") {
        clearInterval(monitorInterval);
        return;
      }

      try {
        let currentDiskBytes = 0;
        if (fs.existsSync(finalDir)) {
          const files = fs.readdirSync(finalDir);
          for (const f of files) {
            if (f.endsWith(".part") || f.includes(taskId) || (task.title && f.includes(task.title.substring(0, 10)))) {
              const p = path.join(finalDir, f);
              try {
                const stat = fs.statSync(p);
                currentDiskBytes += stat.size;
              } catch (_) {}
            }
          }
        }

        if (currentDiskBytes > 0 && !task.paused) {
          const now = Date.now();
          const timeDiff = (now - prevTime) / 1000;
          if (timeDiff >= 0.3) {
            const bytesDiff = currentDiskBytes - prevBytes;
            if (bytesDiff > 0 && timeDiff > 0) {
              const speedBps = bytesDiff / timeDiff;
              const spdStr = (speedBps / (1024 * 1024)).toFixed(1) + " MB/s";
              if (task.speed === "0 MB/s" || task.speed === "~ MB/s" || task.speed === "NA" || task.speed === "Decrypting streams...") {
                task.speed = spdStr;
              }
            }
            prevBytes = currentDiskBytes;
            prevTime = now;
          }

          const mbStr = (currentDiskBytes / (1024 * 1024)).toFixed(1) + " MB";
          if (task.downloadedBytes === "0 MB" || task.downloadedBytes === "NA" || !task.downloadedBytes) {
            task.downloadedBytes = mbStr;
          }

          const numDl = parseBytesToNum(task.downloadedBytes);
          const numTot = parseBytesToNum(task.totalBytes);

          if (numTot > 0 && numDl > 0) {
            const exactPct = Math.min(95, Math.round((numDl / numTot) * 100));
            if (exactPct > task.progress) {
              task.progress = exactPct;
            }
          }

          if (task.status === "starting" && !task.paused) task.status = "downloading";
          this.emit("task-updated", task);
        }
      } catch (_) {}
    }, 300);

    // Stdout Progress Parser with Line Buffer
    let stdoutBuffer = "";
    const mediaExtensions = [".mp4", ".mkv", ".webm", ".mp3", ".m4a", ".wav", ".flac", ".aac"];

    child.stdout.on("data", (data) => {
      if (task.paused || task.status === "paused") return;

      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";

      for (const rawLine of lines) {
        if (task.paused || task.status === "paused") break;

        const line = rawLine.trim();
        if (!line) continue;

        if (line.includes("[download] Downloading item 2") || (line.includes("100% of") && task.currentStreamIndex === 0)) {
          task.currentStreamIndex = 1;
        }

        // Custom Template Match
        if (line.includes("[progress]")) {
          const match = line.match(/\[progress\]\s*~?([\d\.]+)%\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*(.+)/i);
          if (match) {
            let rawPercent = parseFloat(match[1]) || 0;

            const spd = match[2].trim();
            const eta = match[3].trim();
            const dl = match[4].trim();
            const tot = match[5].trim();

            if (spd && spd !== "NA" && spd !== "N/A" && spd !== "Unknown speed") task.speed = spd;
            if (eta && eta !== "NA" && eta !== "N/A" && eta !== "Unknown") task.eta = eta;
            if (dl && dl !== "NA" && dl !== "N/A") task.downloadedBytes = dl;
            if (tot && tot !== "NA" && tot !== "N/A") task.totalBytes = tot;

            const numDl = parseBytesToNum(dl);
            const numTot = parseBytesToNum(tot);

            if (numTot > 0 && numDl > 0) {
              task.progress = Math.min(95, Math.round((numDl / numTot) * 100));
            } else {
              const isMultiStream = !!(task.params?.videoFormatId && task.params?.audioFormatId);
              if (isMultiStream) {
                if (task.currentStreamIndex === 0) {
                  task.progress = Math.min(85, Math.round(rawPercent * 0.85));
                } else {
                  task.progress = Math.min(95, Math.round(85 + rawPercent * 0.10));
                }
              } else {
                task.progress = Math.min(96, Math.round(rawPercent));
              }
            }

            if (!task.paused) task.status = "downloading";
            this.emit("task-updated", task);
            continue;
          }
        }

        // Standard Progress Match
        if (line.includes("[download]") && line.includes("%")) {
          const stdMatch = line.match(/\[download\]\s+~?([\d\.]+)%\s+of\s+~?([^\s]+(?:\s*\w+)?)(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/i);
          if (stdMatch) {
            let rawPercent = parseFloat(stdMatch[1]) || 0;

            if (stdMatch[2] && stdMatch[2] !== "NA") task.totalBytes = stdMatch[2].trim();
            if (stdMatch[3] && stdMatch[3] !== "NA") task.speed = stdMatch[3].trim();
            if (stdMatch[4] && stdMatch[4] !== "NA") task.eta = stdMatch[4].trim();

            const numDl = parseBytesToNum(task.downloadedBytes);
            const numTot = parseBytesToNum(task.totalBytes);

            if (numTot > 0 && numDl > 0) {
              task.progress = Math.min(95, Math.round((numDl / numTot) * 100));
            } else {
              task.progress = Math.max(task.progress, Math.min(95, Math.round(rawPercent)));
            }

            if (!task.paused) task.status = "downloading";
            this.emit("task-updated", task);
            continue;
          }
        }

        // Merger & Fixup Detection
        if (line.includes("[Merger]") || line.includes("[ExtractAudio]") || line.includes("[FixupM3u8]") || line.includes("[ffmpeg]")) {
          if (!task.paused) {
            task.status = "processing";
            task.progress = 98;
            task.speed = "Muxing...";
            task.eta = "00:00";
            this.emit("task-updated", task);
          }
          continue;
        }

        // File Path Detection - Only capture media files, ignore .jpg / .png / .vtt / .srt
        if (line.includes("[download] Destination:")) {
          const match = line.match(/\[download\] Destination:\s*(.+)/);
          if (match) {
            const destPath = match[1].trim();
            const ext = path.extname(destPath).toLowerCase();
            if (mediaExtensions.includes(ext)) {
              task.filePath = destPath;
            }
          }
        } else if (line.includes("has already been downloaded")) {
          const match = line.match(/\[download\]\s*(.+)\s*has already been downloaded/);
          if (match) {
            const destPath = match[1].trim();
            const ext = path.extname(destPath).toLowerCase();
            if (mediaExtensions.includes(ext)) {
              task.filePath = destPath;
            }
          }
        }
      }
    });

    child.stderr.on("data", (data) => {
      const errText = data.toString().trim();
      if (errText && !errText.includes("WARNING:")) {
        console.warn(`[DownloadManager stderr ${taskId}]:`, errText);
      }
    });

    child.on("close", (code, signal) => {
      clearInterval(monitorInterval);
      this.processes.delete(taskId);

      if (task.paused || task.status === "paused") {
        task.status = "paused";
        task.speed = "Paused";
        task.eta = "--:--";
        console.log(`[DownloadManager] Task ${taskId} is currently paused.`);
      } else if (signal === "SIGTERM" || signal === "SIGKILL" || task.status === "canceled") {
        task.status = "canceled";
        task.error = "Download canceled by user";
        console.log(`[DownloadManager] Task ${taskId} was canceled.`);
      } else if (code === 0) {
        task.status = "completed";
        task.progress = 100;
        this.enrichTaskWithDiskStats(task);
        console.log(`[DownloadManager] Task ${taskId} completed successfully.`);
      } else {
        task.status = "error";
        task.error = task.error || `Process exited with code ${code}`;
        console.error(`[DownloadManager] Task ${taskId} failed with code ${code}.`);
      }

      this.emit("task-updated", task);
      this.processQueue();
    });
  }
}

export const downloadManager = new DownloadManager();
