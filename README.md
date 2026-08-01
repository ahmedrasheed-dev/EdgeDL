# EdgeDL

🌐 **Website**: [https://ahmedrasheed-dev.github.io/EdgeDL/](https://ahmedrasheed-dev.github.io/EdgeDL/)

High-performance video downloader and media merger for Chrome and Windows.

EdgeDL consists of two parts:
1. **EdgeDL Chrome Extension** — A clean browser popup interface to detect, select, and download online videos, or merge local video and audio files directly in your browser.
2. **EdgeDL Companion App** — A lightweight Windows background app powered by `yt-dlp` that handles stream extraction for high-resolution videos (4K, 2K, 1080p).

---

## Features

- **High Resolution Downloads**: Extract 4K, 2K, 1080p, and 60fps video streams from YouTube and other video platforms.
- **One-Click Tab Detection**: Grab video URLs directly from your active browser tab.
- **Local File Merger**: Combine separate video and audio tracks into MP4, WebM, MKV, or GIF formats.
- **Client-Side Processing**: Media muxing and stream downloading happen locally on your PC via client-side WebAssembly — zero data sent to external servers.
- **Standalone Desktop Companion**: Bundled installer with everything pre-configured.

---

## Installation

### Option 1: Quick Install (Recommended)

1. Download the latest release files from **[Releases](https://github.com/ahmedrasheed-dev/EdgeDL/releases)**:
   - **`EdgeDL Companion Setup 1.0.0.exe`** (Desktop Companion App)
   - **`edge-dl-extension.zip`** (Chrome Extension)
2. Run **`EdgeDL Companion Setup 1.0.0.exe`** to install the Windows companion app.
3. Extract **`edge-dl-extension.zip`** to a folder on your PC.
4. Load the Extension in Google Chrome:
   - Go to `chrome://extensions` in your browser.
   - Enable **Developer mode** (toggle switch in the top right corner).
   - Click **Load unpacked** and select the extracted extension folder.

---

### Option 2: Build from Source

#### Prerequisites
- Node.js (v18 or higher)
- npm

#### 1. Build the Chrome Extension
```bash
cd edge-dl-ext
npm install
npm run build
```
The compiled extension will be generated in `edge-dl-ext/.output/chrome-mv3`.

#### 2. Build the Desktop Companion App
```bash
cd desktop-app
npm install
npm run build
```
The installer executable will be created in `desktop-app/release/`.

---

## How to Use

### Downloading Web Videos
1. Open any video page in your browser.
2. Click the **EdgeDL** extension icon in your toolbar.
3. Click **⚡ Current Tab** (or paste a video URL manually) and select **Fetch Video Options**.
4. Choose your preferred video resolution and audio track, then click **Download Video**.

### Merging Local Files
1. Open the EdgeDL extension popup and switch to the **🎬 Merge Files** tab.
2. Select your video file (MP4, WebM, MKV, AVI) and audio file (MP3, AAC, M4A, WAV).
3. Select your desired output format and speed preset.
4. Click **⚡ Merge Video & Audio** to save the merged output.

---

## Project Structure

```text
EdgeDL-Extension/
├── desktop-app/       # Electron companion desktop app (yt-dlp backend engine)
└── edge-dl-ext/       # WXT + React Manifest V3 browser extension
```

---

## Author

Developed by **[@ahmedrasheed-dev](https://github.com/ahmedrasheed-dev)**

---

## License

This project is licensed under the ISC License.
