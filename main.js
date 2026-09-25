import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, shell, Notification } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeServerPort = 5000;

let serverModuleRef = null;

// Dynamically import ES Module server cleanly
import("./server/server.js").then((serverModule) => {
  serverModuleRef = serverModule;
  if (serverModule && typeof serverModule.getActivePort === "function") {
    activeServerPort = serverModule.getActivePort();
  }
}).catch((err) => {
  console.error("[EdgeDL Server Start Error]:", err);
});

ipcMain.handle("get-server-port", () => {
  if (serverModuleRef && typeof serverModuleRef.getActivePort === "function") {
    return serverModuleRef.getActivePort();
  }
  return activeServerPort || 5000;
});

let mainWindow = null;
let tray = null;
let isQuitting = false;
let notificationShown = false;

function showTrayNotification() {
  if (!notificationShown && tray) {
    notificationShown = true;
    try {
      if (process.platform === "win32" && typeof tray.displayBalloon === "function") {
        tray.displayBalloon({
          title: "EdgeDL Standalone",
          content: "EdgeDL is running in the background. Click or double-click the tray icon to restore."
        });
      }
    } catch (_) {}
  }
}

function createWindow() {
  const iconPath = path.join(__dirname, "icon.png");

  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 580,
    icon: iconPath,
    resizable: true,
    autoHideMenuBar: true,
    title: "EdgeDL Standalone - High-Speed Video & Audio Downloader",
    frame: false,
    transparent: true,
    backgroundMaterial: "acrylic",
    vibrancy: "content",
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const distPath = path.join(__dirname, "dist", "index.html");
  const uiPath = path.join(__dirname, "ui", "index.html");

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (fs.existsSync(distPath)) {
    mainWindow.loadFile(distPath);
  } else {
    mainWindow.loadFile(uiPath);
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Minimize to tray on close
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showTrayNotification();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show EdgeDL Standalone",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: "Status: Native Engine Active",
      enabled: false
    },
    { type: "separator" },
    {
      label: "Quit EdgeDL",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip("EdgeDL Standalone (Active in background)");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Window control IPCs
ipcMain.on("window-minimize", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on("window-maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// Close to tray IPC handler
ipcMain.on("window-close", () => {
  if (mainWindow) {
    mainWindow.hide();
    showTrayNotification();
  }
});

// Download Completed Native Toast Notification IPC
ipcMain.on("notify-completed", (_event, { title, filePath }) => {
  try {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: "Download Complete! 🎉",
        body: title || "Your file has been downloaded successfully.",
        icon: path.join(__dirname, "icon.png")
      });
      notif.on("click", () => {
        if (filePath && fs.existsSync(filePath)) {
          shell.showItemInFolder(filePath);
        } else if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
      notif.show();
    }
  } catch (e) {
    console.warn("[IPC notify-completed error]:", e);
  }
});

// File / Directory Dialog IPCs
ipcMain.handle("select-download-dir", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle("select-cookie-file", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Cookie Files (*.txt)", extensions: ["txt"] }, { name: "All Files", extensions: ["*"] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle("get-default-downloads-dir", () => {
  return path.join(app.getPath("downloads"), "EdgeDL");
});

ipcMain.on("open-file", (_event, rawPath) => {
  if (!rawPath) return;
  try {
    const normPath = path.normalize(rawPath);
    if (fs.existsSync(normPath)) {
      shell.openPath(normPath);
    }
  } catch (e) {
    console.warn("[IPC open-file error]:", e);
  }
});

ipcMain.on("show-in-folder", (_event, rawPath) => {
  if (!rawPath) return;
  try {
    const normPath = path.normalize(rawPath);
    if (fs.existsSync(normPath)) {
      const stat = fs.statSync(normPath);
      if (stat.isDirectory()) {
        shell.openPath(normPath);
      } else {
        shell.showItemInFolder(normPath);
      }
    } else {
      const parentDir = path.dirname(normPath);
      if (fs.existsSync(parentDir)) {
        shell.openPath(parentDir);
      }
    }
  } catch (e) {
    console.warn("[IPC show-in-folder error]:", e);
  }
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
