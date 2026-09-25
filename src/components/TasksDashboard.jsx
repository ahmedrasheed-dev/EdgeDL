import React from 'react';
import StorageStatsCard from './StorageStatsCard';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function TasksDashboard({
  tasks,
  currentTab,
  setCurrentTab,
  onPauseTask,
  onResumeTask,
  onCancelTask,
  onRetryTask,
  onShowToast,
  storageStats,
  onRefreshStats
}) {
  const activeList = tasks.filter((t) => 
    t.status === 'downloading' || 
    t.status === 'starting' || 
    t.status === 'processing' || 
    t.status === 'paused' || 
    t.status === 'queued' || 
    (t.status === 'error' && !t.dismissedFromActive)
  );

  const completedList = tasks.filter((t) => 
    t.status === 'completed' || 
    t.status === 'canceled' || 
    t.status === 'error'
  );

  const handleOpenFile = (filePath) => {
    if (ipcRenderer && filePath) {
      ipcRenderer.send('open-file', filePath);
    }
  };

  const handleShowInFolder = (filePath) => {
    if (ipcRenderer && filePath) {
      ipcRenderer.send('show-in-folder', filePath);
    }
  };

  const handleCopyError = (t) => {
    const fullText = `[EdgeDL Error Report]\nTitle: ${t.title || 'Media'}\nTask ID: ${t.id}\nError: ${t.error || 'Unknown error'}\nDetails: ${t.rawError || t.errorDetails || 'N/A'}\nSuggestion: ${t.errorSuggestion || 'N/A'}`;
    navigator.clipboard.writeText(fullText).then(() => {
      onShowToast?.('Error Copied', 'Diagnostic details copied to clipboard.', 'info');
    }).catch(() => {
      onShowToast?.('Copy Failed', 'Unable to access clipboard.', 'error');
    });
  };

  return (
    <section className="panel tasks-panel">
      <div className="panel-header flex-between">
        <div>
          <h2>Downloads</h2>
          <p>Active tasks & historical progress</p>
        </div>
        <div className="task-tabs">
          <button
            className={`tab-btn ${currentTab === 'active' ? 'active' : ''}`}
            onClick={() => setCurrentTab('active')}
          >
            Active ({activeList.length})
          </button>
          <button
            className={`tab-btn ${currentTab === 'completed' ? 'active' : ''}`}
            onClick={() => setCurrentTab('completed')}
          >
            Completed ({completedList.length})
          </button>
        </div>
      </div>

      {/* Active Tasks View */}
      {currentTab === 'active' && (
        <div className="tasks-container">
          {activeList.length === 0 ? (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <p>No active downloads</p>
              <span className="empty-subtext">Analyze a video URL to start downloading</span>
            </div>
          ) : (
            <div className="tasks-list">
              {activeList.map((t) => {
                const isError = t.status === 'error';
                const isPaused = t.status === 'paused';

                return (
                  <div key={t.id} className="task-card">
                    <div className="task-card-header">
                      <span className="task-card-title">{t.title}</span>
                      <div className="task-badges-row">
                        {t.isClip && <span className="status-badge clip-badge">✂️ Clip</span>}
                        {t.hasSubtitles && <span className="status-badge sub-badge">+Subs</span>}
                        {t.hasThumbnail && <span className="status-badge thumb-badge">+Cover</span>}
                        <span className={`status-badge ${t.status}`}>
                          {t.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {!isError && (
                      <>
                        <div className="progress-bar-bg">
                          <div className={`progress-bar-fill ${t.status}`} style={{ width: `${t.progress || 0}%` }}></div>
                        </div>
                        <div className="task-metrics">
                          <span>{t.speed || '0 MB/s'}</span>
                          <span>{t.progress || 0}%</span>
                          <span>ETA: {t.eta || '--:--'}</span>
                        </div>
                      </>
                    )}

                    {isError && (
                      <div className="task-error-box">
                        <div className="task-error-title">⚠️ {t.error || 'Download Error'}</div>
                        {t.rawError && t.rawError !== t.error && (
                          <div className="task-error-msg">{t.rawError}</div>
                        )}
                        {t.errorSuggestion && (
                          <div className="task-error-hint">💡 {t.errorSuggestion}</div>
                        )}
                      </div>
                    )}

                    <div className="task-actions">
                      {isError ? (
                        <>
                          <button className="btn-task-action" onClick={() => onRetryTask(t.id)}>↻ Retry</button>
                          <button className="btn-task-action" onClick={() => handleCopyError(t)}>📋 Copy Error</button>
                        </>
                      ) : isPaused ? (
                        <>
                          <button className="btn-task-action" onClick={() => onResumeTask(t.id)}>▶ Resume</button>
                          <button className="btn-task-action danger" onClick={() => onCancelTask(t.id)}>✕ Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="btn-task-action" onClick={() => onPauseTask(t.id)}>⏸ Pause</button>
                          <button className="btn-task-action danger" onClick={() => onCancelTask(t.id)}>✕ Cancel</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Completed Tasks View */}
      {currentTab === 'completed' && (
        <div className="tasks-container">
          {completedList.length === 0 ? (
            <div className="empty-state">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <p>No completed downloads yet</p>
              <span className="empty-subtext">Completed files will be listed here</span>
            </div>
          ) : (
            <div className="tasks-list">
              {completedList.map((t) => {
                const isCompleted = t.status === 'completed';

                return (
                  <div key={t.id} className="task-card">
                    <div className="task-card-header">
                      <span className="task-card-title">{t.title}</span>
                      <div className="task-badges-row">
                        {t.isClip && <span className="status-badge clip-badge">✂️ Clip</span>}
                        {t.hasSubtitles && <span className="status-badge sub-badge">+Subs</span>}
                        {t.hasThumbnail && <span className="status-badge thumb-badge">+Cover</span>}
                        <span className={`status-badge ${t.status}`}>
                          {t.status.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="task-actions">
                      {isCompleted && t.filePath ? (
                        <>
                          <button className="btn-task-action" onClick={() => handleOpenFile(t.filePath)}>▶ Open File</button>
                          <button className="btn-task-action" onClick={() => handleShowInFolder(t.filePath)}>📁 Show in Folder</button>
                        </>
                      ) : (
                        <button className="btn-task-action" onClick={() => handleShowInFolder(t.outputDir)}>📁 Open Folder</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Storage Usage Box - RIGHT SIDE */}
      {storageStats && (
        <StorageStatsCard stats={storageStats} onRefresh={onRefreshStats} />
      )}

      {/* Initialization Notice Box */}
      <div className="tasks-notice-box">
        <div className="notice-icon-wrapper">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </div>
        <div className="notice-content">
          <span className="notice-title">Initialization Note:</span>
          If a download takes a few moments to begin, please wait while YouTube signatures and stream links are decrypted.
        </div>
      </div>
    </section>
  );
}
