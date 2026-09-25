import React, { useState } from 'react';
import { X, Search } from 'lucide-react';

function getEstBitrateMbps(quality) {
  if (quality === '1080p') return 1.8;
  if (quality === '720p') return 0.9;
  if (quality === '480p') return 0.4;
  if (quality === '360p') return 0.2;
  if (quality === 'best') return 2.5;
  return 1.2;
}

function calcEstSizeStr(durationSec, quality) {
  if (!durationSec || isNaN(durationSec)) return '~ 0 MB';
  const mbps = getEstBitrateMbps(quality);
  const bytes = durationSec * (mbps * 1000000 / 8);
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `~ ${(mb / 1024).toFixed(1)} GB`;
  }
  return `~ ${mb.toFixed(1)} MB`;
}

function calcEstSizeBytes(durationSec, quality) {
  if (!durationSec || isNaN(durationSec)) return 0;
  const mbps = getEstBitrateMbps(quality);
  return durationSec * (mbps * 1000000 / 8);
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) {
    return `${hrs}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export default function PlaylistModal({
  isOpen,
  onClose,
  playlistData,
  currentMode,
  customSaveDir,
  onStartBatchDownload
}) {
  if (!isOpen || !playlistData) return null;

  const entries = playlistData.entries || [];
  const [selectedIndices, setSelectedIndices] = useState(() => entries.map((_, i) => i));
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [quality, setQuality] = useState('best');
  const [format, setFormat] = useState(currentMode === 'audio-only' ? 'mp3' : 'mp4');
  const [speedLimit, setSpeedLimit] = useState('unlimited');
  const [subtitleOption, setSubtitleOption] = useState('none');
  const [thumbnailOption, setThumbnailOption] = useState('none');

  const filteredEntries = entries.filter((e) =>
    (e.title || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const updateActiveFilter = (newSelected) => {
    if (newSelected.length === entries.length) {
      setActiveFilter('all');
    } else if (newSelected.length === 0) {
      setActiveFilter('none');
    } else if (newSelected.length === 5 && newSelected.every((val, index) => val === index)) {
      setActiveFilter('top5');
    } else if (newSelected.length === 10 && newSelected.every((val, index) => val === index)) {
      setActiveFilter('top10');
    } else {
      setActiveFilter(null);
    }
  };

  const toggleItem = (originalIdx) => {
    let next;
    if (selectedIndices.includes(originalIdx)) {
      next = selectedIndices.filter((i) => i !== originalIdx);
    } else {
      next = [...selectedIndices, originalIdx];
    }
    setSelectedIndices(next);
    updateActiveFilter(next);
  };

  const handleSelectAll = () => {
    const all = entries.map((_, i) => i);
    setSelectedIndices(all);
    setActiveFilter('all');
  };
  const handleDeselectAll = () => {
    setSelectedIndices([]);
    setActiveFilter('none');
  };
  const handleSelectTop5 = () => {
    const top5 = entries.slice(0, 5).map((_, i) => i);
    setSelectedIndices(top5);
    setActiveFilter('top5');
  };
  const handleSelectTop10 = () => {
    const top10 = entries.slice(0, 10).map((_, i) => i);
    setSelectedIndices(top10);
    setActiveFilter('top10');
  };

  const selectedEntries = selectedIndices.map((i) => entries[i]).filter(Boolean);
  const totalDurationSec = selectedEntries.reduce((acc, curr) => acc + (curr.duration || 0), 0);
  const totalBytesEst = selectedEntries.reduce((acc, curr) => acc + calcEstSizeBytes(curr.duration, quality), 0);

  let totalSizeStr = '0 MB';
  if (totalBytesEst > 0) {
    const mb = totalBytesEst / (1024 * 1024);
    totalSizeStr = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
  }

  const handleBatchDownload = () => {
    if (selectedEntries.length === 0) return;
    onStartBatchDownload({
      items: selectedEntries,
      playlistTitle: playlistData.title,
      downloadType: currentMode,
      quality,
      outputFormat: format,
      outputDir: customSaveDir,
      speedLimit,
      subtitleOption,
      thumbnailOption
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-[620px] max-w-full max-h-[92vh] bg-[#121215] border border-[#232328] rounded-2xl p-6 flex flex-col gap-4 shadow-2xl shadow-black text-zinc-200 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Stacked colorful tiles icon */}
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white shadow-md shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" fill="#38bdf8" stroke="none"/>
                <rect x="7" y="7" width="7" height="7" rx="1" fill="#a855f7" stroke="none"/>
                <rect x="11" y="11" width="7" height="7" rx="1" fill="#f43f5e" stroke="none"/>
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">{playlistData.title || 'Playlist'}</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {playlistData.uploader || 'YouTube'} • {entries.length} Videos
              </p>
            </div>
          </div>
          <button
            className="text-zinc-500 hover:text-white transition-colors p-1"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Dropdown Options Grid */}
        <div className="flex flex-col gap-3">
          {/* Row 1: Video Quality & Format */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold tracking-wider text-zinc-400 uppercase mb-1.5">
                VIDEO QUALITY
              </label>
              <div className="relative">
                <select
                  className="w-full bg-[#18181d] border border-[#282830] text-zinc-100 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8 font-medium"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                >
                  <option value="best">Best Available (1080p+)</option>
                  <option value="1080p">1080p Full HD</option>
                  <option value="720p">720p HD</option>
                  <option value="480p">480p SD</option>
                  <option value="360p">360p SD</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-wider text-zinc-400 uppercase mb-1.5">
                FORMAT
              </label>
              <div className="relative">
                <select
                  className="w-full bg-[#18181d] border border-[#282830] text-zinc-100 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8 font-medium"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  <option value="mp4">MP4 (.mp4)</option>
                  <option value="mkv">MKV (.mkv)</option>
                  <option value="mp3">MP3 (.mp3)</option>
                  <option value="m4a">M4A (.m4a)</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Speed Limit, Subtitles, Thumbnails */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold tracking-wider text-zinc-400 uppercase mb-1.5">
                SPEED LIMIT
              </label>
              <div className="relative">
                <select
                  className="w-full bg-[#18181d] border border-[#282830] text-zinc-100 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8 font-medium"
                  value={speedLimit}
                  onChange={(e) => setSpeedLimit(e.target.value)}
                >
                  <option value="unlimited">Unlimited</option>
                  <option value="10M">10 MB/s</option>
                  <option value="5M">5 MB/s</option>
                  <option value="2M">2 MB/s</option>
                  <option value="1M">1 MB/s</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-wider text-zinc-400 uppercase mb-1.5">
                SUBTITLES
              </label>
              <div className="relative">
                <select
                  className="w-full bg-[#18181d] border border-[#282830] text-zinc-100 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8 font-medium"
                  value={subtitleOption}
                  onChange={(e) => setSubtitleOption(e.target.value)}
                >
                  <option value="none">No Subtitles</option>
                  <option value="embed">Embed Subtitles</option>
                  <option value="srt">Save SRT File</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-wider text-zinc-400 uppercase mb-1.5">
                THUMBNAILS
              </label>
              <div className="relative">
                <select
                  className="w-full bg-[#18181d] border border-[#282830] text-zinc-100 text-xs rounded-lg px-3 py-2.5 outline-none focus:border-blue-500 cursor-pointer appearance-none pr-8 font-medium"
                  value={thumbnailOption}
                  onChange={(e) => setThumbnailOption(e.target.value)}
                >
                  <option value="none">No Cover Image</option>
                  <option value="embed">Embed Cover Image</option>
                  <option value="jpg">Save JPG Cover</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Quick Selection Box */}
        <div className="bg-[#18181d] border border-[#282830] rounded-xl p-2.5 flex items-center gap-2">
          <div className="flex-1 flex items-center bg-[#121215] border border-[#232328] rounded-lg px-3 py-1.5">
            <Search size={14} className="text-zinc-500 mr-2 shrink-0" />
            <input
              type="text"
              className="bg-transparent text-xs text-zinc-100 placeholder-zinc-500 w-full focus:outline-none"
              placeholder="Search playlist videos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                  : 'bg-[#232328] hover:bg-[#2c2c34] text-zinc-300 hover:text-white font-medium'
              }`}
              onClick={handleSelectAll}
            >
              All
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                activeFilter === 'none'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                  : 'bg-[#232328] hover:bg-[#2c2c34] text-zinc-300 hover:text-white font-medium'
              }`}
              onClick={handleDeselectAll}
            >
              None
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                activeFilter === 'top5'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                  : 'bg-[#232328] hover:bg-[#2c2c34] text-zinc-300 hover:text-white font-medium'
              }`}
              onClick={handleSelectTop5}
            >
              Top 5
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                activeFilter === 'top10'
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/20'
                  : 'bg-[#232328] hover:bg-[#2c2c34] text-zinc-300 hover:text-white font-medium'
              }`}
              onClick={handleSelectTop10}
            >
              Top 10
            </button>
          </div>
        </div>

        {/* Selection Stats Bar */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-zinc-300 font-medium">
            {selectedEntries.length} of {entries.length} selected • ~ {totalSizeStr} total
          </span>
          <div className="bg-[#18181d] border border-[#282830] rounded-lg px-2.5 py-1 text-xs text-zinc-400 font-mono flex items-center gap-1.5">
            <span>⏱️</span>
            <span>{formatDuration(totalDurationSec)} Total</span>
          </div>
        </div>

        {/* Track Card List */}
        <div className="max-h-64 overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-thin">
          {filteredEntries.map((e) => {
            const originalIdx = entries.indexOf(e);
            const isChecked = selectedIndices.includes(originalIdx);

            return (
              <div
                key={originalIdx}
                onClick={() => toggleItem(originalIdx)}
                className={`bg-[#18181d] border rounded-xl p-3 flex items-center gap-3.5 cursor-pointer transition-all ${
                  isChecked
                    ? 'border-blue-500/80 bg-[#1b1b22] shadow-sm shadow-blue-500/10'
                    : 'border-[#282830] opacity-60 hover:opacity-100 hover:border-zinc-600'
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0"
                  checked={isChecked}
                  onChange={() => {}} // handled by parent div onClick
                />
                
                {/* Thumbnail */}
                <div className="w-14 h-9 rounded-md bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700/50 flex items-center justify-center">
                  {e.thumbnail ? (
                    <img src={e.thumbnail} alt={e.title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-zinc-500">No Image</span>
                  )}
                </div>

                {/* Track Details */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    #{e.index || originalIdx + 1} {e.title}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] font-mono">
                    <span className="text-zinc-400 flex items-center gap-1">
                      <span>⏱️</span>
                      <span>{formatDuration(e.duration)}</span>
                    </span>
                    <span className="text-blue-400">
                      {calcEstSizeStr(e.duration, quality)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#232328] mt-1">
          <button
            className="px-5 py-2.5 bg-[#232328] hover:bg-[#2c2c34] text-zinc-200 text-xs font-semibold rounded-xl transition-all cursor-pointer"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2.5 bg-[#00d084] hover:bg-[#00c27b] text-white text-xs font-bold rounded-xl shadow-lg shadow-[#00d084]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            onClick={handleBatchDownload}
            disabled={selectedEntries.length === 0}
          >
            Start Batch Download
          </button>
        </div>

      </div>
    </div>
  );
}
