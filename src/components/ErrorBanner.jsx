import React from 'react';

export default function ErrorBanner({ error, onClose }) {
  if (!error) return null;

  return (
    <div className="error-banner">
      <div className="error-banner-icon-wrapper">
        <svg className="error-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div className="error-banner-content">
        <div className="error-banner-title">{error.title || 'Analysis Error'}</div>
        <div className="error-banner-text">{error.message}</div>
        {error.hint && (
          <div className="error-banner-hint">💡 {error.hint}</div>
        )}
      </div>
      <button className="error-close-btn" onClick={onClose} title="Dismiss error">✕</button>
    </div>
  );
}
