# EdgeDL — Standalone Desktop Downloader

🌐 **Website**: [https://ahmedrasheed-dev.github.io/EdgeDL/](https://ahmedrasheed-dev.github.io/EdgeDL/)

High-performance, standalone desktop video & audio downloader and media engine for Windows.

**EdgeDL** is a 100% native desktop application built with **Electron**, **Node.js**, **yt-dlp (Nightly Build Channel)**, and **FFmpeg**. It operates completely independently as a standalone desktop application.

---

## ⚡ Features

- **100% Standalone Desktop Application**: Full native UI with modern theme selector, real-time download progress, system tray integration, and desktop notifications. No browser extensions required.
- **YouTube Anti-Bot & SABR Bypass Engine**: Solves YouTube EJS challenges using Node.js (`--js-runtimes node`) and optimized player client fallbacks (`web_embedded`, `android`) to bypass HTTP 403 / 429 sign-in prompts.
- **Smart Audio Language Selection**: Automatically prioritizes English and original native audio tracks (`--format-sort "lang:en,quality,res,fps"`), preventing unwanted foreign language dubs.
- **Deduplicated Quality Options**: Single clean resolution selection dropdowns (1080p, 720p, 480p, 360p, 2K, 4K, 8K) with automatic `bestaudio` pairing.
- **Browser Cookies Integration**: Live cookie extraction from Chrome, Edge, Firefox, Brave, Opera, Vivaldi, or custom `cookies.txt` to download 1080p+, age-restricted, and private media.
- **yt-dlp Nightly Auto-Updates**: Streams the latest `yt-dlp` nightly builds directly from GitHub CDN with automatic health checks.
- **Playlist & Batch Downloader**: Extract full YouTube playlists and channels, search videos, select custom subsets (All, Top 5, Top 10), and auto-create playlist subfolders.
- **Video Trimmer & Clip Extractor**: Trim specific video timestamps directly without re-encoding.
- **Subtitles & Cover Image Saver**: Extract subtitles (.srt or embedded) and HD video thumbnails.

---

## 🛠️ Quick Start

```bash
npm install
npm run dev
```

### Build Windows Executables (Installer & Portable)

```bash
# Build setup installer (.exe)
npm run build

# Build portable executable (.exe)
npm run build:portable

# Build both installer and portable
npm run build:all
```

---

## 🏛️ Project Architecture

```text
desktop-standalone/
├── main.js                 # Electron main process & IPC window controls
├── server/
│   ├── server.js           # Express API server, extractor engine & settings
│   └── downloadManager.js  # Real-time yt-dlp spawn, format parser & disk monitor
└── ui/
    ├── index.html          # Clean responsive app layout
    ├── app.js              # Frontend UI logic & polling controller
    └── style.css           # Glassmorphism design system & theme CSS
```

---

## 👤 Author

Developed by **[@ahmedrasheed-dev](https://github.com/ahmedrasheed-dev)**

---

## 📄 License

This project is licensed under the ISC License.
