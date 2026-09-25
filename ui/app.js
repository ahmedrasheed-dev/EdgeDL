const { ipcRenderer } = require("electron");

let currentPort = 5000;
let SERVER_URL = `http://localhost:${currentPort}`;
let lastTasksList = [];
let notifiedTaskIds = new Set();
let currentPlaylistData = null;

// DOM Elements - Header, Theme & Settings Modal
const serverStatusText = document.getElementById("server-status-text");
const serverStatusPill = document.getElementById("server-status-pill");
const btnOpenSettings = document.getElementById("btn-open-settings");
const themeDots = document.querySelectorAll(".theme-dot");

const settingsModal = document.getElementById("settings-modal");
const btnCloseSettings = document.getElementById("btn-close-settings");
const btnCancelSettings = document.getElementById("btn-cancel-settings");
const btnSaveSettings = document.getElementById("btn-save-settings");
const settingsChannel = document.getElementById("settings-channel");
const settingsCookieSource = document.getElementById("settings-cookie-source");
const customCookieFileGroup = document.getElementById("custom-cookie-file-group");
const customCookiePath = document.getElementById("custom-cookie-path");
const btnBrowseCookieFile = document.getElementById("btn-browse-cookie-file");
const btnTriggerUpdateBinary = document.getElementById("btn-trigger-update-binary");
const portInput = document.getElementById("port-input");

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
const errorTitle = document.getElementById("error-title");
const errorMessage = document.getElementById("error-message");
const errorHint = document.getElementById("error-hint");
const btnCloseError = document.getElementById("btn-close-error");

btnCloseError?.addEventListener("click", () => {
  errorBanner.classList.add("hidden");
});

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

// DOM Elements - Binary Auto-Updater & FFmpeg Modal
const binaryModal = document.getElementById("binary-modal");
const binaryModalTitle = document.getElementById("binary-modal-title");
const binaryModalSubtitle = document.getElementById("binary-modal-subtitle");
const binaryProgressFill = document.getElementById("binary-progress-fill");
const binaryProgressPercent = document.getElementById("binary-progress-percent");
const binaryProgressSpeed = document.getElementById("binary-progress-speed");
const binaryProgressBytes = document.getElementById("binary-progress-bytes");
const ffmpegCheckItem = document.getElementById("ffmpeg-check-item");
const ffmpegCheckIcon = document.getElementById("ffmpeg-check-icon");
const ffmpegStatusText = document.getElementById("ffmpeg-status-text");
const ffmpegStatusPill = document.getElementById("ffmpeg-status-pill");
const ytdlpCheckItem = document.getElementById("ytdlp-check-item");
const ytdlpCheckIcon = document.getElementById("ytdlp-check-icon");
const ytdlpStatusText = document.getElementById("ytdlp-status-text");
const ytdlpStatusPill = document.getElementById("ytdlp-status-pill");
const binaryStatusBanner = document.getElementById("binary-status-banner");
const binaryStatusBannerText = document.getElementById("binary-status-banner-text");
const binaryFooterHint = document.getElementById("binary-footer-hint");
const btnSkipBinaryUpdate = document.getElementById("btn-skip-binary-update");

// State Variables
let currentMediaData = null;
let customSaveDir = null;
let currentTab = "active";
let currentMode = "video-audio"; // "video-audio", "video-only", "audio-only"
let binaryEventSource = null;
let binaryAutoCloseTimer = null;

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
      if (statsTotalSize) statsTotalSize.textContent = json.totalSizeFormatted || "0 MB";
      if (statsFileCount) statsFileCount.textContent = `${json.totalFiles || 0} Files downloaded`;
    }
  } catch (_) {}
}

btnRefreshStats?.addEventListener("click", fetchStorageStats);

// Helper: Calibrated YouTube AV1/VP9 Bitrates for Precise File Size Estimation
function getEstBitrateMbps(quality) {
  if (quality === "1080p") return 1.8;
  if (quality === "720p") return 0.9;
  if (quality === "480p") return 0.4;
  if (quality === "360p") return 0.2;
  if (quality === "best") return 2.5;
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
    if (outputDirInput) outputDirInput.value = dir;
  }
});

// Binary Modal Controller
function openBinaryModal(title = "Updating App Binaries", subtitle = "Updating app binaries, please wait...") {
  if (binaryAutoCloseTimer) {
    clearTimeout(binaryAutoCloseTimer);
    binaryAutoCloseTimer = null;
  }
  if (binaryModalTitle) binaryModalTitle.textContent = title;
  if (binaryModalSubtitle) binaryModalSubtitle.textContent = subtitle;
  if (binaryProgressFill) binaryProgressFill.style.width = "5%";
  if (binaryProgressPercent) binaryProgressPercent.textContent = "0%";
  if (binaryProgressSpeed) binaryProgressSpeed.textContent = "Connecting...";
  if (binaryProgressBytes) binaryProgressBytes.textContent = "0 MB / ~ 18.2 MB";

  if (ffmpegCheckItem) ffmpegCheckItem.className = "binary-check-item";
  if (ffmpegCheckIcon) ffmpegCheckIcon.innerHTML = `<span class="spinner-sm"></span>`;
  if (ffmpegStatusText) ffmpegStatusText.textContent = "Checking FFmpeg muxer...";
  if (ffmpegStatusPill) {
    ffmpegStatusPill.className = "binary-status-pill checking";
    ffmpegStatusPill.textContent = "CHECKING";
  }

  if (ytdlpCheckItem) ytdlpCheckItem.className = "binary-check-item";
  if (ytdlpCheckIcon) ytdlpCheckIcon.innerHTML = `<span class="spinner-sm"></span>`;
  if (ytdlpStatusText) ytdlpStatusText.textContent = "Checking yt-dlp binary...";
  if (ytdlpStatusPill) {
    ytdlpStatusPill.className = "binary-status-pill checking";
    ytdlpStatusPill.textContent = "CHECKING";
  }

  if (binaryStatusBanner) binaryStatusBanner.classList.add("hidden");
  if (btnSkipBinaryUpdate) btnSkipBinaryUpdate.classList.add("hidden");
  if (binaryFooterHint) binaryFooterHint.textContent = "Popup will close automatically when finished.";
  if (binaryModal) binaryModal.classList.remove("hidden");
}

function closeBinaryModal() {
  if (binaryEventSource) {
    try { binaryEventSource.close(); } catch (_) {}
    binaryEventSource = null;
  }
  if (binaryModal) binaryModal.classList.add("hidden");
}

btnSkipBinaryUpdate?.addEventListener("click", closeBinaryModal);

async function initStartupBinaryCheck(force = false) {
  openBinaryModal("Updating App Binaries", "Updating app binaries, please wait...");

  try {
    const resp = await fetch(`${SERVER_URL}/api/binary/startup-check${force ? "?force=true" : ""}`);
    const data = await resp.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to check binaries");
    }

    // 1. Process FFmpeg Status
    if (data.ffmpeg && data.ffmpeg.ok) {
      if (ffmpegCheckItem) ffmpegCheckItem.className = "binary-check-item ready";
      if (ffmpegCheckIcon) ffmpegCheckIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
      if (ffmpegStatusText) ffmpegStatusText.textContent = `FFmpeg active (${data.ffmpeg.version || "v6.1"})`;
      if (ffmpegStatusPill) {
        ffmpegStatusPill.className = "binary-status-pill ready";
        ffmpegStatusPill.textContent = "READY";
      }
    } else {
      if (ffmpegCheckItem) ffmpegCheckItem.className = "binary-check-item error";
      if (ffmpegCheckIcon) ffmpegCheckIcon.innerHTML = `<span style="color: #f87171; font-weight: bold;">✕</span>`;
      if (ffmpegStatusText) ffmpegStatusText.textContent = data.ffmpeg?.error || "FFmpeg not found";
      if (ffmpegStatusPill) {
        ffmpegStatusPill.className = "binary-status-pill error";
        ffmpegStatusPill.textContent = "WARNING";
      }
    }

    // 2. Process yt-dlp Status
    if (data.needsUpdate) {
      if (ytdlpCheckItem) ytdlpCheckItem.className = "binary-check-item";
      if (ytdlpCheckIcon) ytdlpCheckIcon.innerHTML = `<span class="spinner-sm"></span>`;
      if (ytdlpStatusText) ytdlpStatusText.textContent = "Downloading latest binary from GitHub CDN...";
      if (ytdlpStatusPill) {
        ytdlpStatusPill.className = "binary-status-pill downloading";
        ytdlpStatusPill.textContent = "DOWNLOADING";
      }

      if (binaryEventSource) {
        try { binaryEventSource.close(); } catch (_) {}
      }

      binaryEventSource = new EventSource(`${SERVER_URL}/api/binary/progress`);

      binaryEventSource.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const progress = msg.progress || 0;
          if (binaryProgressFill) binaryProgressFill.style.width = `${progress}%`;
          if (binaryProgressPercent) binaryProgressPercent.textContent = `${progress}%`;
          if (binaryProgressSpeed) binaryProgressSpeed.textContent = msg.speed || "Downloading...";
          if (binaryProgressBytes) binaryProgressBytes.textContent = `${msg.downloadedBytes || "0 MB"} / ${msg.totalBytes || "~ 18.2 MB"}`;

          if (msg.status === "completed" || progress >= 100) {
            if (binaryEventSource) {
              binaryEventSource.close();
              binaryEventSource = null;
            }

            if (ytdlpCheckItem) ytdlpCheckItem.className = "binary-check-item ready";
            if (ytdlpCheckIcon) ytdlpCheckIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
            if (ytdlpStatusText) ytdlpStatusText.textContent = "yt-dlp updated and ready";
            if (ytdlpStatusPill) {
              ytdlpStatusPill.className = "binary-status-pill ready";
              ytdlpStatusPill.textContent = "READY";
            }

            if (binaryProgressFill) binaryProgressFill.style.width = "100%";
            if (binaryProgressPercent) binaryProgressPercent.textContent = "100%";
            if (binaryProgressSpeed) binaryProgressSpeed.textContent = "Complete";

            if (binaryStatusBanner) binaryStatusBanner.classList.remove("hidden");
            if (binaryStatusBannerText) binaryStatusBannerText.textContent = "All engine binaries verified & up to date!";

            binaryAutoCloseTimer = setTimeout(() => {
              closeBinaryModal();
            }, 850);
          } else if (msg.status === "error") {
            if (binaryEventSource) {
              binaryEventSource.close();
              binaryEventSource = null;
            }

            if (data.ytDlp?.exists) {
              if (ytdlpCheckItem) ytdlpCheckItem.className = "binary-check-item ready";
              if (ytdlpCheckIcon) ytdlpCheckIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
              if (ytdlpStatusText) ytdlpStatusText.textContent = `Using local binary v${data.ytDlp.version || "active"}`;
              if (ytdlpStatusPill) {
                ytdlpStatusPill.className = "binary-status-pill ready";
                ytdlpStatusPill.textContent = "LOCAL";
              }

              if (binaryProgressFill) binaryProgressFill.style.width = "100%";
              if (binaryProgressPercent) binaryProgressPercent.textContent = "100%";
              if (binaryProgressSpeed) binaryProgressSpeed.textContent = "Ready";

              binaryAutoCloseTimer = setTimeout(() => {
                closeBinaryModal();
              }, 1200);
            } else {
              if (ytdlpCheckItem) ytdlpCheckItem.className = "binary-check-item error";
              if (ytdlpCheckIcon) ytdlpCheckIcon.innerHTML = `<span style="color: #f87171; font-weight: bold;">✕</span>`;
              if (ytdlpStatusText) ytdlpStatusText.textContent = msg.error || "Update failed";
              if (ytdlpStatusPill) {
                ytdlpStatusPill.className = "binary-status-pill error";
                ytdlpStatusPill.textContent = "FAILED";
              }
              if (btnSkipBinaryUpdate) btnSkipBinaryUpdate.classList.remove("hidden");
            }
          }
        } catch (_) {}
      };

      binaryEventSource.onerror = () => {
        if (data.ytDlp?.exists) {
          binaryAutoCloseTimer = setTimeout(() => closeBinaryModal(), 1200);
        }
      };

    } else {
      // Binary is already up to date
      if (ytdlpCheckItem) ytdlpCheckItem.className = "binary-check-item ready";
      if (ytdlpCheckIcon) ytdlpCheckIcon.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
      if (ytdlpStatusText) ytdlpStatusText.textContent = `yt-dlp v${data.ytDlp?.version || "latest"} is up to date`;
      if (ytdlpStatusPill) {
        ytdlpStatusPill.className = "binary-status-pill ready";
        ytdlpStatusPill.textContent = "UP TO DATE";
      }

      if (binaryProgressFill) binaryProgressFill.style.width = "100%";
      if (binaryProgressPercent) binaryProgressPercent.textContent = "100%";
      if (binaryProgressSpeed) binaryProgressSpeed.textContent = "Ready";
      if (binaryProgressBytes) binaryProgressBytes.textContent = "18.2 MB / 18.2 MB";

      if (binaryStatusBanner) binaryStatusBanner.classList.remove("hidden");
      if (binaryStatusBannerText) binaryStatusBannerText.textContent = "All engine binaries verified & up to date!";

      binaryAutoCloseTimer = setTimeout(() => {
        closeBinaryModal();
      }, 750);
    }

  } catch (err) {
    console.warn("[Startup Binary Check Warning]:", err);
    if (binaryProgressFill) binaryProgressFill.style.width = "100%";
    if (binaryProgressPercent) binaryProgressPercent.textContent = "100%";
    if (binaryProgressSpeed) binaryProgressSpeed.textContent = "Ready";
    binaryAutoCloseTimer = setTimeout(() => {
      closeBinaryModal();
    }, 1000);
  }
}

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
        initStartupBinaryCheck();
        return;
      }
    } catch (_) {}
  }

  serverStatusText.textContent = `Using port ${currentPort}`;
  fetchStorageStats();
  initStartupBinaryCheck();
}
initServerConfig();

// Window Controls
btnMinimize?.addEventListener("click", () => ipcRenderer.send("window-minimize"));
btnMaximize?.addEventListener("click", () => ipcRenderer.send("window-maximize"));
btnClose?.addEventListener("click", () => ipcRenderer.send("window-close"));

// App Settings & Anti-Bot Engine Modal Controls
async function loadAppSettings() {
  try {
    const resp = await fetch(`${SERVER_URL}/api/settings`);
    const json = await resp.json();
    if (json.success && json.settings) {
      const s = json.settings;
      if (settingsChannel) settingsChannel.value = s.updateChannel || "nightly";
      if (settingsCookieSource) {
        settingsCookieSource.value = s.cookieSource || "none";
        toggleCustomCookieGroup(s.cookieSource);
      }
      if (customCookiePath) customCookiePath.value = s.customCookieFile || "";
      if (portInput) portInput.value = s.port || currentPort;
    }
  } catch (_) {}
}

function toggleCustomCookieGroup(source) {
  if (customCookieFileGroup) {
    if (source === "custom") customCookieFileGroup.classList.remove("hidden");
    else customCookieFileGroup.classList.add("hidden");
  }
}

settingsCookieSource?.addEventListener("change", (e) => {
  toggleCustomCookieGroup(e.target.value);
});

btnBrowseCookieFile?.addEventListener("click", async () => {
  const filePath = await ipcRenderer.invoke("select-cookie-file");
  if (filePath && customCookiePath) {
    customCookiePath.value = filePath;
  }
});

function openSettingsModal() {
  loadAppSettings();
  if (settingsModal) settingsModal.classList.remove("hidden");
}

function closeSettingsModal() {
  if (settingsModal) settingsModal.classList.add("hidden");
}

btnOpenSettings?.addEventListener("click", openSettingsModal);
serverStatusPill?.addEventListener("click", openSettingsModal);
btnCloseSettings?.addEventListener("click", closeSettingsModal);
btnCancelSettings?.addEventListener("click", closeSettingsModal);

btnTriggerUpdateBinary?.addEventListener("click", () => {
  closeSettingsModal();
  initStartupBinaryCheck(true);
});

btnSaveSettings?.addEventListener("click", async () => {
  const targetPort = parseInt(portInput.value.trim(), 10);
  if (!targetPort || targetPort < 1024 || targetPort > 65535) {
    showError("Please enter a valid port between 1024 and 65535.");
    return;
  }

  const newSettings = {
    updateChannel: settingsChannel?.value || "nightly",
    cookieSource: settingsCookieSource?.value || "none",
    customCookieFile: customCookiePath?.value || ""
  };

  try {
    // Save settings
    await fetch(`${SERVER_URL}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSettings)
    });

    // Save port if changed
    if (targetPort !== currentPort) {
      await fetch(`${SERVER_URL}/api/config/port`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: targetPort })
      });
      currentPort = targetPort;
      SERVER_URL = `http://localhost:${currentPort}`;
      if (serverStatusText) serverStatusText.textContent = `Port ${currentPort}`;
    }

    closeSettingsModal();
    showToast("Settings Saved", "Anti-bot settings & cookie preferences saved successfully.", "success");
  } catch (err) {
    showToast("Save Error", err.message || "Failed to save settings", "error");
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
      if (Array.isArray(json.tasks)) {
        lastTasksList = [...json.tasks, ...lastTasksList];
        renderTasks(lastTasksList);
      }
      closePlaylistModal();
      switchTab("active");
      setTimeout(pollTasks, 100);
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

// Global Floating Toast Notification Function
function showToast(title, message, type = "error", duration = 5000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-card toast-${type}`;

  let icon = "⚠️";
  if (type === "success") icon = "✓";
  if (type === "info") icon = "ℹ️";

  toast.innerHTML = `
    <span class="toast-icon-box">${icon}</span>
    <div class="toast-content">
      <span class="toast-title">${title}</span>
      <span class="toast-desc">${message}</span>
    </div>
    <button class="toast-close-btn" title="Dismiss">✕</button>
  `;

  const closeBtn = toast.querySelector(".toast-close-btn");
  closeBtn?.addEventListener("click", () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px) scale(0.95)";
    setTimeout(() => toast.remove(), 250);
  });

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px) scale(0.95)";
        setTimeout(() => toast.remove(), 250);
      }
    }, duration);
  }
}
window.showToast = showToast;

function showError(msg, title = "Analysis Error", hint = "") {
  if (msg) {
    if (errorTitle) errorTitle.textContent = title;
    if (errorMessage) errorMessage.textContent = msg;
    if (errorHint) {
      if (hint) {
        errorHint.textContent = `💡 ${hint}`;
        errorHint.classList.remove("hidden");
      } else {
        errorHint.classList.add("hidden");
      }
    }
    errorBanner.classList.remove("hidden");
    showToast(title, msg, "error");
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
    showError("Please enter or paste a valid http:// or https:// video or playlist URL.", "Invalid URL Format", "Make sure the link starts with https://");
    return;
  }

  try {
    new URL(targetUrl);
  } catch (_) {
    showError("The entered link is not a valid URL structure.", "Invalid URL", "Check for typos or incomplete link strings.");
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
      showError(json.error || "Failed to extract media information.", "Media Extraction Failed", json.suggestion || "Check your internet connection or verify the URL.");
      return;
    }

    if (json.data.isPlaylist) {
      openPlaylistModal(json.data);
    } else {
      currentMediaData = json.data;
      renderMediaCard(currentMediaData);
    }
  } catch (err) {
    showError(err.message || "Could not analyze URL. Please check your connection.", "Network / Server Error", "Ensure the EdgeDL local server is running and internet is active.");
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

  // Populate Video Formats - Deduplicated by height so user gets exactly one clean option per resolution (1080p, 720p, 480p, 360p, etc.)
  selectVideo.innerHTML = "";

  const rawStreams = data.videoStreams || [];
  const mapByHeight = new Map();

  rawStreams.forEach((v) => {
    const h = v.height || (v.resolution ? parseInt(v.resolution.replace("p", ""), 10) : 0);
    if (!h || isNaN(h)) return;

    if (!mapByHeight.has(h)) {
      mapByHeight.set(h, v);
    } else {
      const existing = mapByHeight.get(h);
      const fpsA = v.fps || 0;
      const fpsB = existing.fps || 0;
      const sizeA = v.filesize || 0;
      const sizeB = existing.filesize || 0;

      if (fpsA > fpsB || (fpsA === fpsB && sizeA > sizeB)) {
        mapByHeight.set(h, v);
      }
    }
  });

  const uniqueVideoStreams = Array.from(mapByHeight.values()).sort((a, b) => (b.height || 0) - (a.height || 0));

  if (uniqueVideoStreams.length > 0) {
    uniqueVideoStreams.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.formatId;

      const h = v.height || parseInt((v.resolution || "").replace("p", ""), 10) || 0;
      let label = `${h}p`;
      if (h >= 4320) label = "4320p (8K Ultra HD)";
      else if (h >= 2160) label = "2160p (4K Ultra HD)";
      else if (h >= 1440) label = "1440p (2K Quad HD)";
      else if (h >= 1080) label = "1080p (Full HD)";
      else if (h >= 720) label = "720p (HD)";
      else if (h >= 480) label = "480p (SD)";
      else if (h >= 360) label = "360p (SD)";
      else if (h >= 240) label = "240p";
      else if (h >= 144) label = "144p";

      const szStr = formatBytes(v.filesize);
      opt.textContent = `${label} ${v.fps > 30 ? `@ ${v.fps}fps` : ""} ${szStr ? "• " + szStr : ""}`;
      selectVideo.appendChild(opt);
    });
  } else {
    const opt = document.createElement("option");
    opt.value = "best";
    opt.textContent = "Best Available Quality";
    selectVideo.appendChild(opt);
  }

  // Populate Audio Formats with Auto (English / Original Audio) as default
  selectAudio.innerHTML = "";
  const autoAudioOpt = document.createElement("option");
  autoAudioOpt.value = "auto";
  autoAudioOpt.textContent = "⚡ Auto (Original / English Audio)";
  selectAudio.appendChild(autoAudioOpt);

  (data.audioStreams || []).forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.formatId;
    let langLabel = "";
    if (a.isOriginal) langLabel = " [Original]";
    else if (a.language) langLabel = ` [${a.language}]`;
    else if (a.formatNote) langLabel = ` [${a.formatNote}]`;

    opt.textContent = `Audio (${a.ext || "m4a"})${langLabel} • ${a.abr || 128}kbps ${formatBytes(a.filesize)}`;
    selectAudio.appendChild(opt);
  });

  updateFormForMode();
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
      if (json.task) {
        lastTasksList = [json.task, ...lastTasksList.filter((t) => t.id !== json.task.id)];
        renderTasks(lastTasksList);
      }
      switchTab("active");
      setTimeout(pollTasks, 100);
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

function dismissTask(taskId) {
  const task = lastTasksList.find((t) => t.id === taskId);
  if (task) {
    task.dismissedFromActive = true;
    renderTasks(lastTasksList);
  }
}

async function retryTask(taskId) {
  const task = lastTasksList.find((t) => t.id === taskId);
  if (!task) return;

  task.status = "starting";
  task.error = null;
  task.progress = 0;
  task.speed = "Retrying download...";
  task.dismissedFromActive = false;
  renderTasks(lastTasksList);

  try {
    const resp = await fetch(`${SERVER_URL}/api/download/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: task.url,
        downloadType: task.downloadType,
        videoFormatId: task.params?.videoFormatId,
        audioFormatId: task.params?.audioFormatId,
        outputFormat: task.params?.outputFormat || "mp4",
        outputDir: task.outputDir,
        title: task.title,
        speedLimit: task.params?.speedLimit,
        subtitleOption: task.params?.subtitleOption,
        thumbnailOption: task.params?.thumbnailOption,
        startTime: task.startTime,
        endTime: task.endTime
      })
    });
    const json = await resp.json();
    if (json.success && json.task) {
      lastTasksList = [json.task, ...lastTasksList.filter((t) => t.id !== taskId && t.id !== json.task.id)];
      renderTasks(lastTasksList);
    }
    setTimeout(pollTasks, 200);
  } catch (err) {
    task.status = "error";
    task.error = "Retry failed: " + err.message;
    renderTasks(lastTasksList);
  }
}

window.dismissTask = dismissTask;
window.retryTask = retryTask;

function copyErrorToClipboard(taskId) {
  const task = lastTasksList.find((t) => t.id === taskId);
  if (!task) return;
  const fullText = `[EdgeDL Error Report]\nTitle: ${task.title || "Media"}\nTask ID: ${task.id}\nError: ${task.error || "Unknown error"}\nDetails: ${task.rawError || task.errorDetails || "N/A"}\nSuggestion: ${task.errorSuggestion || "N/A"}`;
  
  navigator.clipboard.writeText(fullText).then(() => {
    showToast("Error Copied", "Diagnostic details copied to clipboard.", "info", 2500);
  }).catch(() => {
    showToast("Copy Failed", "Unable to access system clipboard.", "error", 2500);
  });
}

window.copyErrorToClipboard = copyErrorToClipboard;

const notifiedErrorTaskIds = new Set();

function renderTasks(tasks) {
  const activeList = tasks.filter((t) => t.status === "downloading" || t.status === "starting" || t.status === "processing" || t.status === "paused" || t.status === "queued" || (t.status === "error" && !t.dismissedFromActive));
  const completedList = tasks.filter((t) => t.status === "completed" || t.status === "canceled" || t.status === "error");

  if (countActive) countActive.textContent = activeList.length;
  if (countCompleted) countCompleted.textContent = completedList.length;

  // Trigger Notifications & Refresh Storage Stats
  tasks.forEach((t) => {
    if (t.status === "completed" && !notifiedTaskIds.has(t.id)) {
      notifiedTaskIds.add(t.id);
      ipcRenderer.send("notify-completed", { title: t.title, filePath: t.filePath });
      showToast("Download Finished 🎉", `${t.title} has completed successfully.`, "success", 4000);
      fetchStorageStats();
    } else if (t.status === "error" && !notifiedErrorTaskIds.has(t.id)) {
      notifiedErrorTaskIds.add(t.id);
      showToast("Download Failed ⚠️", `${t.title || "Media"}: ${t.error || "An error occurred"}`, "error", 6000);
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
      const isError = t.status === "error";

      const dlBytes = (!t.downloadedBytes || t.downloadedBytes === "NA") ? "~" : t.downloadedBytes;
      const totBytes = (!t.totalBytes || t.totalBytes === "NA" || t.totalBytes === "0 MB") ? (dlBytes !== "~" ? dlBytes : "~") : t.totalBytes;

      let speedText = t.speed || "Decrypting streams...";
      if (speedText === "0 MB/s" || speedText === "~ MB/s" || speedText === "NA") {
        speedText = "Decrypting streams...";
      }

      let etaText = (!t.eta || t.eta === "NA" || t.eta === "--:--") ? "Connecting..." : `ETA ${t.eta}`;

      let badgeText = "DOWNLOADING";
      let badgeClass = "downloading";
      if (isError) {
        badgeText = "FAILED";
        badgeClass = "canceled";
      } else if (isQueued) {
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
        <div class="task-card ${isError ? 'task-card-error' : ''}">
          <div class="task-card-header">
            <span class="task-card-title">${t.title || "Downloading Media"}</span>
            <div class="task-badges-row">
              ${t.isClip ? `<span class="status-badge clip-badge">✂️ Clip</span>` : ""}
              ${t.hasSubtitles ? `<span class="status-badge sub-badge">+Subs</span>` : ""}
              ${t.hasThumbnail ? `<span class="status-badge thumb-badge">+Cover</span>` : ""}
              <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>
          </div>
          ${isError ? `
            <div class="task-error-box">
              <div class="task-error-header">
                <span class="task-error-title">⚠️ ${t.error || "Download Error"}</span>
              </div>
              ${t.rawError && t.rawError !== t.error ? `<div class="task-error-msg">${t.rawError}</div>` : ""}
              ${t.errorSuggestion ? `<div class="task-error-hint">💡 ${t.errorSuggestion}</div>` : ""}
            </div>
          ` : `
            <div class="progress-bar-bg">
              <div class="progress-bar-fill ${isPaused ? "paused" : (isStarting ? "starting" : "")}" style="width: ${isQueued ? 0 : (t.progress || 0)}%"></div>
            </div>
            <div class="task-metrics">
              <span>${isQueued ? "Queued" : (isStarting ? "Initializing..." : (t.progress?.toFixed(1) || 0) + "%")}</span>
              <span class="${isStarting ? "pulse-text" : ""}">${isQueued ? "Waiting in queue (Max 3 concurrent)" : (isPaused ? "Paused" : (isStarting ? "Decrypting & preparing download..." : speedText + (etaText !== "Connecting..." ? " • " + etaText : "")))}</span>
              <span>${isQueued || isStarting ? "0 MB" : dlBytes + " / " + totBytes}</span>
            </div>
          `}
          <div class="task-actions">
            ${isError ? `
              <button class="btn-task-action btn-retry" data-action="retry" data-id="${t.id}" onclick="retryTask('${t.id}')">↻ Retry Download</button>
              <button class="btn-task-action btn-copy" data-action="copy-error" data-id="${t.id}" onclick="copyErrorToClipboard('${t.id}')">📋 Copy Error</button>
              <button class="btn-task-action" data-action="dismiss" data-id="${t.id}" onclick="dismissTask('${t.id}')">Dismiss</button>
            ` : isPaused ? `
              <button class="btn-task-action" data-action="resume" data-id="${t.id}" onclick="resumeTask('${t.id}')">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume
              </button>
              <button class="btn-task-action danger" data-action="cancel" data-id="${t.id}" onclick="cancelTask('${t.id}')">✕ Cancel</button>
            ` : `
              <button class="btn-task-action" data-action="pause" data-id="${t.id}" onclick="pauseTask('${t.id}')">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause
              </button>
              <button class="btn-task-action danger" data-action="cancel" data-id="${t.id}" onclick="cancelTask('${t.id}')">✕ Cancel</button>
            `}
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
      const isError = t.status === "error";

      return `
        <div class="task-card ${isError ? 'task-card-error' : ''}">
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
          ${isError ? `
            <div class="task-error-box">
              <div class="task-error-header">
                <span class="task-error-title">⚠️ ${t.error || "Download Error"}</span>
              </div>
              ${t.rawError && t.rawError !== t.error ? `<div class="task-error-msg">${t.rawError}</div>` : ""}
              ${t.errorSuggestion ? `<div class="task-error-hint">💡 ${t.errorSuggestion}</div>` : ""}
            </div>
          ` : ""}
          <div class="task-actions">
            ${isError ? `
              <button class="btn-task-action btn-retry" data-action="retry" data-id="${t.id}" onclick="retryTask('${t.id}')">↻ Retry Download</button>
              <button class="btn-task-action btn-copy" data-action="copy-error" data-id="${t.id}" onclick="copyErrorToClipboard('${t.id}')">📋 Copy Error</button>
            ` : t.filePath ? `
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
