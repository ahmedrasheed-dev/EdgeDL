import React from 'react';

export default function ModeSelector({ currentMode, setMode }) {
  return (
    <div className="segmented-control">
      <button
        className={`segmented-btn ${currentMode === 'video-audio' ? 'active' : ''}`}
        onClick={() => setMode('video-audio')}
      >
        Video + Audio
      </button>
      <button
        className={`segmented-btn ${currentMode === 'video-only' ? 'active' : ''}`}
        onClick={() => setMode('video-only')}
      >
        Video Only
      </button>
      <button
        className={`segmented-btn ${currentMode === 'audio-only' ? 'active' : ''}`}
        onClick={() => setMode('audio-only')}
      >
        Audio Only
      </button>
    </div>
  );
}
