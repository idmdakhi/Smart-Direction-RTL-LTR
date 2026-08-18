const DEFAULT_SETTINGS = { mode: "auto", threshold: 0.4, minStrongChars: 3 };

const modeGrid = document.getElementById("modeGrid");
const modeButtons = Array.from(modeGrid.querySelectorAll(".mode-btn"));
const hostLabel = document.getElementById("hostLabel");
const scopeHost = document.getElementById("scopeHost");
const thresholdRange = document.getElementById("thresholdRange");
const thresholdValue = document.getElementById("thresholdValue");
const minCharsRange = document.getElementById("minCharsRange");
const minCharsValue = document.getElementById("minCharsValue");
const applyAllHosts = document.getElementById("applyAllHosts");
const resetHostBtn = document.getElementById("resetHost");
const statusLine = document.getElementById("statusLine");

let activeTab = null;
let host = "";
let hasHostOverride = false;

function toPersianDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function setStatus(text) {
  statusLine.textContent = text;
  if (text) {
    setTimeout(() => {
      if (statusLine.textContent === text) statusLine.textContent = "";
    }, 2500);
  }
}

function paintModeSelection(mode) {
  for (const btn of modeButtons) {
    btn.setAttribute("aria-checked", String(btn.dataset.mode === mode));
  }
}

function paintThreshold(threshold) {
  const pct = Math.round(threshold * 100);
  thresholdRange.value = String(pct);
  thresholdValue.textContent = `${toPersianDigits(pct)}٪`;
}

function paintMinChars(n) {
  minCharsRange.value = String(n);
  minCharsValue.textContent = toPersianDigits(n);
}

async function getStoredState() {
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
  return {
    globalDefaults,
    hosts,
    effective: { ...globalDefaults, ...(override || {}) },
    hasOverride: Boolean(override),
  };
}

async function saveHostOverride(partial) {
  const { smartDirectionHosts } = await chrome.storage.local.get(
    "smartDirectionHosts",
  );
  const hosts = smartDirectionHosts || {};
  hosts[host] = { ...(hosts[host] || {}), ...partial };
  await chrome.storage.local.set({ smartDirectionHosts: hosts });
}

async function saveGlobalDefaults(partial) {
  const { smartDirectionDefaults } = await chrome.storage.sync.get(
    "smartDirectionDefaults",
  );
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(smartDirectionDefaults || {}),
    ...partial,
  };
  await chrome.storage.sync.set({ smartDirectionDefaults: merged });
}

async function clearHostOverride() {
  const { smartDirectionHosts } = await chrome.storage.local.get(
    "smartDirectionHosts",
  );
  const hosts = smartDirectionHosts || {};
  delete hosts[host];
  await chrome.storage.local.set({ smartDirectionHosts: hosts });
}

async function notifyActiveTab() {
  if (!activeTab?.id) return;
  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "smart-direction:apply-now",
    });
  } catch {
    // content script ممکن است در این تب نباشد
  }
  chrome.runtime
    .sendMessage({ type: "smart-direction:refresh-badge" })
    .catch(() => {});
}

async function refresh() {
  const state = await getStoredState();
  hasHostOverride = state.hasOverride;
  paintModeSelection(state.effective.mode);
  paintThreshold(state.effective.threshold);
  paintMinChars(state.effective.minStrongChars ?? 3);
  resetHostBtn.style.visibility = hasHostOverride ? "visible" : "hidden";
  applyAllHosts.checked = false;
}

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

  if (!host) {
    modeButtons.forEach((b) => (b.disabled = true));
    thresholdRange.disabled = true;
    minCharsRange.disabled = true;
    applyAllHosts.disabled = true;
    return;
  }

  await refresh();
}

modeGrid.addEventListener("click", async (event) => {
  const btn = event.target.closest(".mode-btn");
  if (!btn || !host) return;
  const mode = btn.dataset.mode;

  if (applyAllHosts.checked) {
    await saveGlobalDefaults({ mode });
    await clearHostOverride();
  } else {
    await saveHostOverride({ mode });
  }
  paintModeSelection(mode);
  await notifyActiveTab();
  setStatus("اعمال شد.");
});

thresholdRange.addEventListener("input", () => {
  const pct = Number(thresholdRange.value);
  thresholdValue.textContent = `${toPersianDigits(pct)}٪`;
});

thresholdRange.addEventListener("change", async () => {
  if (!host) return;
  const threshold = Number(thresholdRange.value) / 100;
  if (applyAllHosts.checked) {
    await saveGlobalDefaults({ threshold });
    await clearHostOverride();
  } else {
    await saveHostOverride({ threshold });
  }
  await notifyActiveTab();
  setStatus("آستانه به‌روزرسانی شد.");
});

minCharsRange.addEventListener("input", () => {
  minCharsValue.textContent = toPersianDigits(Number(minCharsRange.value));
});

minCharsRange.addEventListener("change", async () => {
  if (!host) return;
  const minStrongChars = Number(minCharsRange.value);
  if (applyAllHosts.checked) {
    await saveGlobalDefaults({ minStrongChars });
    await clearHostOverride();
  } else {
    await saveHostOverride({ minStrongChars });
  }
  await notifyActiveTab();
  setStatus("حداقل حروف قوی به‌روزرسانی شد.");
});

resetHostBtn.addEventListener("click", async () => {
  if (!host) return;
  await clearHostOverride();
  await refresh();
  await notifyActiveTab();
  setStatus("تنظیم اختصاصی این سایت حذف شد.");
});

init();
