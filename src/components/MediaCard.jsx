import React, { useState, useEffect } from 'react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

function formatDuration(seconds) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function MediaCard({
  mediaData,
  currentMode,
  customSaveDir,
  setCustomSaveDir,
  serverUrl,
  onStartDownload,
  onShowToast,
  onRefreshStats
}) {
  if (!mediaData) return null;

  const [selectedVideoFormat, setSelectedVideoFormat] = useState('best');
  const [selectedAudioFormat, setSelectedAudioFormat] = useState('auto');
  const [selectedFormat, setSelectedFormat] = useState(() => (currentMode === 'audio-only' ? 'mp3' : 'mp4'));
  const [speedLimit, setSpeedLimit] = useState('unlimited');
  const [subtitleOption, setSubtitleOption] = useState('none');
  const [enableTrimmer, setEnableTrimmer] = useState(false);
  const [trimStart, setTrimStart] = useState('');
  const [trimEnd, setTrimEnd] = useState('');
  const [isSavingThumb, setIsSavingThumb] = useState(false);
  const [thumbSaved, setThumbSaved] = useState(false);

  useEffect(() => {
    if (currentMode === 'audio-only') {
      setSelectedFormat('mp3');
    } else {
      setSelectedFormat('mp4');
    }
  }, [currentMode]);

  // Deduplicate video formats
  const videoMap = new Map();
  (mediaData.videoStreams || []).forEach((v) => {
    const h = v.height || parseInt((v.resolution || '').replace('p', ''), 10) || 0;
    const existing = videoMap.get(h);
    if (!existing || (v.filesize && (!existing.filesize || v.filesize > existing.filesize))) {
      videoMap.set(h, v);
    }
  });
  const uniqueVideoStreams = Array.from(videoMap.values()).sort((a, b) => (b.height || 0) - (a.height || 0));

  const handleBrowseDir = async () => {
    if (ipcRenderer) {
      const chosen = await ipcRenderer.invoke('select-download-dir');
      if (chosen) {
        setCustomSaveDir(chosen);
      }
    }
  };

  const handleSaveThumb = async () => {
    if (!mediaData.thumbnail) return;
    setIsSavingThumb(true);
    try {
      const res = await fetch(`${serverUrl}/api/download/thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: mediaData.thumbnail,
          thumbnailUrl: mediaData.thumbnail,
          title: mediaData.title,
          outputDir: customSaveDir
        })
      });
      const json = await res.json();
      if (json.success) {
        setThumbSaved(true);
        onShowToast?.('Thumbnail Saved', `Saved cover image to ${json.filePath || 'downloads folder'}.`, 'success');
        onRefreshStats?.();
      } else {
        onShowToast?.('Save Error', json.error || 'Failed to save cover image.', 'error');
      }
    } catch (e) {
      onShowToast?.('Save Error', e.message, 'error');
    } finally {
      setIsSavingThumb(false);
    }
  };

  const handleDownload = () => {
    onStartDownload({
      url: mediaData.url || mediaData.webpageUrl || mediaData.webpage_url,
      title: mediaData.title,
      thumbnail: mediaData.thumbnail,
      duration: mediaData.duration,
      downloadType: currentMode,
      selectedVideoFormat,
      selectedAudioFormat,
      selectedFormat,
      customSaveDir,
      speedLimit,
      subtitleOption,
      enableTrimmer,
      trimStart,
      trimEnd
    });
  };

  return (
    <div className="media-card" id="media-card">
      <div className="media-header">
        <div className="media-thumb-wrapper">
          <img src={mediaData.thumbnail} alt="Thumbnail" className="media-thumb" />
        </div>
        <div className="media-info">
          <h3 className="media-title">{mediaData.title}</h3>
          <p className="media-uploader">{mediaData.uploader || 'Native Web Stream'}</p>
          <div className="media-meta-row">
            <span className="meta-badge">{formatDuration(mediaData.duration) || 'Stream'}</span>
            <button
              className="btn-thumb-action"
              onClick={handleSaveThumb}
              disabled={isSavingThumb || thumbSaved}
              title="Download High-Res Cover Image"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>{thumbSaved ? 'Saved!' : isSavingThumb ? 'Saving...' : 'Save Cover'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="options-form">
        {/* Video Stream Selector */}
        {currentMode !== 'audio-only' && (
          <div className="form-group">
            <label>Video Resolution</label>
            <select
              className="custom-select"
              value={selectedVideoFormat}
              onChange={(e) => setSelectedVideoFormat(e.target.value)}
            >
              {uniqueVideoStreams.length > 0 ? (
                uniqueVideoStreams.map((v) => {
                  const h = v.height || parseInt((v.resolution || '').replace('p', ''), 10) || 0;
                  let label = `${h}p`;
                  if (h >= 4320) label = '4320p (8K Ultra HD)';
                  else if (h >= 2160) label = '2160p (4K Ultra HD)';
                  else if (h >= 1440) label = '1440p (2K Quad HD)';
                  else if (h >= 1080) label = '1080p (Full HD)';
                  else if (h >= 720) label = '720p (HD)';
                  else if (h >= 480) label = '480p (SD)';
                  else if (h >= 360) label = '360p (SD)';
                  else if (h >= 240) label = '240p';
                  else if (h >= 144) label = '144p';

                  const szStr = formatBytes(v.filesize);
                  return (
                    <option key={v.formatId} value={v.formatId}>
                      {label} {v.fps > 30 ? `@ ${v.fps}fps` : ''} {szStr ? `• ${szStr}` : ''}
                    </option>
                  );
                })
              ) : (
                <option value="best">Best Available Quality</option>
              )}
            </select>
          </div>
        )}

        {/* Audio Stream Selector */}
        {currentMode !== 'video-only' && (
          <div className="form-group">
            <label>Audio Track</label>
            <select
              className="custom-select"
              value={selectedAudioFormat}
              onChange={(e) => setSelectedAudioFormat(e.target.value)}
            >
              <option value="auto">⚡ Auto (Original / English Audio)</option>
              {(mediaData.audioStreams || []).map((a) => {
                let langLabel = '';
                if (a.isOriginal) langLabel = ' [Original]';
                else if (a.language) langLabel = ` [${a.language}]`;
                else if (a.formatNote) langLabel = ` [${a.formatNote}]`;

                return (
                  <option key={a.formatId} value={a.formatId}>
                    Audio ({a.ext || 'm4a'}){langLabel} • {a.abr || 128}kbps {formatBytes(a.filesize)}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Container Format & Output Folder */}
        <div className="form-row">
          <div className="form-group flex-1">
            <label>Format</label>
            <select
              className="custom-select"
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
            >
              {currentMode === 'audio-only' ? (
                ['mp3', 'm4a', 'wav', 'aac', 'flac'].map((fmt) => (
                  <option key={fmt} value={fmt}>{fmt.toUpperCase()} (.{fmt})</option>
                ))
              ) : (
                ['mp4', 'mkv', 'webm'].map((fmt) => (
                  <option key={fmt} value={fmt}>{fmt.toUpperCase()} (.{fmt})</option>
                ))
              )}
            </select>
          </div>

          <div className="form-group flex-2">
            <label>Save Folder</label>
            <div className="dir-picker-wrapper">
              <input
                type="text"
                readOnly
                value={customSaveDir || ''}
                placeholder="Downloads/EdgeDL"
              />
              <button className="secondary-btn" onClick={handleBrowseDir}>Browse</button>
            </div>
          </div>
        </div>

        {/* Speed Limit & Subtitles Controls */}
        <div className="form-row">
          <div className="form-group flex-1">
            <label>Speed Limit</label>
            <select
              className="custom-select"
              value={speedLimit}
              onChange={(e) => setSpeedLimit(e.target.value)}
            >
              <option value="unlimited">Unlimited</option>
              <option value="2M">2 MB/s</option>
              <option value="5M">5 MB/s</option>
              <option value="10M">10 MB/s</option>
              <option value="50M">50 MB/s</option>
            </select>
          </div>

          <div className="form-group flex-1">
            <label>Subtitles</label>
            <select
              className="custom-select"
              value={subtitleOption}
              onChange={(e) => setSubtitleOption(e.target.value)}
            >
              <option value="none">No Subtitles</option>
              <option value="embed">Embed in Video</option>
              <option value="srt">Save .SRT File</option>
            </select>
          </div>
        </div>

        {/* Video Trimmer & Clip Extractor */}
        <div className="trimmer-container">
          <label className="checkbox-label trimmer-toggle">
            <input
              type="checkbox"
              checked={enableTrimmer}
              onChange={(e) => setEnableTrimmer(e.target.checked)}
            />
            <span>✂️ Trim Specific Clip / Range</span>
          </label>
          {enableTrimmer && (
            <div className="form-row" style={{ marginTop: '6px' }}>
              <div className="form-group flex-1">
                <label>Start Time</label>
                <input
                  type="text"
                  placeholder="01:30"
                  className="custom-input-sm"
                  value={trimStart}
                  onChange={(e) => setTrimStart(e.target.value)}
                />
              </div>
              <div className="form-group flex-1">
                <label>End Time</label>
                <input
                  type="text"
                  placeholder="04:15"
                  className="custom-input-sm"
                  value={trimEnd}
                  onChange={(e) => setTrimEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Download Button */}
        <button className="download-action-btn" onClick={handleDownload}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Start Download</span>
        </button>
      </div>
    </div>
  );
}
