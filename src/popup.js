/**
 * Smart Direction — Popup Script (نسخه بهبودیافته)
 * مدیریت تعاملات کاربر، ذخیره‌سازی، و ارتباط با content script
 */

import { DEFAULT_SETTINGS } from "./config.js";
import {
  safeStorageGet,
  safeStorageSet,
  isValidHost,
  toPersianDigits,
  log,
  logError,
} from "./utils.js";

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

function paintModeSelection(mode) {
  for (const btn of modeButtons) {
    const selected = btn.dataset.mode === mode;
    btn.setAttribute("aria-checked", String(selected));
  }
  // نمایش نام حالت
  const modeNames = {
    auto: "خودکار",
    ltr: "همیشه LTR",
    rtl: "همیشه RTL",
    off: "خاموش",
  };
  currentModeDisplay.textContent = modeNames[mode] || "خودکار";
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
  if (!activeTab?.id) return;
  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "smart-direction:apply-now",
    });
  } catch (error) {
    logError("Notify active tab error:", error);
  }
  chrome.runtime
    .sendMessage({ type: "smart-direction:refresh-badge" })
    .catch(() => {});
}

// ============ به‌روزرسانی پاپ‌آپ ============

async function refresh() {
  if (!host) return;
  const state = await getStoredState();
  updateUI(state);
  // شمارش بلوک‌های پردازش‌شده (از طریق پیام به content)
  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, {
      type: "smart-direction:get-status",
    });
    if (response && response.mode) {
      processedCount.textContent = `حالت: ${response.mode}`;
    }
  } catch {
    processedCount.textContent = "⚠️ صفحه پشتیبانی نمی‌کند";
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

  hostLabel.textContent = host || "این صفحه پشتیبانی نمی‌شود";
  scopeHost.textContent = host || "این سایت";

  if (!host || !isValidHost(host)) {
    modeButtons.forEach((b) => (b.disabled = true));
    thresholdRange.disabled = true;
    applyAllHosts.disabled = true;
    resetHostBtn.disabled = true;
    setStatus("⚠️ صفحه داخلی یا نامعتبر", true);
    return;
  }

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
    setStatus("✅ حالت اعمال شد.");
  } catch (error) {
    logError("Mode selection error:", error);
    setStatus("❌ خطا در ذخیره‌سازی", true);
  } finally {
    isApplying = false;
    await refresh();
  }
});

// تغییر آستانه (هنگام لغزیدن)
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
    setStatus("✅ آستانه به‌روزرسانی شد.");
  } catch (error) {
    logError("Threshold change error:", error);
    setStatus("❌ خطا در ذخیره‌سازی", true);
  } finally {
    isApplying = false;
    await refresh();
  }
});

// حذف تنظیم اختصاصی
resetHostBtn.addEventListener("click", async () => {
  if (!host || isApplying) return;
  if (!confirm("آیا از حذف تنظیمات اختصاصی این سایت مطمئن هستید؟")) return;
  isApplying = true;

  try {
    await clearHostOverride();
    await refresh();
    await notifyActiveTab();
    setStatus("✅ تنظیم اختصاصی حذف شد.");
  } catch (error) {
    logError("Reset error:", error);
    setStatus("❌ خطا در حذف", true);
  } finally {
    isApplying = false;
  }
});

// ============ گوش‌دادن به تغییرات storage ============

chrome.storage.onChanged.addListener(() => {
  if (host && isValidHost(host)) {
    refresh();
  }
});

// ============ اجرا ============

init();
