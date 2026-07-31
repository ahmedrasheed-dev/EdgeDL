import { useEffect, useState } from "react"
import "./style.css"

interface StreamInfo {
  formatId: string
  url: string
  ext: string
  resolution?: string
  width?: number
  height?: number
  fps?: number
  vcodec?: string
  acodec?: string
  hasAudio?: boolean
  filesize?: number | null
  formatNote?: string | null
  abr?: number | null
}

interface MediaData {
  id: string
  title: string
  description?: string
  thumbnail?: string
  duration?: number
  uploader?: string
  webpageUrl: string
  extractor: string
  audioStreams: StreamInfo[]
  videoStreams: StreamInfo[]
  isFromCache?: boolean
}

const SERVER_URL = "https://edgedl.onrender.com"
// const SERVER_URL = "http://localhost:5000"

const getCacheKey = (rawUrl: string) => "edgedl_cache_" + encodeURIComponent(rawUrl.trim())

const getCachedMediaData = async (rawUrl: string): Promise<MediaData | null> => {
  if (!chrome?.storage?.local) return null
  const key = getCacheKey(rawUrl)
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result && result[key] ? (result[key] as MediaData) : null)
    })
  })
}

const setCachedMediaData = async (rawUrl: string, data: MediaData) => {
  if (!chrome?.storage?.local) return
  const key = getCacheKey(rawUrl)
  await chrome.storage.local.set({ [key]: data })
}

function App() {
  const [activeTab, setActiveTab] = useState<"web" | "local">("web")

  // Web Extractor State
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [mediaData, setMediaData] = useState<MediaData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<StreamInfo | null>(null)
  const [selectedAudio, setSelectedAudio] = useState<StreamInfo | null>(null)

  // Local File Muxer State
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null)
  const [localAudioFile, setLocalAudioFile] = useState<File | null>(null)
  const [outputFormat, setOutputFormat] = useState<string>("mp4")
  const [muxPreset, setMuxPreset] = useState<string>("copy")
  const [customArgs, setCustomArgs] = useState<string>("")
  const [localReading, setLocalReading] = useState(false)

  // Download/Process Status State
  const [downloadState, setDownloadState] = useState<{
    isProcessing: boolean
    status: string
    progress: number
    error: string | null
    mode?: string
  }>({
    isProcessing: false,
    status: "",
    progress: 0,
    error: null,
    mode: "idle"
  })

  // Poll status on mount and listen to state broadcasts
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
      if (response) {
        setDownloadState(response)
      }
    })

    const listener = (message: any) => {
      if (message.type === "STATE_BROADCAST" && message.state) {
        setDownloadState(message.state)
      } else if (
        message.type === "STATUS_UPDATE" ||
        message.type === "DOWNLOAD_READY" ||
        message.type === "PROCESS_ERROR"
      ) {
        chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
          if (response) setDownloadState(response)
        })
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  // Auto-detect active tab URL on open
  useEffect(() => {
    fetchActiveTabUrl().then((activeUrl) => {
      if (activeUrl) {
        setUrl(activeUrl)
        extractMediaForUrl(activeUrl)
      }
    })
  }, [])

  const fetchActiveTabUrl = async (): Promise<string | null> => {
    if (!chrome?.tabs?.query) return null
    return new Promise<string | null>((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const candidate = tabs?.[0]?.url || tabs?.[0]?.pendingUrl
        if (candidate && candidate.startsWith("http") && !candidate.includes("chrome://")) {
          return resolve(candidate)
        }
        chrome.tabs.query({ active: true, currentWindow: true }, (currentTabs) => {
          const cCandidate = currentTabs?.[0]?.url || currentTabs?.[0]?.pendingUrl
          if (cCandidate && cCandidate.startsWith("http") && !cCandidate.includes("chrome://")) {
            return resolve(cCandidate)
          }
          resolve(null)
        })
      })
    })
  }

  const extractYouTubeId = (url: string): string | null => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  const extractClientSideYouTube = async (url: string): Promise<MediaData | null> => {
    const videoId = extractYouTubeId(url);
    if (!videoId) return null;

    try {
      let json: any = null;

      // 1. Try reading directly from active YouTube tab memory via content script
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id && activeTab?.url?.includes("youtube.com")) {
          const tabResp = await chrome.tabs.sendMessage(activeTab.id, { type: "GET_PAGE_MEDIA" });
          if (tabResp?.success && tabResp?.data?.streamingData) {
            json = tabResp.data;
          }
        }
      } catch (_) {}

      // 2. If tab memory unavailable, fetch youtubei API using ANDROID client (returns direct URLs for all videos)
      if (!json) {
        const resp = await fetch("https://www.youtube.com/youtubei/v1/player", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-YouTube-Client-Name": "3",
            "X-YouTube-Client-Version": "19.02.39"
          },
          body: JSON.stringify({
            videoId: videoId,
            context: {
              client: {
                clientName: "ANDROID",
                clientVersion: "19.02.39",
                androidSdkVersion: 30,
                hl: "en",
                gl: "US"
              }
            }
          })
        });

        if (resp.ok) {
          json = await resp.json();
        }
      }

      if (!json || !json.streamingData) return null;
      const streamingData = json.streamingData;

      const details = json.videoDetails || {};
      const allFormats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])];

      const audioStreams: StreamInfo[] = [];
      const videoStreams: StreamInfo[] = [];

      for (const f of allFormats) {
        const streamUrl = f.url || (f.signatureCipher ? new URLSearchParams(f.signatureCipher).get("url") : (f.cipher ? new URLSearchParams(f.cipher).get("url") : null));
        if (!streamUrl) continue;

        const isAudio = f.mimeType?.includes("audio") || (f.acodec && f.acodec !== "none" && !f.height);
        const isVideo = f.mimeType?.includes("video") || (f.height && f.height > 0);

        if (isAudio && !isVideo) {
          audioStreams.push({
            formatId: String(f.itag),
            url: streamUrl,
            ext: f.mimeType?.includes("webm") ? "webm" : "m4a",
            acodec: f.mimeType,
            abr: Math.round((f.bitrate || 0) / 1000),
            filesize: f.contentLength ? parseInt(f.contentLength, 10) : null,
            formatNote: f.audioQuality || "audio"
          });
        } else if (isVideo) {
          const hasAudio = !!(f.mimeType?.includes("audio") || (f.audioChannels && f.audioChannels > 0));
          videoStreams.push({
            formatId: String(f.itag),
            url: streamUrl,
            ext: f.mimeType?.includes("webm") ? "webm" : "mp4",
            resolution: f.qualityLabel || (f.height ? `${f.height}p` : "video"),
            width: f.width,
            height: f.height || 0,
            fps: f.fps || 30,
            vcodec: f.mimeType,
            acodec: hasAudio ? "audio" : "none",
            hasAudio,
            filesize: f.contentLength ? parseInt(f.contentLength, 10) : null,
            formatNote: f.qualityLabel || null
          });
        }
      }

      videoStreams.sort((a, b) => (b.height || 0) - (a.height || 0));
      audioStreams.sort((a, b) => (b.abr || 0) - (a.abr || 0));

      if (videoStreams.length === 0 && audioStreams.length === 0) return null;

      const thumbs = details.thumbnail?.thumbnails || [];
      const thumbnail = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : undefined;

      return {
        id: videoId,
        title: details.title || "YouTube Video",
        description: details.shortDescription,
        thumbnail,
        duration: parseInt(details.lengthSeconds || "0", 10),
        uploader: details.author,
        webpageUrl: url,
        extractor: "youtube:innertube",
        audioStreams,
        videoStreams
      };
    } catch (_) {
      return null;
    }
  }

  const extractMediaForUrl = async (targetUrl: string, forceRefresh = false) => {
    const trimmed = targetUrl.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)

    if (!forceRefresh) {
      const cached = await getCachedMediaData(trimmed)
      if (cached) {
        setMediaData({ ...cached, isFromCache: true })
        if (cached.videoStreams?.length > 0) setSelectedVideo(cached.videoStreams[0])
        if (cached.audioStreams?.length > 0) setSelectedAudio(cached.audioStreams[0])
        setLoading(false)
        return
      }
    }

    setMediaData(null)

    try {
      let data: MediaData | null = null

      // For YouTube URLs, run Client-Side Innertube extraction first (bypasses cloud IP bot blocks)
      if (trimmed.includes("youtube.com") || trimmed.includes("youtu.be")) {
        console.log("[EdgeDL] Running client-side YouTube extraction...")
        data = await extractClientSideYouTube(trimmed)
      }

      // If client-side failed or not YouTube, try backend server
      if (!data) {
        try {
          const response = await fetch(`${SERVER_URL}/api/extract?url=${encodeURIComponent(trimmed)}`)
          const json = await response.json()
          if (json.success && json.data) {
            data = json.data
          }
        } catch (_) {}
      }

      if (!data) {
        throw new Error("Failed to extract video streams. Please check the URL.")
      }

      setMediaData({ ...data, isFromCache: false })

      if (data.videoStreams?.length > 0) setSelectedVideo(data.videoStreams[0])
      if (data.audioStreams?.length > 0) setSelectedAudio(data.audioStreams[0])

      await setCachedMediaData(trimmed, data)
    } catch (err: any) {
      setError(err.message || "Failed to extract media streams")
    } finally {
      setLoading(false)
    }
  }

  const handleStartWebDownload = () => {
    if (!mediaData || !selectedVideo) return

    const needsSeparateAudio = !selectedVideo.hasAudio && selectedAudio

    const payload = {
      mode: "web",
      videoUrl: selectedVideo.url,
      audioUrl: needsSeparateAudio ? selectedAudio?.url : undefined,
      title: mediaData.title || "video",
      ext: selectedVideo.ext || "mp4"
    }

    chrome.runtime.sendMessage({ type: "START_DOWNLOAD", payload })
  }

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(file)
    })
  }

  const handleStartLocalMux = async () => {
    if (!localVideoFile || !localAudioFile) {
      setError("Please select both a video file and an audio file.")
      return
    }

    setError(null)
    setLocalReading(true)

    try {
      const videoExt = localVideoFile.name.split(".").pop() || "mp4"
      const audioExt = localAudioFile.name.split(".").pop() || "m4a"

      const videoUrl = URL.createObjectURL(localVideoFile)
      const audioUrl = URL.createObjectURL(localAudioFile)

      let args: string[] | undefined
      if (muxPreset === "custom" && customArgs.trim()) {
        args = customArgs.trim().split(/\s+/)
      } else if (muxPreset === "reencode_audio") {
        args = ["-i", `/input_video.${videoExt}`, "-i", `/input_audio.${audioExt}`, "-c:v", "copy", "-c:a", "aac", `/output.${outputFormat}`]
      } else if (muxPreset === "webm") {
        args = ["-i", `/input_video.${videoExt}`, "-i", `/input_audio.${audioExt}`, "-c:v", "libvpx-vp9", "-c:a", "libopus", `/output.${outputFormat}`]
      } else {
        // Default fast stream copy
        args = ["-i", `/input_video.${videoExt}`, "-i", `/input_audio.${audioExt}`, "-c", "copy", "-movflags", "+faststart", `/output.${outputFormat}`]
      }

      const payload = {
        mode: "local",
        videoUrl,
        audioUrl,
        videoExt,
        audioExt,
        outputFormat,
        ffmpegArgs: args,
        filename: localVideoFile.name.substring(0, localVideoFile.name.lastIndexOf(".")) || "muxed_video"
      }

      chrome.runtime.sendMessage({ type: "START_DOWNLOAD", payload })
    } catch (err: any) {
      setError("Failed to process local files: " + err.message)
    } finally {
      setLocalReading(false)
    }
  }

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return ""
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className="w-[440px] p-4 bg-slate-950 text-slate-100 font-sans min-h-[520px] flex flex-col justify-between select-none">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center font-black text-lg text-white shadow-lg shadow-indigo-500/25">
              E
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-wide text-white">EdgeDL</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-semibold">
                  FFmpeg.wasm
                </span>
              </div>
              <p className="text-[11px] text-slate-400">High-Performance Video & Audio Muxer</p>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 font-mono">
            MV3
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/90 border border-slate-800/80 rounded-xl mb-4 text-xs font-medium">
          <button
            onClick={() => setActiveTab("web")}
            className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === "web"
              ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}>
            <span>🌐</span> Web Extractor & Muxer
          </button>
          <button
            onClick={() => setActiveTab("local")}
            className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === "local"
              ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}>
            <span>📁</span> Local File Muxer
          </button>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-300 text-xs mb-3 flex items-start gap-2">
            <span className="text-rose-400 text-base leading-none">⚠️</span>
            <div className="flex-1 min-w-0 break-words">{error}</div>
          </div>
        )}

        {/* Global Download / Mux Status Bar */}
        {(downloadState.isProcessing || downloadState.error) && (
          <div
            className={`p-3.5 border rounded-xl mb-4 space-y-2 ${downloadState.error
              ? "bg-rose-950/40 border-rose-500/30 text-rose-300"
              : "bg-indigo-950/40 border-indigo-500/30 text-indigo-300"
              }`}>
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold flex items-center gap-2 truncate pr-2">
                {!downloadState.error && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                )}
                {downloadState.error ? `Error: ${downloadState.error}` : downloadState.status}
              </span>
              {!downloadState.error && (
                <span className="font-mono font-bold text-indigo-400 text-xs">{downloadState.progress}%</span>
              )}
            </div>
            {!downloadState.error && (
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden p-0.5 border border-slate-800">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-400 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${downloadState.progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 1: WEB EXTRACTOR & MUXER */}
        {activeTab === "web" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste YouTube or video URL..."
                  className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  onClick={async () => {
                    const activeUrl = await fetchActiveTabUrl()
                    if (activeUrl) {
                      setUrl(activeUrl)
                      extractMediaForUrl(activeUrl)
                    } else {
                      setError("Could not detect active video tab URL.")
                    }
                  }}
                  title="Get Active Tab URL"
                  className="px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs flex items-center justify-center gap-1 transition">
                  ⚡ Tab
                </button>
              </div>

              <button
                onClick={() => extractMediaForUrl(url, true)}
                disabled={loading || !url.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Extracting Streams...
                  </>
                ) : (
                  "Analyze Video Streams"
                )}
              </button>
            </div>

            {mediaData && (
              <div className="space-y-3 pt-1">
                <div className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex gap-3">
                    {mediaData.thumbnail && (
                      <img
                        src={mediaData.thumbnail}
                        alt={mediaData.title}
                        className="w-24 h-16 object-cover rounded-lg bg-slate-900 border border-slate-800"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xs font-semibold text-slate-200 line-clamp-2 leading-snug">{mediaData.title}</h3>
                      {mediaData.uploader && (
                        <p className="text-[11px] text-slate-400 mt-1 truncate">{mediaData.uploader}</p>
                      )}
                    </div>
                  </div>

                  {mediaData.isFromCache && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/80 text-[10px]">
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        ⚡ Cached metadata
                      </span>
                      <button
                        onClick={() => extractMediaForUrl(url, true)}
                        className="text-slate-400 hover:text-indigo-400 underline transition">
                        Re-fetch fresh
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Video Stream
                  </label>
                  <select
                    value={selectedVideo?.formatId || ""}
                    onChange={(e) => {
                      const selected = mediaData.videoStreams.find((v) => v.formatId === e.target.value)
                      if (selected) setSelectedVideo(selected)
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                    {mediaData.videoStreams.map((v) => (
                      <option key={v.formatId} value={v.formatId}>
                        {v.resolution || `${v.height}p`} ({v.ext}) {v.fps ? `@ ${v.fps}fps` : ""}{" "}
                        {v.hasAudio ? "• Audio included" : "• Video only"} {formatSize(v.filesize)}
                      </option>
                    ))}
                  </select>

                  {!selectedVideo?.hasAudio && mediaData.audioStreams.length > 0 && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mt-2 mb-1">
                        Audio Track for Merge
                      </label>
                      <select
                        value={selectedAudio?.formatId || ""}
                        onChange={(e) => {
                          const selected = mediaData.audioStreams.find((a) => a.formatId === e.target.value)
                          if (selected) setSelectedAudio(selected)
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                        {mediaData.audioStreams.map((a) => (
                          <option key={a.formatId} value={a.formatId}>
                            Audio ({a.ext}) {a.abr ? `• ${a.abr}kbps` : ""} {formatSize(a.filesize)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleStartWebDownload}
                  disabled={downloadState.isProcessing}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download & Mux (Client-Side WASM)
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LOCAL FILE MUXER */}
        {activeTab === "local" && (
          <div className="space-y-3">
            {/* Video File Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                1. Video File (MP4, WebM, MKV, AVI)
              </label>
              <div className="relative border border-dashed border-slate-800 rounded-xl p-3 bg-slate-900/60 hover:border-indigo-500/50 transition">
                <input
                  type="file"
                  accept="video/*,.mkv,.avi"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setLocalVideoFile(e.target.files[0])
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                {localVideoFile ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400 truncate flex items-center gap-2">
                      🎬 {localVideoFile.name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono ml-2">
                      {(localVideoFile.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                ) : (
                  <div className="text-center py-1 text-xs text-slate-400">
                    <span className="text-indigo-400 font-medium">Click or Drag Video File here</span>
                  </div>
                )}
              </div>
            </div>

            {/* Audio File Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                2. Audio File (MP3, AAC, M4A, WAV, OPUS)
              </label>
              <div className="relative border border-dashed border-slate-800 rounded-xl p-3 bg-slate-900/60 hover:border-indigo-500/50 transition">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setLocalAudioFile(e.target.files[0])
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                {localAudioFile ? (
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-400 truncate flex items-center gap-2">
                      🎵 {localAudioFile.name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono ml-2">
                      {(localAudioFile.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                ) : (
                  <div className="text-center py-1 text-xs text-slate-400">
                    <span className="text-indigo-400 font-medium">Click or Drag Audio File here</span>
                  </div>
                )}
              </div>
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Container Format
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                  <option value="mp4">MP4 (.mp4)</option>
                  <option value="webm">WebM (.webm)</option>
                  <option value="mkv">MKV (.mkv)</option>
                  <option value="gif">Animated GIF (.gif)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  FFmpeg Preset
                </label>
                <select
                  value={muxPreset}
                  onChange={(e) => setMuxPreset(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500">
                  <option value="copy">Fast Mux (-c copy)</option>
                  <option value="reencode_audio">Re-encode Audio (AAC)</option>
                  <option value="webm">VP9 + Opus (WebM)</option>
                  <option value="custom">Custom Arguments</option>
                </select>
              </div>
            </div>

            {muxPreset === "custom" && (
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Custom FFmpeg Arguments
                </label>
                <input
                  type="text"
                  value={customArgs}
                  onChange={(e) => setCustomArgs(e.target.value)}
                  placeholder="-i input_video.mp4 -i input_audio.m4a -c copy output.mp4"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            )}

            <button
              onClick={handleStartLocalMux}
              disabled={downloadState.isProcessing || localReading || !localVideoFile || !localAudioFile}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 mt-2">
              {localReading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Reading Files into Memory...
                </>
              ) : (
                <>⚡ Mux Video & Audio (FFmpeg WASM)</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-slate-900 text-center text-[10px] text-slate-500 flex items-center justify-between">
        <span>FFmpeg.wasm 0.12 • WXT + React</span>
        <span>Client-Side Zero Server Mux</span>
      </div>
    </div>
  )
}

export default App
