/**
 * Smart Direction — Service Worker
 * مدیریت بَدج، همگام‌سازی تنظیمات، آمار، لیست‌های سفید/سیاه و تشخیص زبان
 */

const DEFAULT_SETTINGS = {
  mode: "auto",
  threshold: 0.4,
  minStrongChars: 3,
  autoDetectLanguage: true, // 🎯 جدید: تشخیص خودکار زبان
};

const BADGE_TEXT = {
  auto: "A",
  ltr: "L",
  rtl: "R",
  off: "",
};

const BADGE_COLOR = {
  auto: "#2F7D6E",
  ltr: "#3B6CB4",
  rtl: "#B4553B",
  off: "#8A8A8A",
};

// ============ ذخیره‌سازی امن ============
async function safeStorageGet(area, keys) {
  try {
    return await chrome.storage[area].get(keys);
  } catch {
    return {};
  }
}

async function safeStorageSet(area, items) {
  try {
    await chrome.storage[area].set(items);
    return true;
  } catch {
    return false;
  }
}

function isValidHost(host) {
  if (!host || typeof host !== "string") return false;
  return /^[a-zA-Z0-9.\-_]+$/.test(host);
}

const DEBUG = false;
function log(...args) {
  if (DEBUG) console.log("[SmartDirection]", ...args);
}
function logError(...args) {
  console.error("[SmartDirection]", ...args);
}

// ============ مقداردهی اولیه ============
chrome.runtime.onInstalled.addListener(async () => {
  const { smartDirectionDefaults } = await safeStorageGet(
    "sync",
    "smartDirectionDefaults",
  );
  if (!smartDirectionDefaults) {
    await safeStorageSet("sync", { smartDirectionDefaults: DEFAULT_SETTINGS });
  }
  // مقداردهی اولیه برای آمار
  const { smartDirectionStats } = await safeStorageGet(
    "local",
    "smartDirectionStats",
  );
  if (!smartDirectionStats) {
    await safeStorageSet("local", {
      smartDirectionStats: {
        totalSites: 0,
        totalBlocks: 0,
        modeChanges: {},
        lastUsed: null,
        sites: {},
      },
    });
  }
  log("Service worker installed with defaults:", DEFAULT_SETTINGS);
});

// ============ دریافت حالت مؤثر ============
async function effectiveSettingsForHost(host) {
  if (!isValidHost(host)) return { ...DEFAULT_SETTINGS };

  const [defaultsResult, hostsResult, whitelistResult, blacklistResult] =
    await Promise.all([
      safeStorageGet("sync", "smartDirectionDefaults"),
      safeStorageGet("local", "smartDirectionHosts"),
      safeStorageGet("local", "smartDirectionWhitelist"),
      safeStorageGet("local", "smartDirectionBlacklist"),
    ]);

  const globalDefaults = {
    ...DEFAULT_SETTINGS,
    ...(defaultsResult.smartDirectionDefaults || {}),
  };
  const hosts = hostsResult.smartDirectionHosts || {};
  const override = hosts[host];

  // 📋 بررسی لیست‌های سفید/سیاه
  const whitelist = whitelistResult.smartDirectionWhitelist || [];
  const blacklist = blacklistResult.smartDirectionBlacklist || [];

  let settings = { ...globalDefaults, ...(override || {}) };

  // اگر در لیست سیاه باشد، حالت را خاموش کن
  if (blacklist.includes(host)) {
    settings.mode = "off";
    return settings;
  }

  // اگر لیست سفید غیرخالی است و میزبان در آن نیست، خاموش کن
  if (whitelist.length > 0 && !whitelist.includes(host)) {
    settings.mode = "off";
  }

  // 🎯 تشخیص خودکار زبان (فقط اگر فعال باشد و override وجود نداشته باشد)
  if (settings.autoDetectLanguage && !override) {
    // زبان در content.js تشخیص داده می‌شود و از طریق پیام ارسال می‌شود
    // در اینجا فقط تنظیمات را برمی‌گردانیم
  }

  return settings;
}

async function effectiveModeForHost(host) {
  const settings = await effectiveSettingsForHost(host);
  return settings.mode;
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
  } catch {
    await chrome.action.setBadgeText({ tabId, text: "" });
  }
}

// ============ 📊 آمار ============
async function updateStats(host, mode, blockCount = 0) {
  try {
    const { smartDirectionStats } = await safeStorageGet(
      "local",
      "smartDirectionStats",
    );
    const stats = smartDirectionStats || {
      totalSites: 0,
      totalBlocks: 0,
      modeChanges: {},
      sites: {},
    };

    // به‌روزرسانی سایت
    if (!stats.sites[host]) {
      stats.sites[host] = { visits: 0, modes: {} };
      stats.totalSites++;
    }
    stats.sites[host].visits++;

    // به‌روزرسانی حالت‌ها
    if (!stats.modeChanges[mode]) stats.modeChanges[mode] = 0;
    stats.modeChanges[mode]++;

    if (!stats.sites[host].modes[mode]) stats.sites[host].modes[mode] = 0;
    stats.sites[host].modes[mode]++;

    stats.totalBlocks += blockCount;
    stats.lastUsed = Date.now();

    await safeStorageSet("local", { smartDirectionStats: stats });
  } catch {
    // خطا را نادیده بگیر
  }
}

// ============ کلیک روی آیکون (چرخش حالت) ============
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || tab.url.startsWith("chrome://")) return;

  try {
    const host = new URL(tab.url).hostname;
    if (!isValidHost(host)) return;

    const currentMode = await effectiveModeForHost(host);
    const modes = ["auto", "ltr", "rtl", "off"];
    let nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
    const nextMode = modes[nextIndex];

    const hostsResult = await safeStorageGet("local", "smartDirectionHosts");
    const hosts = hostsResult.smartDirectionHosts || {};
    hosts[host] = { mode: nextMode };
    await safeStorageSet("local", { smartDirectionHosts: hosts });

    await chrome.tabs.sendMessage(tab.id, {
      type: "smart-direction:apply-now",
    });
    updateBadge(tab.id, tab.url);

    // 📊 آمار
    await updateStats(host, nextMode);

    // 🔔 اعلان
    const modeNames = {
      auto: chrome.i18n.getMessage("modeAuto") || "Auto",
      ltr: chrome.i18n.getMessage("modeLtr") || "LTR",
      rtl: chrome.i18n.getMessage("modeRtl") || "RTL",
      off: chrome.i18n.getMessage("modeOff") || "Off",
    };
    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: showToast,
        args: [`🔄 ${modeNames[nextMode] || nextMode}`, "info"],
      })
      .catch(() => {});
  } catch (error) {
    logError("Action click error:", error);
  }
});

// 🔔 تابع اعلان (برای تزریق)
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  const colors = {
    success: "#2F7D6E",
    error: "#B4553B",
    info: "#3B6CB4",
    warning: "#F0B400",
  };
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: ${colors[type] || colors.info}; color: #fff;
    padding: 10px 20px; border-radius: 10px; font-size: 14px;
    z-index: 99999; font-family: system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: fadeInUp 0.3s ease;
    direction: ltr;
  `;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateX(-50%) translateY(10px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s";
    setTimeout(() => {
      toast.remove();
      style.remove();
    }, 300);
  }, 2000);
}

// ============ میانبرهای صفحه‌کلید ============
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || tab.url.startsWith("chrome://")) return;

  const modeMap = {
    "set-auto": "auto",
    "set-ltr": "ltr",
    "set-rtl": "rtl",
    "set-off": "off",
  };

  const mode = modeMap[command];
  if (!mode) return;

  try {
    const host = new URL(tab.url).hostname;
    if (!isValidHost(host)) return;

    const hostsResult = await safeStorageGet("local", "smartDirectionHosts");
    const hosts = hostsResult.smartDirectionHosts || {};
    hosts[host] = { mode };
    await safeStorageSet("local", { smartDirectionHosts: hosts });

    await chrome.tabs.sendMessage(tab.id, {
      type: "smart-direction:apply-now",
    });
    updateBadge(tab.id, tab.url);
    await updateStats(host, mode);
  } catch (error) {
    logError("Command error:", error);
  }
});

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
  } catch {}
});

// ============ پیام‌ها ============
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "smart-direction:refresh-badge" && sender.tab?.id) {
    updateBadge(sender.tab.id, sender.tab.url);
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "smart-direction:get-defaults") {
    safeStorageGet("sync", "smartDirectionDefaults").then((res) => {
      sendResponse(res.smartDirectionDefaults || DEFAULT_SETTINGS);
    });
    return true;
  }

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

  // 📊 دریافت آمار
  if (message?.type === "smart-direction:get-stats") {
    safeStorageGet("local", "smartDirectionStats").then((res) => {
      sendResponse(res.smartDirectionStats || null);
    });
    return true;
  }

  // 🎯 تشخیص زبان از content script
  if (message?.type === "smart-direction:detected-language") {
    const { host, direction } = message;
    if (host && direction) {
      // اگر حالت خودکار است و تنظیمات اختصاصی وجود ندارد، می‌توانیم پیشنهاد دهیم
      // اما فعلاً فقط ذخیره می‌کنیم برای استفاده‌ی بعدی
      safeStorageSet("local", { [`lastDetected_${host}`]: direction }).catch(
        () => {},
      );
    }
    sendResponse({ ok: true });
    return true;
  }
});

// ============ تغییرات storage ============
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" || area === "local") {
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
