import React from 'react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function Titlebar({ theme, setTheme, port, openSettings }) {
  const handleMinimize = () => ipcRenderer?.send('window-minimize');
  const handleMaximize = () => ipcRenderer?.send('window-maximize');
  const handleClose = () => ipcRenderer?.send('window-close');

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <img src="./icon.png" alt="EdgeDL" className="titlebar-logo-img" />
        <div className="titlebar-text">
          <span className="titlebar-title">EdgeDL Standalone</span>
          <span className="titlebar-version">v1.4.6</span>
        </div>
      </div>

      <div className="server-status-pill" onClick={openSettings} title="Click to open App Settings">
        <span className="status-dot"></span>
        <span>Port {port}</span>
        <button className="icon-btn-inline" title="Open Settings" onClick={(e) => { e.stopPropagation(); openSettings(); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>

      <div className="theme-switcher" title="Select Theme Accent Color">
        <button
          className={`theme-dot blue ${theme === 'blue' ? 'active' : ''}`}
          onClick={() => setTheme('blue')}
          title="Neon Blue"
        />
        <button
          className={`theme-dot emerald ${theme === 'emerald' ? 'active' : ''}`}
          onClick={() => setTheme('emerald')}
          title="Emerald Green"
        />
        <button
          className={`theme-dot purple ${theme === 'purple' ? 'active' : ''}`}
          onClick={() => setTheme('purple')}
          title="Cyber Purple"
        />
        <button
          className={`theme-dot amber ${theme === 'amber' ? 'active' : ''}`}
          onClick={() => setTheme('amber')}
          title="Sunset Amber"
        />
      </div>

      <div className="titlebar-controls">
        <button className="win-btn" onClick={handleMinimize} title="Minimize">—</button>
        <button className="win-btn" onClick={handleMaximize} title="Maximize">□</button>
        <button className="win-btn close-btn" onClick={handleClose} title="Close to Tray">✕</button>
      </div>
    </header>
  );
}
