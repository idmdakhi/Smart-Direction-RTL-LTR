const DEFAULT_SETTINGS = {
  mode: "auto",
  threshold: 0.4,
  minStrongChars: 3,
  autoDetectLanguage: true,
};
const THEMES = ["system", "light", "dark"];
const $ = (id) => document.getElementById(id);
const modeGrid = $("modeGrid"),
  modeButtons = [...modeGrid.querySelectorAll(".mode-btn")];
const hostLabel = $("hostLabel"),
  scopeHost = $("scopeHost"),
  overrideBadge = $("overrideBadge"),
  thresholdRange = $("thresholdRange"),
  thresholdValue = $("thresholdValue"),
  applyAllHosts = $("applyAllHosts"),
  resetHostBtn = $("resetHost"),
  statusLine = $("statusLine"),
  currentModeDisplay = $("currentModeDisplay"),
  processedCountValue = $("processedCountValue"),
  statusDot = $("statusDot"),
  openOptionsBtn = $("openOptionsBtn"),
  applyToAllTabsBtn = $("applyToAllTabs"),
  resetToDefaultsBtn = $("resetToDefaults"),
  themeCycle = $("themeCycle");
let activeTab = null,
  host = "",
  hasHostOverride = false,
  isApplying = false;
function msg(k, f = "") {
  return chrome.i18n.getMessage(k) || f;
}
function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const m = msg(el.dataset.i18n);
    if (m) el.textContent = m;
  });
}
function setDirection() {
  const l = chrome.i18n.getUILanguage();
  document.documentElement.lang = l;
  document.documentElement.dir = l.startsWith("fa") ? "rtl" : "ltr";
}
function persian(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}
function modeNames() {
  return {
    auto: msg("modeAuto", "خودکار"),
    ltr: msg("modeLtr", "همیشه LTR"),
    rtl: msg("modeRtl", "همیشه RTL"),
    off: msg("modeOff", "خاموش"),
  };
}
function setStatus(text, error = false) {
  statusLine.textContent = text;
  statusLine.classList.toggle("error", error);
  if (text)
    setTimeout(() => {
      if (statusLine.textContent === text) statusLine.textContent = "";
    }, 2800);
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "system" ? "" : theme;
  themeCycle.title =
    theme === `system`
      ? msg("themeSystem", "تم سیستم")
      : theme === `light`
        ? msg("themeLight", "تم روشن")
        : msg("themeDark", "تم تاریک");
  themeCycle.textContent =
    theme === "dark" ? "☾" : theme === "light" ? "☀" : "◐";
}
async function getTheme() {
  const r = await safeGet("sync", "smartDirectionTheme");
  return THEMES.includes(r.smartDirectionTheme)
    ? r.smartDirectionTheme
    : "system";
}
async function setTheme() {
  const t = await getTheme(),
    next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
  await safeSet("sync", { smartDirectionTheme: next });
  applyTheme(next);
  setStatus(
    `${msg("themeChanged", "تم تغییر کرد: ")}${next === `dark` ? msg("themeDark", "تاریک") : next === `light` ? msg("themeLight", "روشن") : msg("themeSystem", "سیستم")}`,
  );
}
async function safeGet(area, keys) {
  try {
    return await chrome.storage[area].get(keys);
  } catch {
    return {};
  }
}
async function safeSet(area, items) {
  try {
    await chrome.storage[area].set(items);
    return true;
  } catch {
    return false;
  }
}
function validHost(h) {
  return !!h && /^[a-zA-Z0-9._-]+$/.test(h);
}
async function state() {
  const [d, h] = await Promise.all([
    safeGet("sync", "smartDirectionDefaults"),
    safeGet("local", "smartDirectionHosts"),
  ]);
  const defaults = { ...DEFAULT_SETTINGS, ...(d.smartDirectionDefaults || {}) },
    hosts = h.smartDirectionHosts || {},
    override = hosts[host];
  return {
    effective: { ...defaults, ...(override || {}) },
    hasOverride: Boolean(override),
  };
}
async function saveHost(partial) {
  const r = await safeGet("local", "smartDirectionHosts"),
    hosts = r.smartDirectionHosts || {};
  hosts[host] = { ...(hosts[host] || {}), ...partial };
  await safeSet("local", { smartDirectionHosts: hosts });
}
async function saveGlobal(partial) {
  const r = await safeGet("sync", "smartDirectionDefaults");
  await safeSet("sync", {
    smartDirectionDefaults: {
      ...DEFAULT_SETTINGS,
      ...(r.smartDirectionDefaults || {}),
      ...partial,
    },
  });
}
async function clearHost() {
  const r = await safeGet("local", "smartDirectionHosts"),
    hosts = r.smartDirectionHosts || {};
  delete hosts[host];
  await safeSet("local", { smartDirectionHosts: hosts });
}
function paint(mode) {
  modeButtons.forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.mode === mode));
  });
  const names = modeNames();
  currentModeDisplay.textContent = names[mode] || names.auto;
  statusDot.style.background = `var(--${mode})`;
  statusDot.style.boxShadow = `0 0 0 4px var(--${mode}-bg)`;
}
function paintThreshold(v) {
  const p = Math.round(v * 100);
  thresholdRange.value = p;
  updateRangeProgress(thresholdRange);
  thresholdValue.textContent = `${persian(p)}٪`;
}
function updateUI(s) {
  hasHostOverride = s.hasOverride;
  paint(s.effective.mode);
  paintThreshold(s.effective.threshold);
  resetHostBtn.disabled = !hasHostOverride;
  overrideBadge.hidden = !hasHostOverride;
  applyAllHosts.checked = false;
}
async function notify() {
  if (!activeTab?.id) return;
  try {
    await chrome.tabs.sendMessage(activeTab.id, {
      type: "smart-direction:apply-now",
    });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["src/content.js"],
      });
      await chrome.tabs.sendMessage(activeTab.id, {
        type: "smart-direction:apply-now",
      });
    } catch {}
  }
  chrome.runtime
    .sendMessage({ type: "smart-direction:refresh-badge" })
    .catch(() => {});
}
async function refresh() {
  if (!validHost(host)) {
    processedCountValue.textContent = "—";
    return;
  }
  updateUI(await state());
  try {
    const r = await chrome.tabs.sendMessage(activeTab.id, {
      type: "smart-direction:get-status",
    });
    processedCountValue.textContent = persian(r?.count ?? 0);
  } catch {
    processedCountValue.textContent = "—";
  }
}
async function resetDefaults() {
  if (
    !confirm(msg("confirmResetDefaults", "تنظیمات به پیش‌فرض برگردانده شود؟"))
  )
    return;
  await safeSet("sync", {
    smartDirectionDefaults: DEFAULT_SETTINGS,
    smartDirectionTheme: "system",
  });
  await safeSet("local", {
    smartDirectionHosts: {},
    smartDirectionWhitelist: [],
    smartDirectionBlacklist: [],
  });
  applyTheme("system");
  setStatus(msg("defaultsReset", "تنظیمات بازنشانی شد."));
  await notify();
  await refresh();
}
modeGrid.addEventListener("click", async (e) => {
  const b = e.target.closest(".mode-btn");
  if (!b || !validHost(host) || isApplying) return;
  isApplying = true;
  try {
    if (applyAllHosts.checked) {
      await saveGlobal({ mode: b.dataset.mode });
      await clearHost();
    } else await saveHost({ mode: b.dataset.mode });
    await notify();
    setStatus(msg("modeApplied", "حالت اعمال شد."));
  } catch {
    setStatus(msg("saveError", "خطا در ذخیره‌سازی"), true);
  } finally {
    isApplying = false;
    await refresh();
  }
});
thresholdRange.addEventListener("input", () => {
  updateRangeProgress(thresholdRange);
  const pct = Number(thresholdRange.value);
  thresholdValue.textContent = `${persian(pct)}٪`;
});
thresholdRange.addEventListener("change", async () => {
  if (!validHost(host) || isApplying) return;
  isApplying = true;
  try {
    const threshold = Number(thresholdRange.value) / 100;
    if (applyAllHosts.checked) {
      await saveGlobal({ threshold });
      await clearHost();
    } else await saveHost({ threshold });
    await notify();
    setStatus(msg("thresholdUpdated", "آستانه به‌روزرسانی شد."));
  } catch {
    setStatus(msg("saveError", "خطا در ذخیره‌سازی"), true);
  } finally {
    isApplying = false;
    await refresh();
  }
});
resetHostBtn.addEventListener("click", async () => {
  if (
    !validHost(host) ||
    isApplying ||
    !confirm(msg("confirmRemoveOverride", "حذف تنظیم اختصاصی این سایت؟"))
  )
    return;
  isApplying = true;
  try {
    await clearHost();
    await notify();
    setStatus(msg("overrideRemoved", "تنظیم اختصاصی حذف شد."));
  } catch {
    setStatus(msg("removeError", "خطا در حذف"), true);
  } finally {
    isApplying = false;
    await refresh();
  }
});
applyToAllTabsBtn.addEventListener("click", async () => {
  if (!validHost(host) || isApplying) return;
  isApplying = true;
  let count = 0;
  try {
    for (const t of await chrome.tabs.query({}))
      if (t.id && t.url && !t.url.startsWith("chrome://")) {
        try {
          await chrome.tabs.sendMessage(t.id, {
            type: "smart-direction:apply-now",
          });
          count++;
        } catch {}
      }
    setStatus(
      `${msg("appliedTabsPrefix", "اعمال شد روی ")}${persian(count)} ${msg("tabs", "تب")}`,
    );
  } catch {
    setStatus(msg("applyTabsError", "خطا در اعمال روی تب‌ها"), true);
  } finally {
    isApplying = false;
  }
});
openOptionsBtn.addEventListener("click", () =>
  chrome.runtime.openOptionsPage(),
);
resetToDefaultsBtn.addEventListener("click", resetDefaults);
themeCycle.addEventListener("click", setTheme);
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.smartDirectionTheme)
    applyTheme(changes.smartDirectionTheme.newValue || "system");
  if (host && validHost(host)) await refresh();
});
async function init() {
  translatePage();
  setDirection();
  applyTheme(await getTheme());
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = t;
  try {
    host = t?.url ? new URL(t.url).hostname : "";
  } catch {
    host = "";
  }
  hostLabel.textContent =
    host || msg("unsupportedPage", "صفحه پشتیبانی نمی‌شود");
  scopeHost.textContent = host || msg("thisSite", "این سایت");
  if (!validHost(host)) {
    modeButtons.forEach((b) => (b.disabled = true));
    thresholdRange.disabled = true;
    applyAllHosts.disabled = true;
    resetHostBtn.disabled = true;
    applyToAllTabsBtn.disabled = true;
    resetToDefaultsBtn.disabled = true;
    openOptionsBtn.disabled = true;
    setStatus(msg("unsupportedPageError", "صفحه داخلی یا نامعتبر"), true);
    return;
  }
  await refresh();
}

function updateRangeProgress(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty("--range-progress", `${percent}%`);
}

init();
