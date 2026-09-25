import React, { useState, useEffect } from 'react';

const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

export default function SettingsModal({ isOpen, onClose, serverUrl, currentPort, onPortChanged, onShowToast, onTriggerBinaryUpdate }) {
  if (!isOpen) return null;

  const [channel, setChannel] = useState('nightly');
  const [cookieSource, setCookieSource] = useState('none');
  const [customCookieFile, setCustomCookieFile] = useState('');
  const [portInput, setPortInput] = useState(currentPort || 5000);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch(`${serverUrl}/api/settings`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.settings) {
          const s = json.settings;
          if (s.updateChannel) setChannel(s.updateChannel);
          if (s.cookieSource) setCookieSource(s.cookieSource);
          if (s.customCookieFile) setCustomCookieFile(s.customCookieFile);
          if (s.port) setPortInput(s.port);
        }
      })
      .catch((_) => {});
  }, [serverUrl]);

  const handleBrowseCookieFile = async () => {
    if (ipcRenderer) {
      const chosen = await ipcRenderer.invoke('select-cookie-file');
      if (chosen) setCustomCookieFile(chosen);
    }
  };

  const handleTriggerUpdate = async () => {
    try {
      fetch(`${serverUrl}/api/binary/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      }).catch((_) => {});
      
      onClose();
      onTriggerBinaryUpdate?.();
    } catch (e) {
      onShowToast?.('Update Failed', e.message, 'error');
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await fetch(`${serverUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updateChannel: channel,
          cookieSource,
          customCookieFile,
          port: parseInt(portInput, 10) || currentPort
        })
      });

      if (parseInt(portInput, 10) !== currentPort) {
        await fetch(`${serverUrl}/api/config/port`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: parseInt(portInput, 10) })
        });
        onPortChanged(parseInt(portInput, 10));
      }

      onShowToast?.('Settings Saved', 'Anti-bot settings & preferences updated.', 'success');
      onClose();
    } catch (e) {
      onShowToast?.('Save Error', e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card settings-modal-card">
        <div className="modal-header">
          <div className="settings-modal-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <h3>App Settings & Anti-Bot Engine</h3>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body settings-modal-body">
          {/* Engine Channel Section */}
          <div className="settings-section">
            <h4 className="settings-section-title">⚡ Extractor Engine Channel</h4>
            <div className="form-group">
              <label>yt-dlp Release Channel</label>
              <select className="custom-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="nightly">Nightly Channel (Recommended - Daily Anti-Bot Fixes)</option>
                <option value="stable">Stable Release Channel</option>
              </select>
              <span className="field-hint">Nightly builds include the latest YouTube SABR streaming & JS challenge solver updates.</span>
            </div>
            <button className="secondary-btn btn-sm" style={{ marginTop: '4px' }} onClick={handleTriggerUpdate}>
              ↻ Update yt-dlp & Engine Binaries Now
            </button>
          </div>

          {/* Browser Cookies Section */}
          <div className="settings-section">
            <h4 className="settings-section-title">🍪 Cookie Authentication</h4>
            <div className="form-group">
              <label>Extract Cookies From Browser</label>
              <select className="custom-select" value={cookieSource} onChange={(e) => setCookieSource(e.target.value)}>
                <option value="none">Disabled (Cookie-Free Downloads)</option>
                <option value="firefox">Mozilla Firefox</option>
                <option value="chrome">Google Chrome</option>
                <option value="edge">Microsoft Edge</option>
                <option value="brave">Brave Browser</option>
                <option value="opera">Opera</option>
                <option value="vivaldi">Vivaldi</option>
                <option value="custom">Custom cookies.txt File</option>
              </select>
              <span className="field-hint">Allows downloading private/age-restricted media & bypasses strict rate limits.</span>
            </div>
            {cookieSource === 'custom' && (
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label>Custom Cookies File (.txt)</label>
                <div className="dir-picker-wrapper">
                  <input type="text" readOnly value={customCookieFile} placeholder="Path to cookies.txt" />
                  <button className="secondary-btn" onClick={handleBrowseCookieFile}>Browse</button>
                </div>
              </div>
            )}
          </div>

          {/* Engine Capabilities Status */}
          <div className="settings-section">
            <h4 className="settings-section-title">🛠️ Active Protection Systems</h4>
            <div className="engine-badges-grid">
              <div className="engine-badge-card">
                <span className="badge-dot green"></span>
                <div>
                  <strong>Node.js JS Solver</strong>
                  <p>Executes YouTube n-sig challenges natively</p>
                </div>
              </div>
              <div className="engine-badge-card">
                <span className="badge-dot blue"></span>
                <div>
                  <strong>Player Clients Fallback</strong>
                  <p>mweb, web, and ios client emulation</p>
                </div>
              </div>
            </div>
          </div>

          {/* Server Port Section */}
          <div className="settings-section">
            <h4 className="settings-section-title">🌐 Local Service Port</h4>
            <div className="form-group">
              <label>Port Number</label>
              <input type="number" min="1024" max="65535" value={portInput} onChange={(e) => setPortInput(e.target.value)} className="custom-input-sm" />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="secondary-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={handleSaveSettings} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
