export default defineContentScript({
  matches: ["*://*.youtube.com/*", "*://youtube.com/*"],
  main() {
    console.log("EdgeDL Content Script active on YouTube");

    function getYouTubePlayerData() {
      try {
        // Try reading window.ytInitialPlayerResponse injected into DOM
        const scripts = document.querySelectorAll("script");
        for (const s of Array.from(scripts)) {
          if (s.textContent && s.textContent.includes("ytInitialPlayerResponse =")) {
            const match = s.textContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
            if (match) {
              return JSON.parse(match[1]);
            }
          }
        }
      } catch (e) {
        console.warn("EdgeDL content script player response parse error:", e);
      }
      return null;
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === "GET_PAGE_MEDIA") {
        const playerData = getYouTubePlayerData();
        sendResponse({ success: !!playerData, data: playerData });
        return true;
      }
    });
  }
});
