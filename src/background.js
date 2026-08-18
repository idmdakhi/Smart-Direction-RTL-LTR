/**
 * Smart Direction — service worker
 * ---------------------------------------------------------------
 * فقط دو کار می‌کند:
 *   ۱) موقع نصب، تنظیمات پیش‌فرض را می‌سازد.
 *   ۲) بَج آیکون را طبق حالت فعال روی تب جاری به‌روز نگه می‌دارد
 *      (A = خودکار، L = همیشه LTR، R = همیشه RTL، خالی = خاموش).
 */

const DEFAULT_SETTINGS = { mode: "auto", threshold: 0.4, minStrongChars: 3 };

const BADGE_TEXT = { auto: "A", ltr: "L", rtl: "R", off: "" };
const BADGE_COLOR = {
  auto: "#2F7D6E",
  ltr: "#3B6CB4",
  rtl: "#B4553B",
  off: "#8A8A8A",
};

chrome.runtime.onInstalled.addListener(async () => {
  const { smartDirectionDefaults } = await chrome.storage.sync.get("smartDirectionDefaults");
  if (!smartDirectionDefaults) {
    await chrome.storage.sync.set({ smartDirectionDefaults: DEFAULT_SETTINGS });
  }
});

async function effectiveModeForHost(host) {
  const [{ smartDirectionDefaults }, { smartDirectionHosts }] = await Promise.all([
    chrome.storage.sync.get("smartDirectionDefaults"),
    chrome.storage.local.get("smartDirectionHosts"),
  ]);
  const globalDefaults = { ...DEFAULT_SETTINGS, ...(smartDirectionDefaults || {}) };
  const hosts = smartDirectionHosts || {};
  const override = hosts[host];
  return (override && override.mode) || globalDefaults.mode;
}

async function updateBadge(tabId, url) {
  try {
    const host = new URL(url).hostname;
    const mode = await effectiveModeForHost(host);
    await chrome.action.setBadgeText({ tabId, text: BADGE_TEXT[mode] ?? "A" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR[mode] ?? BADGE_COLOR.auto });
  } catch {
    // صفحات chrome:// یا حالت‌های بدون URL معتبر — نادیده بگیر
    await chrome.action.setBadgeText({ tabId, text: "" });
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) updateBadge(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url) updateBadge(tabId, tab.url);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "smart-direction:refresh-badge" && sender.tab?.id) {
    updateBadge(sender.tab.id, sender.tab.url);
  }
  if (message?.type === "smart-direction:get-defaults") {
    chrome.storage.sync.get("smartDirectionDefaults").then((res) => {
      sendResponse(res.smartDirectionDefaults || DEFAULT_SETTINGS);
    });
    return true;
  }
});
