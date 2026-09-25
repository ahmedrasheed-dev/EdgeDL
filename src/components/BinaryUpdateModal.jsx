import React, { useState, useEffect } from 'react';

export default function BinaryUpdateModal({ isOpen, onClose, serverUrl }) {
  const [data, setData] = useState({
    progress: 0,
    speed: 'Connecting...',
    downloadedBytes: '0 MB',
    totalBytes: '~ 18.2 MB',
    ffmpeg: { ok: true, version: 'v6.1' },
    ytDlp: { version: 'nightly' }
  });

  useEffect(() => {
    if (!isOpen) return;

    const poll = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/binary/status`);
        const json = await res.json();
        const payload = json.status || json.state || json.data;
        if (json.success && payload) {
          setData(payload);
          if (payload.progress >= 100 || payload.status === 'completed' || payload.status === 'up-to-date') {
            setTimeout(() => onClose?.(), 2500);
          }
        }
      } catch (_) {}
    };

    poll();
    const interval = setInterval(poll, 800);
    return () => clearInterval(interval);
  }, [isOpen, serverUrl]);

  if (!isOpen) return null;

  const progress = data?.progress || 0;
  const ffmpegOk = data?.ffmpeg?.ok;
  const ffmpegVersion = data?.ffmpeg?.version || 'v6.1';
  const ytdlpVersion = data?.ytDlp?.version || 'nightly';

  return (
    <div className="modal-overlay">
      <div className="modal-card binary-modal-card">
        <div className="binary-modal-header">
          <div className="binary-icon-glow">
            <svg className="binary-spin-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
          </div>
          <div className="binary-header-text">
            <h3>Updating App Engine Binaries</h3>
            <p>Updating app binaries, please wait...</p>
          </div>
        </div>

        <div className="binary-modal-body">
          <div className="binary-progress-wrapper">
            <div className="binary-progress-track">
              <div className="binary-progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            <div className="binary-metrics-row">
              <span className="binary-metric-percent">{progress}%</span>
              <span className="binary-metric-speed">{data?.speed || 'Connecting...'}</span>
              <span className="binary-metric-bytes">{data?.downloadedBytes || '0 MB'} / {data?.totalBytes || '~ 18.2 MB'}</span>
            </div>
          </div>

          <div className="binary-checklist">
            <div className={`binary-check-item ${ffmpegOk ? 'ready' : ''}`}>
              <div className="binary-check-icon-wrapper">
                {ffmpegOk ? '✓' : <span className="spinner-sm"></span>}
              </div>
              <div className="binary-check-info">
                <div className="binary-check-title">FFmpeg Core Muxer Engine</div>
                <div className="binary-check-status">{ffmpegOk ? `Ready (${ffmpegVersion})` : 'Verifying audio/video muxer...'}</div>
              </div>
              <span className={`binary-status-pill ${ffmpegOk ? 'ready' : 'checking'}`}>
                {ffmpegOk ? 'READY' : 'CHECKING'}
              </span>
            </div>

            <div className={`binary-check-item ${progress >= 100 ? 'ready' : ''}`}>
              <div className="binary-check-icon-wrapper">
                {progress >= 100 ? '✓' : <span className="spinner-sm"></span>}
              </div>
              <div className="binary-check-info">
                <div className="binary-check-title">yt-dlp Extractor Engine</div>
                <div className="binary-check-status">{progress >= 100 ? `Up to date (${ytdlpVersion})` : 'Checking latest releases...'}</div>
              </div>
              <span className={`binary-status-pill ${progress >= 100 ? 'ready' : 'downloading'}`}>
                {progress >= 100 ? 'READY' : 'DOWNLOADING'}
              </span>
            </div>
          </div>
        </div>

        <div className="binary-modal-footer">
          <span className="binary-footer-hint">Popup will close automatically when finished.</span>
          <button className="secondary-btn btn-sm" onClick={onClose}>Dismiss</button>
        </div>
      </div>
    </div>
  );
}
