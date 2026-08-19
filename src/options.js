const DEFAULT_SETTINGS = {
  mode: "auto",
  threshold: 0.4,
  minStrongChars: 3,
  autoDetectLanguage: true,
};
const THEMES = ["system", "light", "dark"];
const $ = (id) => document.getElementById(id);
const globalMode = $("globalMode"),
  modeChips = [...globalMode.querySelectorAll(".chip")];
const thresholdValue = $("thresholdValue");
const minCharsValue = $("minCharsValue");
const globalThreshold = $("globalThreshold");
const globalMinChars = $("globalMinChars");
const autoDetectLanguage = $("autoDetectLanguage");
const saveGlobalBtn = $("saveGlobal");
const globalStatus = $("globalStatus");
const hostList = $("hostList");
const clearAllHostsBtn = $("clearAllHosts");
const openShortcuts = $("openShortcuts");
const whitelistContainer = $("whitelist");
const blacklistContainer = $("blacklist");
const whitelistInput = $("whitelistInput");
const blacklistInput = $("blacklistInput");
const addWhitelistBtn = $("addWhitelist");
const addBlacklistBtn = $("addBlacklist");
const exportBtn = $("exportSettings");
const importBtn = $("importSettings");
const importFile = $("importFile");
const backupStatus = $("backupStatus");
const statsContainer = $("statsContainer");
const themeButtons = [...document.querySelectorAll(".theme-btn")];
const themePreview = $("themePreview");
function msg(k, f = "") {
  return chrome.i18n.getMessage(k) || f;
}
function translate() {
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
function applyTheme(t) {
  document.documentElement.dataset.theme = t === "system" ? "" : t;
  themeButtons.forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.theme === t)),
  );
  themePreview.textContent = t === "dark" ? "☾" : t === "light" ? "☀" : "◐";
}
async function loadTheme() {
  const r = await chrome.storage.sync.get("smartDirectionTheme");
  return THEMES.includes(r.smartDirectionTheme)
    ? r.smartDirectionTheme
    : "system";
}
async function setTheme(t) {
  await chrome.storage.sync.set({ smartDirectionTheme: t });
  applyTheme(t);
}
function getModeNames() {
  return {
    auto: msg("modeAuto", "خودکار"),
    ltr: msg("modeLtr", "همیشه LTR"),
    rtl: msg("modeRtl", "همیشه RTL"),
    browser: msg("modeBrowser", "dir=auto"),
    off: msg("modeOff", "خاموش"),
  };
}
function modeLabel(m) {
  return getModeNames()[m] || m;
}
function paintMode(mode) {
  modeChips.forEach((c) =>
    c.setAttribute("aria-checked", String(c.dataset.mode === mode)),
  );
}
function paintThreshold(t) {
  const p = Math.round(t * 100);
  globalThreshold.value = p;
  updateRangeProgress(globalThreshold);
  thresholdValue.textContent = `${persian(p)}٪`;
}
function paintMinChars(n) {
  globalMinChars.value = n;
  updateRangeProgress(globalMinChars);
  minCharsValue.textContent = persian(n);
}
function status(el, text, error = false) {
  el.textContent = text;
  el.style.color = error ? "var(--rtl)" : "var(--auto)";
  if (text)
    setTimeout(() => {
      if (el.textContent === text) el.textContent = "";
    }, 2800);
}
async function loadGlobal() {
  const r = await chrome.storage.sync.get("smartDirectionDefaults"),
    s = { ...DEFAULT_SETTINGS, ...(r.smartDirectionDefaults || {}) };
  paintMode(s.mode);
  paintThreshold(s.threshold);
  paintMinChars(s.minStrongChars);
  autoDetectLanguage.checked = s.autoDetectLanguage !== false;
}
async function loadHosts() {
  const r = await chrome.storage.local.get("smartDirectionHosts"),
    hosts = r.smartDirectionHosts || {},
    keys = Object.keys(hosts).sort();
  hostList.innerHTML = "";
  if (!keys.length) {
    hostList.innerHTML = `<p class="empty-hosts">${msg("noHostOverrides", "هنوز تنظیم اختصاصی ثبت نشده است.")}</p>`;
    return;
  }
  for (const h of keys) {
    const item = document.createElement("div");
    item.className = "host-item";
    item.innerHTML = `<div><div class="host-name">${escapeHtml(h)}</div><div class="host-meta">${msg("hostModeLabel", "حالت:")} ${modeLabel(hosts[h]?.mode || "auto")}</div></div><button class="host-remove" data-host="${escapeAttr(h)}">${msg("remove", "حذف")}</button>`;
    hostList.appendChild(item);
  }
  hostList.querySelectorAll(".host-remove").forEach((b) =>
    b.addEventListener("click", async () => {
      const r = await chrome.storage.local.get("smartDirectionHosts"),
        map = r.smartDirectionHosts || {};
      delete map[b.dataset.host];
      await chrome.storage.local.set({ smartDirectionHosts: map });
      loadHosts();
    }),
  );
}
async function loadLists() {
  const r = await chrome.storage.local.get([
    "smartDirectionWhitelist",
    "smartDirectionBlacklist",
  ]);
  renderList(whitelistContainer, r.smartDirectionWhitelist || [], "whitelist");
  renderList(blacklistContainer, r.smartDirectionBlacklist || [], "blacklist");
}
function renderList(container, items, type) {
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<p class="empty-hosts">${msg("emptyList", "خالی")}</p>`;
    return;
  }
  for (const h of items) {
    const item = document.createElement("div");
    item.className = "host-item";
    item.innerHTML = `<span class="host-name">${escapeHtml(h)}</span><button class="host-remove" data-host="${escapeAttr(h)}" data-type="${type}">${msg("remove", "حذف")}</button>`;
    container.appendChild(item);
  }
  container.querySelectorAll(".host-remove").forEach((b) =>
    b.addEventListener("click", async () => {
      const key =
          b.dataset.type === "whitelist"
            ? "smartDirectionWhitelist"
            : "smartDirectionBlacklist",
        r = await chrome.storage.local.get(key),
        list = (r[key] || []).filter((h) => h !== b.dataset.host);
      await chrome.storage.local.set({ [key]: list });
      loadLists();
    }),
  );
}
async function addToList(type, value) {
  const host = value.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(host)) {
    alert(msg("invalidHost", "نام سایت نامعتبر است."));
    return;
  }
  const key =
      type === "whitelist"
        ? "smartDirectionWhitelist"
        : "smartDirectionBlacklist",
    r = await chrome.storage.local.get(key),
    list = r[key] || [];
  if (list.includes(host)) {
    alert(msg("alreadyExists", "این سایت قبلاً اضافه شده است."));
    return;
  }
  await chrome.storage.local.set({ [key]: [...list, host] });
  await loadLists();
}
function escapeHtml(v) {
  return String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
}
function escapeAttr(v) {
  return escapeHtml(v);
}
modeChips.forEach((c) =>
  c.addEventListener("click", () => paintMode(c.dataset.mode)),
);
globalThreshold.addEventListener("input", () => {
  updateRangeProgress(globalThreshold);
  const pct = Number(globalThreshold.value);
  thresholdValue.textContent = `${persian(pct)}٪`;
});

globalMinChars.addEventListener("input", () => {
  updateRangeProgress(globalMinChars);
  const val = Number(globalMinChars.value);
  minCharsValue.textContent = persian(val);
});
saveGlobalBtn.addEventListener("click", async () => {
  const mode =
    modeChips.find((c) => c.getAttribute("aria-checked") === "true")?.dataset
      .mode || "auto";
  await chrome.storage.sync.set({
    smartDirectionDefaults: {
      mode,
      threshold: Number(globalThreshold.value) / 100,
      minStrongChars: Number(globalMinChars.value),
      autoDetectLanguage: autoDetectLanguage.checked,
    },
  });
  status(globalStatus, msg("saved", "ذخیره شد."));
});
clearAllHostsBtn.addEventListener("click", async () => {
  if (
    !confirm(
      msg("confirmClearAllHosts", "همهٔ تنظیمات اختصاصی سایت‌ها حذف شود؟"),
    )
  )
    return;
  await chrome.storage.local.set({ smartDirectionHosts: {} });
  loadHosts();
});
openShortcuts.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
addWhitelistBtn.addEventListener("click", () => {
  addToList("whitelist", whitelistInput.value);
  whitelistInput.value = "";
});
addBlacklistBtn.addEventListener("click", () => {
  addToList("blacklist", blacklistInput.value);
  blacklistInput.value = "";
});
whitelistInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addWhitelistBtn.click();
});
blacklistInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addBlacklistBtn.click();
});
exportBtn.addEventListener("click", async () => {
  try {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get([
        "smartDirectionDefaults",
        "smartDirectionTheme",
      ]),
      chrome.storage.local.get([
        "smartDirectionHosts",
        "smartDirectionWhitelist",
        "smartDirectionBlacklist",
      ]),
    ]);
    const data = {
      version: chrome.runtime.getManifest().version,
      exported: new Date().toISOString(),
      defaults: sync.smartDirectionDefaults || {},
      theme: sync.smartDirectionTheme || "system",
      hosts: local.smartDirectionHosts || {},
      whitelist: local.smartDirectionWhitelist || [],
      blacklist: local.smartDirectionBlacklist || [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `smart-direction-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    status(backupStatus, msg("exportSuccess", "خروجی با موفقیت ذخیره شد."));
  } catch (e) {
    console.error(e);
    status(backupStatus, msg("exportError", "خطا در خروجی"), true);
  }
});
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.version) throw new Error("invalid backup");
    await chrome.storage.sync.set({
      smartDirectionDefaults: data.defaults || DEFAULT_SETTINGS,
      smartDirectionTheme: THEMES.includes(data.theme) ? data.theme : "system",
    });
    await chrome.storage.local.set({
      smartDirectionHosts: data.hosts || {},
      smartDirectionWhitelist: data.whitelist || [],
      smartDirectionBlacklist: data.blacklist || [],
    });
    applyTheme(THEMES.includes(data.theme) ? data.theme : "system");
    status(backupStatus, msg("importSuccess", "تنظیمات با موفقیت وارد شد."));
    await Promise.all([loadGlobal(), loadHosts(), loadLists(), loadStats()]);
  } catch (e) {
    console.error(e);
    status(backupStatus, msg("importError", "خطا در ورودی"), true);
  } finally {
    importFile.value = "";
  }
});
async function loadStats() {
  try {
    const r = await chrome.storage.local.get("smartDirectionStats"),
      s = r.smartDirectionStats;
    if (!s || !s.totalSites) {
      statsContainer.innerHTML = `<p class="stats-empty">${msg("noStats", "هنوز آماری ثبت نشده است.")}</p>`;
      return;
    }
    const totalSites = s.totalSites || 0,
      totalBlocks = s.totalBlocks || 0,
      changes = s.modeChanges || {},
      totalChanges = Object.values(changes).reduce((a, b) => a + b, 0);
    statsContainer.innerHTML =
      `<div class="stats-grid-three"><div class="stats-item-three"><div class="stats-value-three">${persian(totalSites)}</div><div class="stats-label-three">${msg("statsSites", "سایت‌ها")}</div></div><div class="stats-item-three"><div class="stats-value-three">${persian(totalBlocks)}</div><div class="stats-label-three">${msg("statsBlocks", "بلوک‌ها")}</div></div><div class="stats-item-three"><div class="stats-value-three">${persian(totalChanges)}</div><div class="stats-label-three">${msg("statsChanges", "تغییرات")}</div></div></div>` +
      (totalChanges
        ? `<div class="stats-modes"><h4>${msg("modeDistribution", "توزیع حالت‌ها")}</h4>${Object.entries(
            changes,
          )
            .sort((a, b) => b[1] - a[1])
            .map(([m, c]) => {
              const pct = Math.round((c / totalChanges) * 100);
              return `<div class="mode-bar"><span class="mode-bar-label">${modeLabel(m)}</span><div class="mode-bar-track"><div class="mode-bar-fill" style="width:${pct}%;background:var(--${m === "auto" ? "auto" : m === "ltr" ? "ltr" : m === "rtl" ? "rtl" : "off"})"></div></div><span class="mode-bar-count">${persian(c)} (${persian(pct)}٪)</span></div>`;
            })
            .join("")}</div>`
        : "");
  } catch (e) {
    console.error(e);
    statsContainer.innerHTML = `<p class="stats-empty">${msg("statsError", "خطا در بارگذاری آمار")}</p>`;
  }
}
themeButtons.forEach((b) =>
  b.addEventListener("click", () => setTheme(b.dataset.theme)),
);
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.smartDirectionTheme)
    applyTheme(changes.smartDirectionTheme.newValue || "system");
  await Promise.all([loadGlobal(), loadHosts(), loadLists(), loadStats()]);
});
async function init() {
  translate();
  setDirection();
  applyTheme(await loadTheme());
  await Promise.all([loadGlobal(), loadHosts(), loadLists(), loadStats()]);
  try {
    const m = chrome.runtime.getManifest();
    $("footerVersion").textContent = `${msg("version", "نسخه")} ${m.version}`;
  } catch {}
}

function updateRangeProgress(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty("--range-progress", `${percent}%`);
}

init();
