// ============ ترجمه ============
function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = chrome.i18n.getMessage(key);
    if (msg) {
      if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
        el.placeholder = msg;
      } else {
        el.textContent = msg;
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", translatePage);

function setPageDirection() {
  const lang = chrome.i18n.getUILanguage();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang.startsWith("fa") ? "rtl" : "ltr";
}
document.addEventListener("DOMContentLoaded", setPageDirection);

// ============ تنظیمات پیش‌فرض ============
const DEFAULT_SETTINGS = {
  mode: "auto",
  threshold: 0.4,
  minStrongChars: 3,
};

// ============ DOM refs ============
const modeGrid = document.getElementById("modeGrid");
const modeButtons = Array.from(modeGrid.querySelectorAll(".mode-btn"));
const hostLabel = document.getElementById("hostLabel");
const scopeHost = document.getElementById("scopeHost");
const overrideBadge = document.getElementById("overrideBadge");
const thresholdRange = document.getElementById("thresholdRange");
const thresholdValue = document.getElementById("thresholdValue");
const applyAllHosts = document.getElementById("applyAllHosts");
const resetHostBtn = document.getElementById("resetHost");
const statusLine = document.getElementById("statusLine");
const currentModeDisplay = document.getElementById("currentModeDisplay");
const processedCount = document.getElementById("processedCount");
const openOptionsBtn = document.getElementById("openOptionsBtn");

// ============ وضعیت ============
let activeTab = null;
let host = "";
let hasHostOverride = false;
let isApplying = false;

// ============ توابع کمکی ============
function setStatus(text, isError = false) {
  statusLine.textContent = text;
  if (text) {
    setTimeout(() => {
      if (statusLine.textContent === text) statusLine.textContent = "";
    }, 3000);
  }
}

function getModeNames() {
  return {
    auto: chrome.i18n.getMessage("modeAuto"),
    ltr: chrome.i18n.getMessage("modeLtr"),
    rtl: chrome.i18n.getMessage("modeRtl"),
    off: chrome.i18n.getMessage("modeOff"),
  };
}

function paintModeSelection(mode) {
  for (const btn of modeButtons) {
    const selected = btn.dataset.mode === mode;
    btn.setAttribute("aria-checked", String(selected));
  }
  const modeNames = getModeNames();
  currentModeDisplay.textContent = modeNames[mode] || modeNames.auto;
}

function toPersianDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function paintThreshold(threshold) {
  const pct = Math.round(threshold * 100);
  thresholdRange.value = String(pct);
  thresholdValue.textContent = `${toPersianDigits(pct)}٪`;
}

function updateUI(state) {
  hasHostOverride = state.hasOverride;
  paintModeSelection(state.effective.mode);
  paintThreshold(state.effective.threshold);
  resetHostBtn.disabled = !hasHostOverride;
  overrideBadge.style.display = hasHostOverride ? "inline" : "none";
  applyAllHosts.checked = false;
}

// ============ ذخیره‌سازی امن ============
async function safeStorageGet(area, keys) {
  try {
    return await chrome.storage[area].get(keys);
  } catch (error) {
    console.warn("[SmartDirection] Storage get error:", error);
    return {};
  }
}

async function safeStorageSet(area, items) {
  try {
    await chrome.storage[area].set(items);
    return true;
  } catch (error) {
    console.warn("[SmartDirection] Storage set error:", error);
    return false;
  }
}

function isValidHost(host) {
  if (!host || typeof host !== "string") return false;
  return /^[a-zA-Z0-9.\-_]+$/.test(host);
}

// ============ دریافت وضعیت ذخیره‌شده ============
async function getStoredState() {
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

  return {
    globalDefaults,
    hosts,
    effective: { ...globalDefaults, ...(override || {}) },
    hasOverride: Boolean(override),
  };
}

// ============ ذخیره‌سازی ============
async function saveHostOverride(partial) {
  const hostsResult = await safeStorageGet("local", "smartDirectionHosts");
  const hosts = hostsResult.smartDirectionHosts || {};
  hosts[host] = { ...(hosts[host] || {}), ...partial };
  await safeStorageSet("local", { smartDirectionHosts: hosts });
}

async function saveGlobalDefaults(partial) {
  const defaultsResult = await safeStorageGet("sync", "smartDirectionDefaults");
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(defaultsResult.smartDirectionDefaults || {}),
    ...partial,
  };
  await safeStorageSet("sync", { smartDirectionDefaults: merged });
}

async function clearHostOverride() {
  const hostsResult = await safeStorageGet("local", "smartDirectionHosts");
  const hosts = hostsResult.smartDirectionHosts || {};
  delete hosts[host];
  await safeStorageSet("local", { smartDirectionHosts: hosts });
}

// ============ اطلاع‌رسانی به تب فعال ============
async function notifyActiveTab() {
  if (!activeTab?.id || !host || !isValidHost(host)) return;

  const sendMessage = () =>
    chrome.tabs.sendMessage(activeTab.id, {
      type: "smart-direction:apply-now",
    });

  try {
    await sendMessage();
  } catch (err) {
    try {
      // تزریق content.js (بدون نیاز به باندل)
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["src/content.js"],
      });
      await sendMessage();
    } catch (injectErr) {
      console.debug(
        "[SmartDirection] Cannot inject or notify tab:",
        injectErr.message,
      );
    }
  }

  chrome.runtime
    .sendMessage({ type: "smart-direction:refresh-badge" })
    .catch(() => {});
}

// ============ به‌روزرسانی پاپ‌آپ ============
async function refresh() {
  if (!host || !isValidHost(host)) {
    processedCount.textContent =
      chrome.i18n.getMessage("unsupportedPage") || "⚠️ صفحه پشتیبانی نمی‌شود";
    return;
  }
  const state = await getStoredState();
  updateUI(state);

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "smart-direction:get-status",
    });
    if (response && response.mode) {
      const modeNames = getModeNames();
      const modeText = modeNames[response.mode] || response.mode;
      processedCount.textContent =
        chrome.i18n.getMessage("statusBarMode", modeText) ||
        `حالت: ${modeText}`;
    }
  } catch {
    processedCount.textContent =
      chrome.i18n.getMessage("unsupportedPage") || "⚠️ صفحه پشتیبانی نمی‌کند";
  }
}

// ============ مقداردهی اولیه ============
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;

  try {
    host = tab?.url ? new URL(tab.url).hostname : "";
  } catch {
    host = "";
  }

  hostLabel.textContent =
    host ||
    chrome.i18n.getMessage("unsupportedPage") ||
    "این صفحه پشتیبانی نمی‌شود";
  scopeHost.textContent =
    host || chrome.i18n.getMessage("thisSite") || "این سایت";

  if (!host || !isValidHost(host)) {
    modeButtons.forEach((b) => (b.disabled = true));
    thresholdRange.disabled = true;
    applyAllHosts.disabled = true;
    resetHostBtn.disabled = true;
    openOptionsBtn.disabled = true;
    setStatus(
      chrome.i18n.getMessage("unsupportedPageError") ||
        "⚠️ صفحه داخلی یا نامعتبر",
      true,
    );
    return;
  }
  openOptionsBtn.disabled = false;

  await refresh();
}

// ============ رویدادها ============

// انتخاب حالت
modeGrid.addEventListener("click", async (event) => {
  const btn = event.target.closest(".mode-btn");
  if (!btn || !host || isApplying) return;
  isApplying = true;

  const mode = btn.dataset.mode;
  try {
    if (applyAllHosts.checked) {
      await saveGlobalDefaults({ mode });
      await clearHostOverride();
    } else {
      await saveHostOverride({ mode });
    }
    paintModeSelection(mode);
    await notifyActiveTab();
    setStatus(chrome.i18n.getMessage("modeApplied") || "✅ حالت اعمال شد.");
  } catch (error) {
    console.error("[SmartDirection] Mode selection error:", error);
    setStatus(
      chrome.i18n.getMessage("saveError") || "❌ خطا در ذخیره‌سازی",
      true,
    );
  } finally {
    isApplying = false;
    await refresh();
  }
});

// تغییر آستانه (لغزیدن)
thresholdRange.addEventListener("input", () => {
  const pct = Number(thresholdRange.value);
  thresholdValue.textContent = `${toPersianDigits(pct)}٪`;
});

// تغییر آستانه (پایان لغزش)
thresholdRange.addEventListener("change", async () => {
  if (!host || isApplying) return;
  isApplying = true;
  const threshold = Number(thresholdRange.value) / 100;

  try {
    if (applyAllHosts.checked) {
      await saveGlobalDefaults({ threshold });
      await clearHostOverride();
    } else {
      await saveHostOverride({ threshold });
    }
    await notifyActiveTab();
    setStatus(
      chrome.i18n.getMessage("thresholdUpdated") || "✅ آستانه به‌روزرسانی شد.",
    );
  } catch (error) {
    console.error("[SmartDirection] Threshold change error:", error);
    setStatus(
      chrome.i18n.getMessage("saveError") || "❌ خطا در ذخیره‌سازی",
      true,
    );
  } finally {
    isApplying = false;
    await refresh();
  }
});

// حذف تنظیم اختصاصی
resetHostBtn.addEventListener("click", async () => {
  if (!host || isApplying) return;
  const confirmMsg =
    chrome.i18n.getMessage("confirmRemoveOverride") ||
    "آیا از حذف تنظیمات اختصاصی این سایت مطمئن هستید؟";
  if (!confirm(confirmMsg)) return;
  isApplying = true;

  try {
    await clearHostOverride();
    await refresh();
    await notifyActiveTab();
    setStatus(
      chrome.i18n.getMessage("overrideRemoved") || "✅ تنظیم اختصاصی حذف شد.",
    );
  } catch (error) {
    console.error("[SmartDirection] Reset error:", error);
    setStatus(chrome.i18n.getMessage("removeError") || "❌ خطا در حذف", true);
  } finally {
    isApplying = false;
  }
});

// ============ باز کردن صفحه‌ی تنظیمات ============
openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ============ گوش‌دادن به تغییرات storage ============
chrome.storage.onChanged.addListener(() => {
  if (host && isValidHost(host)) {
    refresh();
  }
});

// ============ اجرا ============
init();
