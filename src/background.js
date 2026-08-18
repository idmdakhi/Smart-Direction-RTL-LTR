/**
 * Smart Direction — service worker (v2.3)
 * - تنظیم پیش‌فرض هنگام نصب
 * - به‌روزرسانی بَج آیکون
 * - میانبر Alt+Shift+D برای چرخش حالت + toast
 */

const DEFAULT_SETTINGS = {
  mode: "auto",
  threshold: 0.4,
  minStrongChars: 3,
};

const MODES = ["auto", "ltr", "rtl", "browser", "off"];

const BADGE_TEXT = {
  auto: "A",
  ltr: "L",
  rtl: "R",
  browser: "B",
  off: "",
};

const BADGE_COLOR = {
  auto: "#2F7D6E",
  ltr: "#3B6CB4",
  rtl: "#B4553B",
  browser: "#7A5C9E",
  off: "#8A8A8A",
};

chrome.runtime.onInstalled.addListener(async (details) => {
  const { smartDirectionDefaults } = await chrome.storage.sync.get(
    "smartDirectionDefaults",
  );
  if (!smartDirectionDefaults) {
    await chrome.storage.sync.set({ smartDirectionDefaults: DEFAULT_SETTINGS });
  }
  if (details.reason === "install" || details.reason === "update") {
    try {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id && tab.url) updateBadge(tab.id, tab.url);
      }
    } catch {}
  }
});

async function effectiveModeForHost(host) {
  const [{ smartDirectionDefaults }, { smartDirectionHosts }] =
    await Promise.all([
      chrome.storage.sync.get("smartDirectionDefaults"),
      chrome.storage.local.get("smartDirectionHosts"),
    ]);
  const globalDefaults = {
    ...DEFAULT_SETTINGS,
    ...(smartDirectionDefaults || {}),
  };
  const hosts = smartDirectionHosts || {};
  const override = hosts[host];
  return (override && override.mode) || globalDefaults.mode;
}

async function updateBadge(tabId, url) {
  try {
    if (
      !url ||
      /^(chrome|chrome-extension|about|edge|brave|devtools):/i.test(url)
    ) {
      await chrome.action.setBadgeText({ tabId, text: "" });
      return;
    }
    const host = new URL(url).hostname;
    const mode = await effectiveModeForHost(host);
    await chrome.action.setBadgeText({ tabId, text: BADGE_TEXT[mode] ?? "A" });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: BADGE_COLOR[mode] ?? BADGE_COLOR.auto,
    });
  } catch {
    try {
      await chrome.action.setBadgeText({ tabId, text: "" });
    } catch {}
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) updateBadge(tabId, tab.url);
  } catch {}
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync" && area !== "local") return;
  if (!changes.smartDirectionDefaults && !changes.smartDirectionHosts) return;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url) updateBadge(tab.id, tab.url);
    }
  } catch {}
});

async function cycleModeForTab(tab) {
  if (!tab?.id || !tab.url) return;
  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch {
    return;
  }
  if (!host) return;

  const [{ smartDirectionDefaults }, { smartDirectionHosts }] =
    await Promise.all([
      chrome.storage.sync.get("smartDirectionDefaults"),
      chrome.storage.local.get("smartDirectionHosts"),
    ]);
  const globalDefaults = {
    ...DEFAULT_SETTINGS,
    ...(smartDirectionDefaults || {}),
  };
  const hosts = smartDirectionHosts || {};
  const current = (hosts[host] && hosts[host].mode) || globalDefaults.mode;
  const idx = MODES.indexOf(current);
  const next = MODES[(idx === -1 ? 0 : idx + 1) % MODES.length];

  hosts[host] = { ...(hosts[host] || {}), mode: next };
  await chrome.storage.local.set({ smartDirectionHosts: hosts });

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "smart-direction:apply-now",
      showToast: true,
      mode: next,
    });
  } catch {}
  await updateBadge(tab.id, tab.url);
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "cycle-direction-mode") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await cycleModeForTab(tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "smart-direction:refresh-badge") {
    if (sender.tab?.id && sender.tab?.url) {
      updateBadge(sender.tab.id, sender.tab.url);
    }
    return;
  }
  if (message?.type === "smart-direction:get-defaults") {
    chrome.storage.sync.get("smartDirectionDefaults").then((res) => {
      sendResponse(res.smartDirectionDefaults || DEFAULT_SETTINGS);
    });
    return true;
  }
  if (message?.type === "smart-direction:cycle-mode" && sender.tab) {
    cycleModeForTab(sender.tab).then(() => sendResponse({ ok: true }));
    return true;
  }
});
