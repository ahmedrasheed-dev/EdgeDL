import React from 'react';

export default function UrlInputBar({ urlInput, setUrlInput, onAnalyze, isAnalyzing }) {
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().startsWith('http')) {
        const clean = text.trim();
        setUrlInput(clean);
        onAnalyze(clean);
      }
    } catch (_) {}
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onAnalyze(urlInput);
    }
  };

  return (
    <div className="url-input-container">
      <div className="input-wrapper">
        <input
          type="text"
          placeholder="Paste video, audio, or playlist URL..."
          autoComplete="off"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn-input-action"
          onClick={handlePaste}
          title="Paste from clipboard"
        >
          Paste
        </button>
      </div>
      <button
        className="primary-btn"
        onClick={() => onAnalyze(urlInput)}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? (
          <>
            <span className="spinner"></span>
            <span>Analyzing URL...</span>
          </>
        ) : (
          <span>Analyze URL</span>
        )}
      </button>
    </div>
  );
}
