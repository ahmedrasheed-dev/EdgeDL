export default defineBackground(() => {
  console.log("EdgeDL Background Worker initialized", { id: browser.runtime.id });

  let currentStatus = {
    isProcessing: false,
    status: "",
    progress: 0,
    error: null as string | null,
    mode: "idle"
  };

  let pendingPayload: any = null;
  let isOffscreenReady = false;

  const RULE_ID = 1001;

  async function setupNetRequestRules() {
    if (!chrome?.declarativeNetRequest?.updateDynamicRules) return;

    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [
          {
            id: RULE_ID,
            priority: 1,
            action: {
              type: "modifyHeaders" as any,
              requestHeaders: [
                {
                  header: "origin",
                  operation: "remove" as any
                },
                {
                  header: "referer",
                  operation: "set" as any,
                  value: "https://www.youtube.com/"
                },
                {
                  header: "user-agent",
                  operation: "set" as any,
                  value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                }
              ]
            },
            condition: {
              urlFilter: "googlevideo.com",
              resourceTypes: [
                "xmlhttprequest" as any,
                "other" as any,
                "media" as any
              ]
            }
          }
        ]
      });
      console.log("DeclarativeNetRequest rules active for CDN fetches");
    } catch (err) {
      console.warn("declarativeNetRequest setup warning:", err);
    }
  }

  setupNetRequestRules();

  function broadcastStatus() {
    chrome.runtime.sendMessage({
      type: "STATE_BROADCAST",
      state: currentStatus
    }).catch(() => {});
  }

  async function ensureOffscreenDocument() {
    if (!chrome.offscreen || typeof chrome.offscreen.createDocument !== "function") {
      throw new Error("chrome.offscreen API is unavailable. Reload the extension in chrome://extensions.");
    }

    try {
      if (chrome.runtime.getContexts) {
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT" as any]
        });
        if (existingContexts.length > 0) {
          return;
        }
      }
    } catch (err) {
      console.log("getContexts check:", err);
    }

    isOffscreenReady = false;
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [
        chrome.offscreen.Reason.AUDIO_PLAYBACK,
        chrome.offscreen.Reason.DOM_PARSER
      ],
      justification: "Client-side video and audio muxing with FFmpeg WASM"
    });
  }

  async function closeOffscreenDocument() {
    try {
      if (chrome.offscreen && typeof chrome.offscreen.closeDocument === "function") {
        await chrome.offscreen.closeDocument();
      }
    } catch (err) {
      console.log("Offscreen close note:", err);
    }
  }

  function sendStartToOffscreen() {
    if (pendingPayload) {
      const payloadToSend = pendingPayload;
      pendingPayload = null;
      chrome.runtime.sendMessage({
        type: "START_PROCESSING",
        payload: payloadToSend
      }).catch((err) => console.log("Error sending START_PROCESSING to offscreen:", err));
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_STATUS") {
      sendResponse(currentStatus);
      return false;
    }

    if (message.type === "OFFSCREEN_READY") {
      isOffscreenReady = true;
      if (pendingPayload) {
        sendStartToOffscreen();
      }
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "START_DOWNLOAD") {
      pendingPayload = message.payload;
      currentStatus = {
        isProcessing: true,
        status: "Initializing FFmpeg WASM engine...",
        progress: 5,
        error: null,
        mode: message.payload?.mode || "web"
      };
      broadcastStatus();

      ensureOffscreenDocument()
        .then(() => {
          sendStartToOffscreen();
        })
        .catch((err) => {
          currentStatus.isProcessing = false;
          currentStatus.error = err.message || "Failed to launch offscreen process";
          currentStatus.status = "Worker launch failed";
          broadcastStatus();
        });

      sendResponse({ success: true });
      return false;
    }

    if (message.type === "STATUS_UPDATE") {
      currentStatus.status = message.status;
      currentStatus.progress = message.progress;
      if (message.error) {
        currentStatus.error = message.error;
        currentStatus.isProcessing = false;
      }
      broadcastStatus();
      return false;
    }

    if (message.type === "DOWNLOAD_READY") {
      currentStatus.isProcessing = false;
      currentStatus.status = "Muxing complete! Saving file...";
      currentStatus.progress = 100;
      pendingPayload = null;
      broadcastStatus();

      if (message.blobUrl) {
        chrome.downloads.download(
          {
            url: message.blobUrl,
            filename: message.filename || "output.mp4",
            saveAs: true
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.error("Chrome download error:", chrome.runtime.lastError.message);
              closeOffscreenDocument();
              return;
            }

            console.log("Download started with ID:", downloadId);

            const onDownloadChanged = (delta: chrome.downloads.DownloadDelta) => {
              if (delta.id === downloadId && delta.state) {
                if (delta.state.current === "complete" || delta.state.current === "interrupted") {
                  chrome.downloads.onChanged.removeListener(onDownloadChanged);
                  console.log(`Download ${downloadId} state: ${delta.state.current}. Closing offscreen.`);
                  setTimeout(() => closeOffscreenDocument(), 2000);
                }
              }
            };
            chrome.downloads.onChanged.addListener(onDownloadChanged);
          }
        );
      }
      return false;
    }

    if (message.type === "PROCESS_ERROR") {
      currentStatus.isProcessing = false;
      currentStatus.error = message.error;
      currentStatus.status = "Error: " + message.error;
      pendingPayload = null;
      broadcastStatus();
      setTimeout(() => closeOffscreenDocument(), 4000);
      return false;
    }
  });
});
