const { ipcRenderer } = require("electron");

let currentPort = 5000;
let SERVER_URL = `http://localhost:${currentPort}`;
let lastTasksList = [];
let notifiedTaskIds = new Set();
let currentPlaylistData = null;

// DOM Elements - Header, Theme & Port Modal
const serverStatusText = document.getElementById("server-status-text");
const serverStatusPill = document.getElementById("server-status-pill");
const btnEditPort = document.getElementById("btn-edit-port");
const themeDots = document.querySelectorAll(".theme-dot");

const portModal = document.getElementById("port-modal");
const portInput = document.getElementById("port-input");
const btnCloseModal = document.getElementById("btn-close-modal");
const btnCancelPort = document.getElementById("btn-cancel-port");
const btnSavePort = document.getElementById("btn-save-port");

// DOM Elements - Storage Analytics Box
const statsTotalSize = document.getElementById("stats-total-size");
const statsFileCount = document.getElementById("stats-file-count");
const btnRefreshStats = document.getElementById("btn-refresh-stats");

// DOM Elements - Playlist Modal
const playlistModal = document.getElementById("playlist-modal");
const playlistTitle = document.getElementById("playlist-title");
const playlistUploaderText = document.getElementById("playlist-uploader-text");
const playlistSearchInput = document.getElementById("playlist-search-input");
const playlistSelectedCount = document.getElementById("playlist-selected-count");
const playlistDurationSum = document.getElementById("playlist-duration-sum");
const playlistItemsList = document.getElementById("playlist-items-list");

const btnClosePlaylistModal = document.getElementById("btn-close-playlist-modal");
const btnCancelPlaylist = document.getElementById("btn-cancel-playlist");
const btnStartBatchDownload = document.getElementById("btn-start-batch-download");

const btnSelectAll = document.getElementById("btn-select-all");
const btnDeselectAll = document.getElementById("btn-deselect-all");
const btnSelectTop5 = document.getElementById("btn-select-top5");
const btnSelectTop10 = document.getElementById("btn-select-top10");

const playlistSelectQuality = document.getElementById("playlist-select-quality");
const playlistSelectFormat = document.getElementById("playlist-select-format");
const playlistSelectSpeed = document.getElementById("playlist-select-speed");
const playlistSelectSubtitles = document.getElementById("playlist-select-subtitles");
const playlistSelectThumbnails = document.getElementById("playlist-select-thumbnails");

// DOM Elements - Window Controls
const btnMinimize = document.getElementById("btn-minimize");
const btnMaximize = document.getElementById("btn-maximize");
const btnClose = document.getElementById("btn-close");

// DOM Elements - Mode Selector
const modeVideoAudio = document.getElementById("mode-video-audio");
const modeVideoOnly = document.getElementById("mode-video-only");
const modeAudioOnly = document.getElementById("mode-audio-only");
const segmentedButtons = document.querySelectorAll(".segmented-btn");

// DOM Elements - Input & Controls
const urlInput = document.getElementById("url-input");
const btnPaste = document.getElementById("btn-paste");
const btnAnalyze = document.getElementById("btn-analyze");
const analyzeSpinner = document.getElementById("analyze-spinner");
const analyzeBtnText = document.getElementById("analyze-btn-text");

const errorBanner = document.getElementById("error-banner");
const errorMessage = document.getElementById("error-message");

const mediaCard = document.getElementById("media-card");
const mediaThumb = document.getElementById("media-thumb");
const mediaTitle = document.getElementById("media-title");
const mediaUploader = document.getElementById("media-uploader");
const mediaDuration = document.getElementById("media-duration");
const btnSaveThumb = document.getElementById("btn-save-thumb");

const videoSelectGroup = document.getElementById("video-select-group");
const audioSelectGroup = document.getElementById("audio-select-group");
const formatSelectGroup = document.getElementById("format-select-group");
const selectVideo = document.getElementById("select-video");
const selectAudio = document.getElementById("select-audio");
const selectFormat = document.getElementById("select-format");
const selectSpeedLimit = document.getElementById("select-speed-limit");
const selectSubtitles = document.getElementById("select-subtitles");

// DOM Elements - Video Trimmer
const chkEnableTrimmer = document.getElementById("chk-enable-trimmer");
const trimmerInputsRow = document.getElementById("trimmer-inputs-row");
const trimStartInput = document.getElementById("trim-start-input");
const trimEndInput = document.getElementById("trim-end-input");

const outputDirInput = document.getElementById("output-dir-input");
const btnBrowseDir = document.getElementById("btn-browse-dir");
const btnStartDownload = document.getElementById("btn-start-download");

// DOM Elements - Tasks Dashboard
const tabActive = document.getElementById("tab-active");
const tabCompleted = document.getElementById("tab-completed");
const countActive = document.getElementById("count-active");
const countCompleted = document.getElementById("count-completed");

const viewActiveTasks = document.getElementById("view-active-tasks");
const viewCompletedTasks = document.getElementById("view-completed-tasks");
const activeEmptyState = document.getElementById("active-empty-state");
const completedEmptyState = document.getElementById("completed-empty-state");
const activeTasksList = document.getElementById("active-tasks-list");
const completedTasksList = document.getElementById("completed-tasks-list");

// State Variables
let currentMediaData = null;
let customSaveDir = null;
let currentTab = "active";
let currentMode = "video-audio"; // "video-audio", "video-only", "audio-only"

// Theme Switcher & Storage Persistence
const savedTheme = localStorage.getItem("edgedl-theme") || "blue";
setTheme(savedTheme);

themeDots.forEach((dot) => {
  dot.addEventListener("click", () => {
    const theme = dot.getAttribute("data-theme");
    setTheme(theme);
  });
});

function setTheme(themeName) {
  document.body.setAttribute("data-theme", themeName);
  localStorage.setItem("edgedl-theme", themeName);

  themeDots.forEach((dot) => {
    if (dot.getAttribute("data-theme") === themeName) {
      dot.classList.add("active");
    } else {
      dot.classList.remove("active");
    }
  });
}

// Clip Trimmer Toggle
chkEnableTrimmer?.addEventListener("change", () => {
  if (chkEnableTrimmer.checked) {
    trimmerInputsRow?.classList.remove("hidden");
  } else {
    trimmerInputsRow?.classList.add("hidden");
  }
});

// Storage Analytics Fetching
async function fetchStorageStats() {
  try {
    const resp = await fetch(`${SERVER_URL}/api/stats`);
    const json = await resp.json();
    if (json.success) {
      statsTotalSize.textContent = json.totalSizeFormatted || "0 MB";
      statsFileCount.textContent = `${json.totalFiles || 0} Files downloaded`;
    }
  } catch (_) {}
}

btnRefreshStats?.addEventListener("click", fetchStorageStats);

// Helper: Calibrated YouTube AV1/VP9 Bitrates for Precise File Size Estimation
function getEstBitrateMbps(quality) {
  if (quality === "1080p") return 1.8; // ~ 13.5 MB/min
  if (quality === "720p") return 0.9;  // ~ 6.75 MB/min
  if (quality === "480p") return 0.4;  // ~ 3.0 MB/min
  if (quality === "360p") return 0.2;  // ~ 1.5 MB/min
  if (quality === "best") return 2.5;  // ~ 18.75 MB/min
  return 1.2;
}

function calcEstSizeStr(durationSec, quality) {
  if (!durationSec || isNaN(durationSec)) return "";
  const mbps = getEstBitrateMbps(quality);
  const bytes = durationSec * (mbps * 1000000 / 8);
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `~ ${(mb / 1024).toFixed(2)} GB`;
  }
  return `~ ${mb.toFixed(1)} MB`;
}

function calcEstSizeBytes(durationSec, quality) {
  if (!durationSec || isNaN(durationSec)) return 0;
  const mbps = getEstBitrateMbps(quality);
  return durationSec * (mbps * 1000000 / 8);
}

// Initialize Default Save Directory
ipcRenderer.invoke("get-default-downloads-dir").then((dir) => {
  if (dir) {
    customSaveDir = dir;
    outputDirInput.value = dir;
  }
});

// Automatic Multi-Port Server Discovery on startup
async function initServerConfig() {
  let detectedPort = null;
  try {
    detectedPort = await ipcRenderer.invoke("get-server-port");
  } catch (_) {}

  const portsToTry = [];
  if (detectedPort) portsToTry.push(detectedPort);
  for (let p = 5000; p <= 5010; p++) {
    if (!portsToTry.includes(p)) portsToTry.push(p);
  }

  for (const p of portsToTry) {
    try {
      const resp = await fetch(`http://localhost:${p}/api/config`);
      const json = await resp.json();
      if (json.success) {
        currentPort = json.port || p;
        SERVER_URL = `http://localhost:${currentPort}`;
        serverStatusText.textContent = `Using port ${currentPort}`;
        portInput.value = currentPort;
        fetchStorageStats();
        return;
      }
    } catch (_) {}
  }

  serverStatusText.textContent = `Using port ${currentPort}`;
  fetchStorageStats();
}
initServerConfig();

// Window Controls
btnMinimize?.addEventListener("click", () => ipcRenderer.send("window-minimize"));
btnMaximize?.addEventListener("click", () => ipcRenderer.send("window-maximize"));
btnClose?.addEventListener("click", () => ipcRenderer.send("window-close"));

// Port Modal Controls
function openPortModal() {
  portInput.value = currentPort;
  portModal.classList.remove("hidden");
}
function closePortModal() {
  portModal.classList.add("hidden");
}
serverStatusPill?.addEventListener("click", openPortModal);
btnEditPort?.addEventListener("click", (e) => {
  e.stopPropagation();
  openPortModal();
});
btnCloseModal?.addEventListener("click", closePortModal);
btnCancelPort?.addEventListener("click", closePortModal);

btnSavePort?.addEventListener("click", async () => {
  const targetPort = parseInt(portInput.value.trim(), 10);
  if (!targetPort || targetPort < 1024 || targetPort > 65535) {
    showError("Please enter a valid port between 1024 and 65535.");
    return;
  }

  try {
    const resp = await fetch(`${SERVER_URL}/api/config/port`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port: targetPort })
    });
    const json = await resp.json();
    if (json.success) {
      currentPort = targetPort;
      SERVER_URL = `http://localhost:${currentPort}`;
      serverStatusText.textContent = `Using port ${currentPort}`;
      closePortModal();

      setTimeout(() => {
        initServerConfig();
        pollTasks();
      }, 400);
    } else {
      showError(json.error || "Failed to update server port.");
    }
  } catch (err) {
    currentPort = targetPort;
    SERVER_URL = `http://localhost:${currentPort}`;
    serverStatusText.textContent = `Using port ${currentPort}`;
    closePortModal();
    setTimeout(() => {
      initServerConfig();
      pollTasks();
    }, 400);
  }
});

// Playlist Modal Controls
function openPlaylistModal(playlistData) {
  currentPlaylistData = playlistData;
  playlistTitle.textContent = playlistData.title || "Playlist Selection";
  playlistUploaderText.textContent = `${playlistData.uploader || "YouTube Channel"} • ${playlistData.entriesCount || 0} Videos`;

  if (playlistSearchInput) playlistSearchInput.value = "";
  renderPlaylistItems(playlistData.entries || []);
  playlistModal.classList.remove("hidden");
}

function closePlaylistModal() {
  playlistModal.classList.add("hidden");
  currentPlaylistData = null;
}

btnClosePlaylistModal?.addEventListener("click", closePlaylistModal);
btnCancelPlaylist?.addEventListener("click", closePlaylistModal);

function renderPlaylistItems(entries) {
  const selectedQuality = playlistSelectQuality ? playlistSelectQuality.value : "best";
  const filterQuery = playlistSearchInput ? playlistSearchInput.value.trim().toLowerCase() : "";

  const filtered = entries.filter((e) => !filterQuery || e.title.toLowerCase().includes(filterQuery));

  playlistItemsList.innerHTML = filtered.map((e) => {
    const origIdx = entries.indexOf(e);
    const durStr = formatDuration(e.duration);
    const szStr = calcEstSizeStr(e.duration, selectedQuality);

    return `
      <div class="playlist-item-row" data-index="${origIdx}">
        <input type="checkbox" class="chk-playlist-item" data-index="${origIdx}" checked />
        ${e.thumbnail ? `<img src="${e.thumbnail}" class="playlist-item-thumb" />` : ""}
        <div class="playlist-item-info">
          <div class="playlist-item-title">#${e.index} ${e.title}</div>
          <div class="playlist-item-meta">
            ${durStr ? `<span class="playlist-item-duration">⏱️ ${durStr}</span>` : ""}
            ${szStr ? `<span class="playlist-item-size" data-index="${origIdx}">${szStr}</span>` : ""}
          </div>
        </div>
      </div>
    `;
  }).join("");

  updatePlaylistSelectedCount();

  const itemCheckboxes = playlistItemsList.querySelectorAll(".chk-playlist-item");
  itemCheckboxes.forEach((chk) => {
    chk.addEventListener("change", updatePlaylistSelectedCount);
  });
}

// Search Filter Input Listener
playlistSearchInput?.addEventListener("input", () => {
  if (currentPlaylistData && Array.isArray(currentPlaylistData.entries)) {
    renderPlaylistItems(currentPlaylistData.entries);
  }
});

// Quick Selection Buttons
btnSelectAll?.addEventListener("click", () => {
  setQuickSelection((_) => true);
  setActivePill(btnSelectAll);
});

btnDeselectAll?.addEventListener("click", () => {
  setQuickSelection((_) => false);
  setActivePill(btnDeselectAll);
});

btnSelectTop5?.addEventListener("click", () => {
  setQuickSelection((idx) => idx < 5);
  setActivePill(btnSelectTop5);
});

btnSelectTop10?.addEventListener("click", () => {
  setQuickSelection((idx) => idx < 10);
  setActivePill(btnSelectTop10);
});

function setActivePill(activeBtn) {
  [btnSelectAll, btnDeselectAll, btnSelectTop5, btnSelectTop10].forEach((b) => b?.classList.remove("active"));
  activeBtn?.classList.add("active");
}

function setQuickSelection(filterFn) {
  const itemCheckboxes = playlistItemsList.querySelectorAll(".chk-playlist-item");
  itemCheckboxes.forEach((chk) => {
    const idx = parseInt(chk.getAttribute("data-index"), 10);
    chk.checked = filterFn(idx);
  });
  updatePlaylistSelectedCount();
}

// Update estimated size on quality selector change
playlistSelectQuality?.addEventListener("change", () => {
  if (!currentPlaylistData || !Array.isArray(currentPlaylistData.entries)) return;
  const quality = playlistSelectQuality.value;

  const sizeSpans = playlistItemsList.querySelectorAll(".playlist-item-size");
  sizeSpans.forEach((span) => {
    const idx = parseInt(span.getAttribute("data-index"), 10);
    const entry = currentPlaylistData.entries[idx];
    if (entry) {
      span.textContent = calcEstSizeStr(entry.duration, quality);
    }
  });

  updatePlaylistSelectedCount();
});

function updatePlaylistSelectedCount() {
  if (!currentPlaylistData || !Array.isArray(currentPlaylistData.entries)) return;

  const checkedBoxes = Array.from(playlistItemsList.querySelectorAll(".chk-playlist-item:checked"));
  const count = checkedBoxes.length;

  const quality = playlistSelectQuality ? playlistSelectQuality.value : "best";
  let totalBytes = 0;
  let totalDurationSec = 0;

  checkedBoxes.forEach((chk) => {
    const idx = parseInt(chk.getAttribute("data-index"), 10);
    const item = currentPlaylistData.entries[idx];
    if (item && item.duration) {
      totalBytes += calcEstSizeBytes(item.duration, quality);
      totalDurationSec += item.duration;
    }
  });

  let totalSizeStr = "";
  if (totalBytes > 0) {
    const mb = totalBytes / (1024 * 1024);
    totalSizeStr = mb >= 1024 ? ` • ~ ${(mb / 1024).toFixed(2)} GB total` : ` • ~ ${mb.toFixed(1)} MB total`;
  }

  playlistSelectedCount.textContent = `${count} of ${currentPlaylistData.entries.length} selected${totalSizeStr}`;
  if (playlistDurationSum) {
    playlistDurationSum.textContent = `⏱️ ${formatDuration(totalDurationSec) || "0:00"} Total`;
  }

  btnStartBatchDownload.disabled = count === 0;
}

// Start Batch Download Handler
btnStartBatchDownload?.addEventListener("click", async () => {
  if (!currentPlaylistData || !Array.isArray(currentPlaylistData.entries)) return;

  const checkedBoxes = Array.from(playlistItemsList.querySelectorAll(".chk-playlist-item:checked"));
  const selectedIndices = checkedBoxes.map((c) => parseInt(c.getAttribute("data-index"), 10));
  const selectedItems = selectedIndices.map((idx) => currentPlaylistData.entries[idx]).filter(Boolean);

  if (selectedItems.length === 0) return;

  const quality = playlistSelectQuality ? playlistSelectQuality.value : "best";
  const outputFormat = playlistSelectFormat ? playlistSelectFormat.value : "mp4";
  const speedLimit = playlistSelectSpeed ? playlistSelectSpeed.value : "unlimited";
  const subtitleOption = playlistSelectSubtitles ? playlistSelectSubtitles.value : "none";
  const thumbnailOption = playlistSelectThumbnails ? playlistSelectThumbnails.value : "none";

  btnStartBatchDownload.disabled = true;
  btnStartBatchDownload.textContent = "Starting...";

  try {
    const resp = await fetch(`${SERVER_URL}/api/download/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: selectedItems,
        playlistTitle: currentPlaylistData.title,
        downloadType: currentMode,
        quality,
        outputFormat,
        outputDir: customSaveDir,
        speedLimit,
        subtitleOption,
        thumbnailOption
      })
    });
    const json = await resp.json();
    if (json.success) {
      closePlaylistModal();
      switchTab("active");
      pollTasks();
    } else {
      showError(json.error || "Failed to enqueue batch download.");
    }
  } catch (err) {
    showError("Batch download error: " + err.message);
  } finally {
    btnStartBatchDownload.disabled = false;
    btnStartBatchDownload.textContent = "Start Batch Download";
  }
});

// Download Mode Selector
segmentedButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    segmentedButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.getAttribute("data-mode") || "video-audio";
    updateFormForMode();
  });
});

function updateFormForMode() {
  selectFormat.innerHTML = "";

  if (currentMode === "audio-only") {
    videoSelectGroup.classList.add("hidden");
    audioSelectGroup.classList.remove("hidden");

    ["mp3", "m4a", "wav", "aac", "flac"].forEach((fmt) => {
      const opt = document.createElement("option");
      opt.value = fmt;
      opt.textContent = `${fmt.toUpperCase()} (.${fmt})`;
      selectFormat.appendChild(opt);
    });
  } else if (currentMode === "video-only") {
    videoSelectGroup.classList.remove("hidden");
    audioSelectGroup.classList.add("hidden");

    ["mp4", "mkv", "webm"].forEach((fmt) => {
      const opt = document.createElement("option");
      opt.value = fmt;
      opt.textContent = `${fmt.toUpperCase()} (.${fmt})`;
      selectFormat.appendChild(opt);
    });
  } else {
    // video-audio
    videoSelectGroup.classList.remove("hidden");
    if (currentMediaData) {
      const firstVid = currentMediaData.videoStreams?.[0];
      if (firstVid && !firstVid.hasAudio && currentMediaData.audioStreams?.length > 0) {
        audioSelectGroup.classList.remove("hidden");
      } else {
        audioSelectGroup.classList.add("hidden");
      }
    } else {
      audioSelectGroup.classList.add("hidden");
    }

    ["mp4", "mkv", "webm"].forEach((fmt) => {
      const opt = document.createElement("option");
      opt.value = fmt;
      opt.textContent = `${fmt.toUpperCase()} (.${fmt})`;
      selectFormat.appendChild(opt);
    });
  }
}

// Clipboard Paste
btnPaste?.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.startsWith("http")) {
      urlInput.value = text.trim();
      analyzeUrl(text.trim());
    }
  } catch (err) {
    console.log("Clipboard read error:", err);
  }
});

// Analyze Action
btnAnalyze?.addEventListener("click", () => {
  const url = urlInput.value.trim();
  if (url) {
    analyzeUrl(url);
  } else {
    showError("Please enter or paste a valid media URL.");
  }
});

function showError(msg) {
  if (msg) {
    errorMessage.textContent = msg;
    errorBanner.classList.remove("hidden");
  } else {
    errorBanner.classList.add("hidden");
  }
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins % 60).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

async function analyzeUrl(targetUrl) {
  showError(null);
  
  if (!targetUrl || (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://"))) {
    showError("Please paste a valid video or playlist URL.");
    return;
  }

  try {
    new URL(targetUrl);
  } catch (_) {
    showError("Please paste a valid video or playlist URL.");
    return;
  }

  mediaCard.classList.add("hidden");
  analyzeSpinner.classList.remove("hidden");
  analyzeBtnText.textContent = "Analyzing...";
  btnAnalyze.disabled = true;

  try {
    const resp = await fetch(`${SERVER_URL}/api/extract?url=${encodeURIComponent(targetUrl)}`);
    let json;
    try {
      json = await resp.json();
    } catch (_) {
      throw new Error(`Server returned HTTP ${resp.status}. Please check desktop server.`);
    }

    if (!json.success || !json.data) {
      throw new Error(json.error || "Failed to extract media details.");
    }

    if (json.data.isPlaylist) {
      openPlaylistModal(json.data);
    } else {
      currentMediaData = json.data;
      renderMediaCard(currentMediaData);
    }
  } catch (err) {
    showError(err.message || "Could not analyze URL. Please check your connection.");
  } finally {
    analyzeSpinner.classList.add("hidden");
    analyzeBtnText.textContent = "Analyze URL";
    btnAnalyze.disabled = false;
  }
}

function renderMediaCard(data) {
  mediaTitle.textContent = data.title || "Media Stream";
  mediaUploader.textContent = data.uploader || "Native Web Stream";
  mediaDuration.textContent = formatDuration(data.duration) || "Stream";

  if (data.thumbnail) {
    mediaThumb.src = data.thumbnail;
    mediaThumb.classList.remove("hidden");
  } else {
    mediaThumb.classList.add("hidden");
  }

  // Populate Video Formats
  selectVideo.innerHTML = "";
  (data.videoStreams || []).forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.formatId;
    opt.textContent = `${v.resolution || v.height + "p"} (${v.ext}) ${v.fps ? "@ " + v.fps + "fps" : ""} ${v.hasAudio ? "• Audio incl." : "• Video only"} ${formatBytes(v.filesize)}`;
    selectVideo.appendChild(opt);
  });

  // Populate Audio Formats
  selectAudio.innerHTML = "";
  (data.audioStreams || []).forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.formatId;
    opt.textContent = `Audio (${a.ext}) • ${a.abr || 128}kbps ${formatBytes(a.filesize)}`;
    selectAudio.appendChild(opt);
  });

  updateFormForMode();

  selectVideo.onchange = () => {
    if (currentMode === "video-audio") {
      const selectedFormatId = selectVideo.value;
      const selected = data.videoStreams?.find((v) => v.formatId === selectedFormatId);
      if (selected && !selected.hasAudio && data.audioStreams?.length > 0) {
        audioSelectGroup.classList.remove("hidden");
      } else {
        audioSelectGroup.classList.add("hidden");
      }
    }
  };

  mediaCard.classList.remove("hidden");
}

// Download Thumbnail Handler
btnSaveThumb?.addEventListener("click", async () => {
  if (!currentMediaData || !currentMediaData.thumbnail) return;

  const originalText = btnSaveThumb.innerHTML;
  btnSaveThumb.disabled = true;
  btnSaveThumb.innerHTML = `<span>Saving...</span>`;

  try {
    const resp = await fetch(`${SERVER_URL}/api/download/thumbnail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentMediaData.thumbnail,
        title: currentMediaData.title,
        outputDir: customSaveDir
      })
    });
    const json = await resp.json();
    if (json.success) {
      btnSaveThumb.innerHTML = `<span>Saved!</span>`;
      fetchStorageStats();
      ipcRenderer.send("notify-completed", { title: `${currentMediaData.title} Thumbnail`, filePath: json.filePath });
    } else {
      showError(json.error || "Failed to save thumbnail.");
    }
  } catch (err) {
    showError("Thumbnail error: " + err.message);
  } finally {
    setTimeout(() => {
      btnSaveThumb.disabled = false;
      btnSaveThumb.innerHTML = originalText;
    }, 2000);
  }
});

// Browse Output Directory
btnBrowseDir?.addEventListener("click", async () => {
  const chosenDir = await ipcRenderer.invoke("select-download-dir");
  if (chosenDir) {
    customSaveDir = chosenDir;
    outputDirInput.value = chosenDir;
  }
});

// Start Download Button Handler
btnStartDownload?.addEventListener("click", async () => {
  if (!currentMediaData) return;

  const videoFormatId = currentMode !== "audio-only" ? selectVideo.value : undefined;
  const selectedVid = currentMediaData.videoStreams?.find((v) => v.formatId === videoFormatId);
  const needsAudio = currentMode === "video-audio" && selectedVid && !selectedVid.hasAudio;
  const audioFormatId = (currentMode === "audio-only" || needsAudio) ? selectAudio.value : undefined;
  const outputFormat = selectFormat.value;
  const speedLimit = selectSpeedLimit ? selectSpeedLimit.value : "unlimited";
  const subtitleOption = selectSubtitles ? selectSubtitles.value : "none";

  // Clip Trimmer Parameters
  let startTime = undefined;
  let endTime = undefined;

  if (chkEnableTrimmer && chkEnableTrimmer.checked) {
    startTime = trimStartInput ? trimStartInput.value.trim() : undefined;
    endTime = trimEndInput ? trimEndInput.value.trim() : undefined;
    if (!startTime && !endTime) {
      showError("Please specify a Start Time or End Time for clip trimming.");
      return;
    }
  }

  try {
    const resp = await fetch(`${SERVER_URL}/api/download/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: currentMediaData.webpageUrl,
        downloadType: currentMode,
        videoFormatId,
        audioFormatId,
        outputFormat,
        outputDir: customSaveDir,
        title: currentMediaData.title,
        speedLimit,
        subtitleOption,
        startTime,
        endTime
      })
    });

    let json;
    try {
      json = await resp.json();
    } catch (_) {
      throw new Error(`Server returned HTTP ${resp.status}. Please check desktop server.`);
    }

    if (json.success) {
      switchTab("active");
      pollTasks();
    } else {
      showError(json.error || "Failed to start download task.");
    }
  } catch (err) {
    showError("Could not start download: " + err.message);
  }
});

// Tab Controls
tabActive?.addEventListener("click", () => switchTab("active"));
tabCompleted?.addEventListener("click", () => switchTab("completed"));

function switchTab(tab) {
  currentTab = tab;
  if (tab === "active") {
    tabActive.classList.add("active");
    tabCompleted.classList.remove("active");
    viewActiveTasks.classList.remove("hidden");
    viewCompletedTasks.classList.add("hidden");
  } else {
    tabActive.classList.remove("active");
    tabCompleted.classList.add("active");
    viewActiveTasks.classList.add("hidden");
    viewCompletedTasks.classList.remove("hidden");
    fetchStorageStats();
  }
}

// Task Actions Logic
async function pauseTask(taskId) {
  try {
    const task = lastTasksList.find((t) => t.id === taskId);
    if (task) {
      task.status = "paused";
      task.speed = "Paused";
      renderTasks(lastTasksList);
    }

    await fetch(`${SERVER_URL}/api/download/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId })
    });
    setTimeout(pollTasks, 200);
  } catch (err) {
    console.error("Pause task error:", err);
  }
}

async function resumeTask(taskId) {
  try {
    const task = lastTasksList.find((t) => t.id === taskId);
    if (task) {
      task.status = "starting";
      task.speed = "Decrypting streams...";
      renderTasks(lastTasksList);
    }

    await fetch(`${SERVER_URL}/api/download/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId })
    });
    setTimeout(pollTasks, 200);
  } catch (err) {
    console.error("Resume task error:", err);
  }
}

async function cancelTask(taskId) {
  try {
    const task = lastTasksList.find((t) => t.id === taskId);
    if (task) {
      task.status = "canceled";
      renderTasks(lastTasksList);
    }

    await fetch(`${SERVER_URL}/api/download/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId })
    });
    setTimeout(pollTasks, 200);
  } catch (err) {
    console.error("Cancel task error:", err);
  }
}

function openFile(filePath) {
  ipcRenderer.send("open-file", filePath);
}

function showInFolder(filePath) {
  ipcRenderer.send("show-in-folder", filePath);
}

// Expose on window
window.pauseTask = pauseTask;
window.resumeTask = resumeTask;
window.cancelTask = cancelTask;
window.openFile = openFile;
window.showInFolder = showInFolder;

// Event Delegation for Task Buttons
viewActiveTasks?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  const taskId = btn.getAttribute("data-id");
  if (!taskId) return;

  if (action === "pause") {
    pauseTask(taskId);
  } else if (action === "resume") {
    resumeTask(taskId);
  } else if (action === "cancel") {
    cancelTask(taskId);
  }
});

viewCompletedTasks?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  const path = btn.getAttribute("data-path");

  if (action === "open-file" && path) {
    openFile(path);
  } else if (action === "show-in-folder" && path) {
    showInFolder(path);
  }
});

// Task Polling Loop
async function pollTasks() {
  try {
    const resp = await fetch(`${SERVER_URL}/api/download/tasks`);
    const json = await resp.json();

    if (json.success && Array.isArray(json.tasks)) {
      lastTasksList = json.tasks;
      renderTasks(lastTasksList);
    }
  } catch (_) {}
}

function renderTasks(tasks) {
  const activeList = tasks.filter((t) => t.status === "downloading" || t.status === "starting" || t.status === "processing" || t.status === "paused" || t.status === "queued");
  const completedList = tasks.filter((t) => t.status === "completed" || t.status === "canceled" || t.status === "error");

  countActive.textContent = activeList.length;
  countCompleted.textContent = completedList.length;

  // Trigger Completion Notifications & Refresh Storage Stats
  completedList.forEach((t) => {
    if (t.status === "completed" && !notifiedTaskIds.has(t.id)) {
      notifiedTaskIds.add(t.id);
      ipcRenderer.send("notify-completed", { title: t.title, filePath: t.filePath });
      fetchStorageStats();
    }
  });

  // Render Active Tasks
  if (activeList.length === 0) {
    activeEmptyState.classList.remove("hidden");
    activeTasksList.innerHTML = "";
  } else {
    activeEmptyState.classList.add("hidden");
    activeTasksList.innerHTML = activeList.map((t) => {
      const isStarting = t.status === "starting";
      const isPaused = t.status === "paused";
      const isProcessing = t.status === "processing";
      const isQueued = t.status === "queued";

      const dlBytes = (!t.downloadedBytes || t.downloadedBytes === "NA") ? "~" : t.downloadedBytes;
      const totBytes = (!t.totalBytes || t.totalBytes === "NA" || t.totalBytes === "0 MB") ? (dlBytes !== "~" ? dlBytes : "~") : t.totalBytes;

      let speedText = t.speed || "Decrypting streams...";
      if (speedText === "0 MB/s" || speedText === "~ MB/s" || speedText === "NA") {
        speedText = "Decrypting streams...";
      }

      let etaText = (!t.eta || t.eta === "NA" || t.eta === "--:--") ? "Connecting..." : `ETA ${t.eta}`;

      let badgeText = "DOWNLOADING";
      let badgeClass = "downloading";
      if (isQueued) {
        badgeText = "QUEUED";
        badgeClass = "queued";
      } else if (isStarting) {
        badgeText = "INITIALIZING";
        badgeClass = "starting";
      } else if (isPaused) {
        badgeText = "PAUSED";
        badgeClass = "paused";
      } else if (isProcessing) {
        badgeText = "MUXING";
        badgeClass = "processing";
      }

      return `
        <div class="task-card">
          <div class="task-card-header">
            <span class="task-card-title">${t.title || "Downloading Media"}</span>
            <div class="task-badges-row">
              ${t.isClip ? `<span class="status-badge clip-badge">✂️ Clip</span>` : ""}
              ${t.hasSubtitles ? `<span class="status-badge sub-badge">+Subs</span>` : ""}
              ${t.hasThumbnail ? `<span class="status-badge thumb-badge">+Cover</span>` : ""}
              <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${isPaused ? "paused" : (isStarting ? "starting" : "")}" style="width: ${isQueued ? 0 : (t.progress || 0)}%"></div>
          </div>
          <div class="task-metrics">
            <span>${isQueued ? "Queued" : (isStarting ? "Initializing..." : (t.progress?.toFixed(1) || 0) + "%")}</span>
            <span class="${isStarting ? "pulse-text" : ""}">${isQueued ? "Waiting in queue (Max 3 concurrent)" : (isPaused ? "Paused" : (isStarting ? "Decrypting & preparing download..." : speedText + (etaText !== "Connecting..." ? " • " + etaText : "")))}</span>
            <span>${isQueued || isStarting ? "0 MB" : dlBytes + " / " + totBytes}</span>
          </div>
          <div class="task-actions">
            ${isPaused ? `
              <button class="btn-task-action" data-action="resume" data-id="${t.id}" onclick="resumeTask('${t.id}')">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume
              </button>
            ` : `
              <button class="btn-task-action" data-action="pause" data-id="${t.id}" onclick="pauseTask('${t.id}')">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause
              </button>
            `}
            <button class="btn-task-action danger" data-action="cancel" data-id="${t.id}" onclick="cancelTask('${t.id}')">✕ Cancel</button>
          </div>
        </div>
      `;
    }).join("");
  }

  // Render Completed Tasks
  if (completedList.length === 0) {
    completedEmptyState.classList.remove("hidden");
    completedTasksList.innerHTML = "";
  } else {
    completedEmptyState.classList.add("hidden");
    completedTasksList.innerHTML = completedList.map((t) => {
      const sizeInfo = (t.downloadedBytes && t.downloadedBytes !== "0 MB" && t.downloadedBytes !== "NA") ? t.downloadedBytes : (t.totalBytes && t.totalBytes !== "0 MB" ? t.totalBytes : null);
      const isCompleted = t.status === "completed";

      return `
        <div class="task-card">
          <div class="task-card-header">
            <span class="task-card-title">${t.title}</span>
            <div class="task-badges-row">
              ${t.isClip ? `<span class="status-badge clip-badge">✂️ Clip</span>` : ""}
              ${t.hasSubtitles ? `<span class="status-badge sub-badge">+Subs</span>` : ""}
              ${t.hasThumbnail ? `<span class="status-badge thumb-badge">+Cover</span>` : ""}
              <span class="status-badge ${isCompleted ? "completed" : "canceled"}">
                ${t.status.toUpperCase()} ${sizeInfo ? "• " + sizeInfo : ""}
              </span>
            </div>
          </div>
          ${t.error ? `<div style="font-size: 10px; color: #fca5a5;">${t.error}</div>` : ""}
          <div class="task-actions">
            ${t.filePath ? `
              <button class="btn-task-action" data-action="open-file" data-path="${t.filePath.replace(/"/g, "&quot;")}" onclick="openFile('${t.filePath.replace(/\\/g, "\\\\")}')">▶ Open File</button>
              <button class="btn-task-action" data-action="show-in-folder" data-path="${t.filePath.replace(/"/g, "&quot;")}" onclick="showInFolder('${t.filePath.replace(/\\/g, "\\\\")}')">📁 Show in Folder</button>
            ` : `<button class="btn-task-action" data-action="show-in-folder" data-path="${(t.outputDir || "").replace(/"/g, "&quot;")}" onclick="showInFolder('${(t.outputDir || "").replace(/\\/g, "\\\\")}')">📁 Open Folder</button>`}
          </div>
        </div>
      `;
    }).join("");
  }
}

// Start Polling Loop
setInterval(pollTasks, 1000);
pollTasks();
