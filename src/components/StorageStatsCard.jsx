import React from 'react';

export default function StorageStatsCard({ stats, onRefresh }) {
  return (
    <div className="storage-stats-box">
      <div className="stats-icon-wrapper">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      </div>
      <div className="stats-info">
        <div className="stats-title-row">
          <span className="stats-label">Storage Usage</span>
          <span className="stats-value">{stats.totalSizeFormatted || '0 MB'}</span>
        </div>
        <div className="stats-detail-row">
          <span>{stats.totalFiles || 0} Files downloaded</span>
          <button className="icon-btn-inline" onClick={onRefresh} title="Refresh Storage Analytics">↻</button>
        </div>
      </div>
    </div>
  );
}
