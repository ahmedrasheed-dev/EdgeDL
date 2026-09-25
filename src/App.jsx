import React, { useState, useEffect } from 'react';
import Titlebar from './components/Titlebar';
import ModeSelector from './components/ModeSelector';
import UrlInputBar from './components/UrlInputBar';
import ErrorBanner from './components/ErrorBanner';
import MediaCard from './components/MediaCard';
import TasksDashboard from './components/TasksDashboard';
import SettingsModal from './components/SettingsModal';
import PlaylistModal from './components/PlaylistModal';
import BinaryUpdateModal from './components/BinaryUpdateModal';
import ToastContainer from './components/ToastContainer';

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('edgedl-theme') || 'blue');
  const [port, setPort] = useState(null);
  const [serverUrl, setServerUrl] = useState('');
  const [currentMode, setCurrentMode] = useState('video-audio');
  const [urlInput, setUrlInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [mediaData, setMediaData] = useState(null);
  const [playlistData, setPlaylistData] = useState(null);
  const [customSaveDir, setCustomSaveDir] = useState('');

  // Dashboard state
  const [tasks, setTasks] = useState([]);
  const [currentTab, setCurrentTab] = useState('active');
  const [storageStats, setStorageStats] = useState({ totalFiles: 0, totalSizeBytes: 0, totalSizeFormatted: '0 MB' });

  // Modal states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isBinaryModalOpen, setIsBinaryModalOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Sync theme attribute to document body for dynamic theme colors
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('edgedl-theme', theme);
  }, [theme]);

  // Discover active server port intelligently
  useEffect(() => {
    const checkPort = async (p) => {
      try {
        const res = await fetch(`http://localhost:${p}/api/stats`);
        const contentType = res.headers.get('content-type');
        if (res.ok && contentType && contentType.includes('application/json')) {
          const json = await res.json();
          if (json.success !== undefined) return true;
        }
      } catch (_) {}
      return false;
    };

    const discoverPort = async () => {
      // 1. Try port from Electron IPC if available and verified
      if (window.require) {
        try {
          const { ipcRenderer } = window.require('electron');
          const p = await ipcRenderer.invoke('get-server-port');
          if (p && (await checkPort(p))) {
            setPort(p);
            setServerUrl(`http://localhost:${p}`);
            return;
          }
        } catch (_) {}
      }

      // 2. Scan ports 5000-5020 to locate active EdgeDL Express server
      for (let p = 5000; p <= 5020; p++) {
        if (await checkPort(p)) {
          setPort(p);
          setServerUrl(`http://localhost:${p}`);
          return;
        }
      }
    };

    discoverPort();
  }, []);

  // Fetch storage stats & tasks polling loop
  const fetchStorageStats = async (sUrl) => {
    try {
      const res = await fetch(`${sUrl}/api/stats`);
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.stats) {
          setStorageStats(json.stats);
        }
      }
    } catch (_) {}
  };

  const fetchTasks = async (sUrl) => {
    try {
      const res = await fetch(`${sUrl}/api/download/tasks`);
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && json.tasks) {
          setTasks(json.tasks);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (!serverUrl) return;
    fetchStorageStats(serverUrl);
    fetchTasks(serverUrl);
    const interval = setInterval(() => {
      fetchTasks(serverUrl);
    }, 1000);
    return () => clearInterval(interval);
  }, [serverUrl]);

  // Toast helper
  const showToast = (title, message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Analyze URL handler
  const handleAnalyzeUrl = async (urlToAnalyze) => {
    const targetUrl = (urlToAnalyze || urlInput || '').trim();
    if (!targetUrl) return;

    setIsAnalyzing(true);
    setError(null);
    setMediaData(null);
    setPlaylistData(null);

    try {
      const res = await fetch(`${serverUrl}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, mode: currentMode })
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned HTML response instead of JSON. (Target port ${port})`);
      }

      const json = await res.json();

      if (!json.success) {
        setError({
          title: 'Extraction Error',
          message: json.error || 'Failed to extract media data.',
          hint: json.hint || 'Check your internet connection or verify the URL format.'
        });
        return;
      }

      const payload = json.data || json;
      if (json.isPlaylist || payload.isPlaylist) {
        setPlaylistData(payload);
        setIsPlaylistOpen(true);
      } else {
        setMediaData(payload);
      }
    } catch (err) {
      setError({
        title: 'Connection Error',
        message: err.message || 'Server did not respond.',
        hint: 'Ensure the local server is running on port ' + port
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Start single download
  const handleStartDownload = async (downloadPayload) => {
    try {
      const res = await fetch(`${serverUrl}/api/download/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(downloadPayload)
      });
      const json = await res.json();

      if (json.success) {
        showToast('Download Started 🚀', `Added "${json.title || 'Media'}" to active downloads queue.`, 'success');
        fetchTasks(serverUrl);
      } else {
        showToast('Failed to Start', json.error || 'Unknown error occurred.', 'error');
      }
    } catch (err) {
      showToast('Connection Error', err.message, 'error');
    }
  };

  // Start batch playlist download
  const handleStartBatchDownload = async (batchPayload) => {
    try {
      const res = await fetch(`${serverUrl}/api/download/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchPayload)
      });
      const json = await res.json();

      if (json.success) {
        showToast('Playlist Queue Active 🎉', `Queued ${json.count || batchPayload.items.length} items for download.`, 'success');
        setIsPlaylistOpen(false);
        fetchTasks(serverUrl);
      } else {
        showToast('Batch Error', json.error || 'Could not queue playlist.', 'error');
      }
    } catch (err) {
      showToast('Connection Error', err.message, 'error');
    }
  };

  // Task Control API Handlers
  const handlePauseTask = async (taskId) => {
    try {
      await fetch(`${serverUrl}/api/download/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', taskId })
      });
      fetchTasks(serverUrl);
    } catch (_) {}
  };

  const handleResumeTask = async (taskId) => {
    try {
      await fetch(`${serverUrl}/api/download/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume', taskId })
      });
      fetchTasks(serverUrl);
    } catch (_) {}
  };

  const handleCancelTask = async (taskId) => {
    try {
      await fetch(`${serverUrl}/api/download/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', taskId })
      });
      fetchTasks(serverUrl);
    } catch (_) {}
  };

  const handleRetryTask = async (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    handleStartDownload({
      url: task.url,
      downloadType: task.downloadType || 'video-audio',
      selectedVideoFormat: task.selectedVideoFormat || 'best',
      selectedAudioFormat: task.selectedAudioFormat || 'auto',
      selectedFormat: task.selectedFormat || 'mp4',
      customSaveDir: task.outputDir,
      speedLimit: task.speedLimit || 'unlimited',
      subtitleOption: task.subtitleOption || 'none',
      enableTrimmer: task.isClip,
      trimStart: task.startTime,
      trimEnd: task.endTime
    });
  };

  return (
    <div className="app-container">
      {/* Titlebar */}
      <Titlebar
        theme={theme}
        setTheme={setTheme}
        port={port}
        openSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Workspace Grid */}
      <main className="content-grid">
        {/* Left Panel: Extractor & Options */}
        <section className="panel control-panel">
          <div className="panel-header">
            <h2>Media Downloader</h2>
            <p>Extract native high-quality streams from supported platforms</p>
          </div>

          <ModeSelector currentMode={currentMode} setMode={setCurrentMode} />

          <UrlInputBar
            urlInput={urlInput}
            setUrlInput={setUrlInput}
            onAnalyze={handleAnalyzeUrl}
            isAnalyzing={isAnalyzing}
          />

          <ErrorBanner error={error} onClose={() => setError(null)} />

          <MediaCard
            mediaData={mediaData}
            currentMode={currentMode}
            customSaveDir={customSaveDir}
            setCustomSaveDir={setCustomSaveDir}
            serverUrl={serverUrl}
            onStartDownload={handleStartDownload}
            onShowToast={showToast}
            onRefreshStats={() => fetchStorageStats(serverUrl)}
          />
        </section>

        {/* Right Panel: Tasks Dashboard & Storage Stats */}
        <TasksDashboard
          tasks={tasks}
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          onPauseTask={handlePauseTask}
          onResumeTask={handleResumeTask}
          onCancelTask={handleCancelTask}
          onRetryTask={handleRetryTask}
          onShowToast={showToast}
          storageStats={storageStats}
          onRefreshStats={() => fetchStorageStats(serverUrl)}
        />
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>Native yt-dlp & FFmpeg Engine</span>
        <span>EdgeDL Standalone</span>
      </footer>

      {/* Modals & Overlays */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        serverUrl={serverUrl}
        currentPort={port}
        onPortChanged={(newPort) => {
          setPort(newPort);
          setServerUrl(`http://localhost:${newPort}`);
        }}
        onShowToast={showToast}
        onTriggerBinaryUpdate={() => {
          setIsSettingsOpen(false);
          setIsBinaryModalOpen(true);
        }}
      />

      <PlaylistModal
        isOpen={isPlaylistOpen}
        onClose={() => setIsPlaylistOpen(false)}
        playlistData={playlistData}
        currentMode={currentMode}
        customSaveDir={customSaveDir}
        onStartBatchDownload={handleStartBatchDownload}
      />

      <BinaryUpdateModal
        isOpen={isBinaryModalOpen}
        onClose={() => setIsBinaryModalOpen(false)}
        serverUrl={serverUrl}
      />

      {/* Global Floating Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
