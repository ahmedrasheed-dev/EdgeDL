console.log("EdgeDL Offscreen Script initialized");

function startKeepAlive() {
  const audio = document.getElementById("keepalive-audio") as HTMLAudioElement;
  if (audio) {
    audio.play().catch(() => {});
  }
}

function stopKeepAlive() {
  const audio = document.getElementById("keepalive-audio") as HTMLAudioElement;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

function sendStatus(status: string, progress: number) {
  chrome.runtime.sendMessage({
    type: "STATUS_UPDATE",
    status,
    progress
  }).catch(() => {});
}

let ffmpegCoreInstance: any = null;

async function getFFmpegCore(): Promise<any> {
  if (ffmpegCoreInstance) {
    return ffmpegCoreInstance;
  }

  try {
    const jsUrl = browser.runtime.getURL("ffmpeg/ffmpeg-core.js");
    const wasmUrl = browser.runtime.getURL("ffmpeg/ffmpeg-core.wasm");

    sendStatus("Loading processing engine...", 8);
    const wasmResp = await fetch(wasmUrl);
    if (!wasmResp.ok) {
      throw new Error(`Failed to load engine core (HTTP ${wasmResp.status})`);
    }
    const wasmBinary = await wasmResp.arrayBuffer();

    sendStatus("Loading engine scripts...", 12);
    if (typeof (window as any).createFFmpegCore !== "function") {
      const script = document.createElement("script");
      script.src = jsUrl;
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load engine script tag"));
      });
    }

    if (typeof (window as any).createFFmpegCore !== "function") {
      throw new Error("createFFmpegCore not found on window after script load");
    }

    sendStatus("Initializing converter engine...", 16);

    const core = await (window as any).createFFmpegCore({
      wasmBinary,
      mainScriptUrlOrBlob: `${jsUrl}#${btoa(JSON.stringify({ wasmURL: wasmUrl, workerURL: "" }))}`,
      print: (msg: string) => console.log("[FFmpeg stdout]", msg),
      printErr: (msg: string) => console.warn("[FFmpeg stderr]", msg),
    });

    if (!core || !core.FS || typeof core.FS.writeFile !== "function") {
      throw new Error("Converter engine initialized but storage is unavailable");
    }

    let lastSetProgressTime = 0;
    if (typeof core.setProgress === "function") {
      core.setProgress((progressObj: { progress: number; time: number }) => {
        const now = Date.now();
        if (now - lastSetProgressTime > 300) {
          lastSetProgressTime = now;
          if (progressObj && typeof progressObj.progress === "number") {
            const percent = Math.min(99, Math.round(progressObj.progress * 100));
            sendStatus(`Merging video & audio... (${percent}%)`, 50 + Math.round(progressObj.progress * 45));
          }
        }
      });
    }

    ffmpegCoreInstance = core;
    sendStatus("Engine ready!", 20);
    return core;
  } catch (err: any) {
    console.error("FFmpeg Core init failed:", err);
    throw new Error("Converter engine failed to initialize: " + (err?.message || String(err)));
  }
}

async function fetchStreamToBuffer(
  url: string,
  progressRange: [number, number],
  label: string
): Promise<Uint8Array> {
  const [pStart, pEnd] = progressRange;
  const pRange = pEnd - pStart;

  let lastReportTime = 0;
  const reportProgress = (loaded: number, total: number, force = false) => {
    const now = Date.now();
    if (force || now - lastReportTime > 250) {
      lastReportTime = now;
      const percent = total > 0 ? loaded / total : Math.min(0.99, loaded / (20 * 1024 * 1024));
      const uiProgress = Math.round(pStart + percent * pRange);
      const mb = (loaded / (1024 * 1024)).toFixed(1);
      sendStatus(`${label}: ${mb} MB (${Math.round(percent * 100)}%)`, uiProgress);
    }
  };

  // Check Content-Length & Range support using a GET bytes=0-1 probe (YouTube CDN blocks HEAD)
  try {
    let totalBytes = 0;
    let isRangeSupported = false;

    const probeResp = await fetch(url, {
      headers: { Range: "bytes=0-1" },
      referrerPolicy: "no-referrer"
    });

    if (probeResp.ok) {
      if (probeResp.status === 206) {
        isRangeSupported = true;
        const contentRange = probeResp.headers.get("content-range");
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)$/);
          if (match) {
            totalBytes = parseInt(match[1], 10);
          }
        }
      }
      if (!totalBytes) {
        const contentLengthStr = probeResp.headers.get("content-length");
        if (contentLengthStr) totalBytes = parseInt(contentLengthStr, 10);
      }
    }

    if (totalBytes > 512 * 1024 && (isRangeSupported || url.includes("googlevideo.com") || url.includes("cdn") || url.startsWith("blob:"))) {
      const CHUNK_SIZE = 1.5 * 1024 * 1024; // 1.5 MB chunks (Optimal for YouTube CDN)
      const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);
      const result = new Uint8Array(totalBytes);
      let downloadedBytes = 0;

      const CONCURRENCY = 8;
      let currentChunkIndex = 0;

      const fetchChunk = async () => {
        while (currentChunkIndex < totalChunks) {
          const index = currentChunkIndex++;
          const start = Math.floor(index * CHUNK_SIZE);
          const end = Math.min(Math.floor(start + CHUNK_SIZE - 1), totalBytes - 1);

          const chunkResp = await fetch(url, {
            headers: { Range: `bytes=${start}-${end}` },
            referrerPolicy: "no-referrer"
          });

          if (!chunkResp.ok) {
            throw new Error(`Range chunk fetch HTTP ${chunkResp.status}`);
          }

          const buf = new Uint8Array(await chunkResp.arrayBuffer());
          result.set(buf, start);

          downloadedBytes += buf.byteLength;
          reportProgress(downloadedBytes, totalBytes);
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY, totalChunks) }, () => fetchChunk());
      await Promise.all(workers);

      reportProgress(totalBytes, totalBytes, true);
      return result;
    }
  } catch (err) {
    console.warn(`[Parallel Download] Range fetch unavailable for ${label}, falling back to stream:`, err);
  }

  // High-performance single-request fetcher for small files with explicit Range: bytes=0- header (Bypasses YouTube throttling)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    if (url.includes("googlevideo.com") || url.includes("cdn")) {
      xhr.setRequestHeader("Range", "bytes=0-");
    }
    xhr.responseType = "arraybuffer";

    let lastReport = 0;
    xhr.onprogress = (event) => {
      const now = Date.now();
      if (now - lastReport > 200 || (event.lengthComputable && event.loaded === event.total)) {
        lastReport = now;
        const total = event.lengthComputable ? event.total : 0;
        const loaded = event.loaded;
        reportProgress(loaded, total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        const result = new Uint8Array(xhr.response);
        reportProgress(result.byteLength, result.byteLength, true);
        resolve(result);
      } else {
        reject(new Error(`Failed to download ${label} (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error(`Network error while downloading ${label}`));
    xhr.send();
  });
}

function safeWriteFS(core: any, filename: string, data: Uint8Array) {
  try {
    core.FS.unlink(filename);
  } catch (_) {}
  core.FS.writeFile(filename, data);
}

function safeUnlinkFS(core: any, filename: string) {
  try {
    core.FS.unlink(filename);
  } catch (_) {}
}

async function processWebMux(payload: {
  videoUrl: string;
  audioUrl?: string;
  title: string;
  ext?: string;
}) {
  const { videoUrl, audioUrl, title, ext = "mp4" } = payload;
  const sanitizedTitle = title.replace(/[/\\?%*:|"<>]/g, "_");
  const outputFilename = `${sanitizedTitle}.${ext}`;

  try {
    startKeepAlive();

    if (audioUrl) {
      sendStatus("Downloading video & audio tracks...", 5);

      const [videoBuffer, audioBuffer] = await Promise.all([
        fetchStreamToBuffer(videoUrl, [5, 40], "Video Track"),
        fetchStreamToBuffer(audioUrl, [5, 40], "Audio Track")
      ]);

      const core = await getFFmpegCore();

      sendStatus("Preparing video and audio tracks...", 45);
      safeWriteFS(core, "/input_video.mp4", videoBuffer);
      safeWriteFS(core, "/input_audio.m4a", audioBuffer);

      sendStatus("Combining video & audio...", 50);
      // Yield main thread microtask so browser stays completely smooth during 4K/large video muxing
      await new Promise((resolve) => setTimeout(resolve, 50));

      core.exec("-i", "/input_video.mp4", "-i", "/input_audio.m4a", "-c", "copy", "-movflags", "+faststart", "/output.mp4");

      sendStatus("Finalizing video file...", 96);
      const data = core.FS.readFile("/output.mp4");

      safeUnlinkFS(core, "/input_video.mp4");
      safeUnlinkFS(core, "/input_audio.m4a");
      safeUnlinkFS(core, "/output.mp4");

      const uint8 = data as Uint8Array;
      const blob = new Blob([uint8.buffer], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);

      chrome.runtime.sendMessage({
        type: "DOWNLOAD_READY",
        blobUrl,
        filename: outputFilename
      }).catch(() => {});

    } else {
      sendStatus("Downloading video...", 5);
      const videoBuffer = await fetchStreamToBuffer(videoUrl, [5, 95], "Video");

      const blob = new Blob([videoBuffer.buffer], { type: "video/mp4" });
      const blobUrl = URL.createObjectURL(blob);

      chrome.runtime.sendMessage({
        type: "DOWNLOAD_READY",
        blobUrl,
        filename: outputFilename
      }).catch(() => {});
    }

  } catch (err: any) {
    console.error("Web Mux error:", err);
    chrome.runtime.sendMessage({
      type: "PROCESS_ERROR",
      error: err?.message || "Video download failed"
    }).catch(() => {});
  } finally {
    stopKeepAlive();
  }
}

async function processLocalFileMux(payload: {
  videoUrl: string;
  audioUrl: string;
  videoExt: string;
  audioExt: string;
  outputFormat: string;
  ffmpegArgs?: string[];
  filename?: string;
}) {
  const {
    videoUrl,
    audioUrl,
    videoExt = "mp4",
    audioExt = "m4a",
    outputFormat = "mp4",
    ffmpegArgs,
    filename = "merged_output"
  } = payload;

  const outputFilename = `${filename}.${outputFormat}`;

  try {
    startKeepAlive();
    sendStatus("Loading selected media files...", 5);

    const [videoBuffer, audioBuffer] = await Promise.all([
      fetchStreamToBuffer(videoUrl, [5, 20], "Video File"),
      fetchStreamToBuffer(audioUrl, [5, 20], "Audio File")
    ]);

    // Revoke object URLs to free browser blob memory
    try { URL.revokeObjectURL(videoUrl); } catch (_) {}
    try { URL.revokeObjectURL(audioUrl); } catch (_) {}

    sendStatus("Initializing converter engine...", 22);
    const core = await getFFmpegCore();

    const inVid = `/input_video.${videoExt}`;
    const inAud = `/input_audio.${audioExt}`;
    const outVid = `/output.${outputFormat}`;

    sendStatus("Processing video and audio data...", 30);
    safeWriteFS(core, inVid, videoBuffer);
    safeWriteFS(core, inAud, audioBuffer);

    sendStatus("Combining files...", 45);
    // Yield main thread microtask before C++ execution
    await new Promise((resolve) => setTimeout(resolve, 50));

    let argsToUse: string[];
    if (ffmpegArgs && ffmpegArgs.length > 0) {
      argsToUse = ffmpegArgs;
    } else {
      argsToUse = ["-i", inVid, "-i", inAud, "-c:v", "copy", "-c:a", "aac", outVid];
    }

    console.log("Executing core.exec with args:", argsToUse);
    core.exec(...argsToUse);

    sendStatus("Preparing download...", 95);
    const data = core.FS.readFile(outVid);

    safeUnlinkFS(core, inVid);
    safeUnlinkFS(core, inAud);
    safeUnlinkFS(core, outVid);

    const uint8 = data as Uint8Array;
    const mimeType = outputFormat === "webm" ? "video/webm" : outputFormat === "gif" ? "image/gif" : "video/mp4";
    const blob = new Blob([uint8.buffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    chrome.runtime.sendMessage({
      type: "DOWNLOAD_READY",
      blobUrl,
      filename: outputFilename
    }).catch(() => {});

  } catch (err: any) {
    console.error("Local file mux error:", err);
    chrome.runtime.sendMessage({
      type: "PROCESS_ERROR",
      error: err?.message || "Local file muxing failed"
    }).catch(() => {});
  } finally {
    stopKeepAlive();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "START_PROCESSING") {
    console.log("Offscreen received START_PROCESSING payload:", message.payload);
    const { mode } = message.payload || {};
    if (mode === "local") {
      processLocalFileMux(message.payload);
    } else {
      processWebMux(message.payload);
    }
    sendResponse({ ok: true });
    return false;
  }
});

chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" }).catch(() => {});
