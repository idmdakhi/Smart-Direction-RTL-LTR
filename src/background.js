/**
 * Smart Direction — Service Worker
 * مدیریت بَدج، همگام‌سازی تنظیمات، و ارتباط بین اجزا
 */

import { DEFAULT_SETTINGS, BADGE_TEXT, BADGE_COLOR } from "./config.js";
import {
  safeStorageGet,
  safeStorageSet,
  isValidHost,
  log,
  logError,
} from "./utils.js";

// ============ مقداردهی اولیه ============

chrome.runtime.onInstalled.addListener(async () => {
  const { smartDirectionDefaults } = await safeStorageGet(
    "sync",
    "smartDirectionDefaults",
  );
  if (!smartDirectionDefaults) {
    await safeStorageSet("sync", { smartDirectionDefaults: DEFAULT_SETTINGS });
  }
  log("Service worker installed with defaults:", DEFAULT_SETTINGS);
});

// ============ دریافت حالت مؤثر برای یک میزبان ============

async function effectiveModeForHost(host) {
  if (!isValidHost(host)) return DEFAULT_SETTINGS.mode;

  const [defaultsResult, hostsResult] = await Promise.all([
    safeStorageGet("sync", "smartDirectionDefaults"),
    safeStorageGet("local", "smartDirectionHosts"),
  ]);

  const globalDefaults = {
    ...DEFAULT_SETTINGS,
    ...(defaultsResult.smartDirectionDefaults || {}),
  };
  const hosts = hostsResult.smartDirectionHosts || {};
  const override = hosts[host];
  return (override && override.mode) || globalDefaults.mode;
}

// ============ به‌روزرسانی بَدج ============

async function updateBadge(tabId, url) {
  try {
    if (!url) throw new Error("No URL");
    const host = new URL(url).hostname;
    if (!isValidHost(host)) throw new Error("Invalid host");

    const mode = await effectiveModeForHost(host);
    await chrome.action.setBadgeText({ tabId, text: BADGE_TEXT[mode] ?? "A" });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: BADGE_COLOR[mode] ?? BADGE_COLOR.auto,
    });
    log(`Badge updated for ${host} → ${mode}`);
  } catch (error) {
    // صفحات داخلی یا نامعتبر — بَدج را پاک کن
    await chrome.action.setBadgeText({ tabId, text: "" });
    logError("Badge update failed:", error.message);
  }
}

// ============ رویدادهای تب ============

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    updateBadge(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) updateBadge(tabId, tab.url);
  } catch (error) {
    logError("Tab activation error:", error);
  }
});

// ============ پیام‌ها ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // درخواست به‌روزرسانی بَدج
  if (message?.type === "smart-direction:refresh-badge" && sender.tab?.id) {
    updateBadge(sender.tab.id, sender.tab.url);
    sendResponse({ ok: true });
    return true;
  }

  // دریافت تنظیمات پیش‌فرض
  if (message?.type === "smart-direction:get-defaults") {
    safeStorageGet("sync", "smartDirectionDefaults").then((res) => {
      sendResponse(res.smartDirectionDefaults || DEFAULT_SETTINGS);
    });
    return true;
  }

  // همگام‌سازی تغییرات تنظیمات با تمام تب‌ها
  if (message?.type === "smart-direction:settings-changed") {
    chrome.tabs.query({ url: "<all_urls>" }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith("chrome://")) {
          chrome.tabs
            .sendMessage(tab.id, { type: "smart-direction:reload-settings" })
            .catch(() => {});
        }
      }
    });
    sendResponse({ ok: true });
    return true;
  }
});

// ============ گوش‌دادن به تغییرات storage ============

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" || area === "local") {
    // تمام تب‌ها را از تغییر مطلع کن
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id && tab.url && !tab.url.startsWith("chrome://")) {
          chrome.tabs
            .sendMessage(tab.id, { type: "smart-direction:reload-settings" })
            .catch(() => {});
        }
      }
    });
    log("Storage changed, notifying all tabs");
  }
});
