// ============ ترجمه ============
function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = chrome.i18n.getMessage(key);
    if (msg) {
      if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
        el.placeholder = msg;
      } else if (el.tagName === "BUTTON" || el.tagName === "A") {
        el.textContent = msg;
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
  autoDetectLanguage: true,
};

// ============ DOM refs ============
const globalMode = document.getElementById("globalMode");
const modeChips = Array.from(globalMode.querySelectorAll(".chip"));
const globalThreshold = document.getElementById("globalThreshold");
const globalThresholdVal = document.getElementById("globalThresholdVal");
const globalMinChars = document.getElementById("globalMinChars");
const globalMinCharsVal = document.getElementById("globalMinCharsVal");
const autoDetectLanguage = document.getElementById("autoDetectLanguage");
const saveGlobalBtn = document.getElementById("saveGlobal");
const globalStatus = document.getElementById("globalStatus");
const hostList = document.getElementById("hostList");
const clearAllHostsBtn = document.getElementById("clearAllHosts");
const openShortcuts = document.getElementById("openShortcuts");
const whitelistContainer = document.getElementById("whitelist");
const blacklistContainer = document.getElementById("blacklist");
const whitelistInput = document.getElementById("whitelistInput");
const blacklistInput = document.getElementById("blacklistInput");
const addWhitelistBtn = document.getElementById("addWhitelist");
const addBlacklistBtn = document.getElementById("addBlacklist");
const exportBtn = document.getElementById("exportSettings");
const importBtn = document.getElementById("importSettings");
const importFile = document.getElementById("importFile");
const backupStatus = document.getElementById("backupStatus");
const statsContainer = document.getElementById("statsContainer");

// ============ توابع کمکی ============
function toPersianDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function getModeNames() {
  return {
    auto: chrome.i18n.getMessage("modeAuto"),
    ltr: chrome.i18n.getMessage("modeLtr"),
    rtl: chrome.i18n.getMessage("modeRtl"),
    browser: chrome.i18n.getMessage("modeBrowser"),
    off: chrome.i18n.getMessage("modeOff"),
  };
}

function paintMode(mode) {
  modeChips.forEach((c) => {
    c.setAttribute("aria-checked", String(c.dataset.mode === mode));
  });
}

function paintThreshold(t) {
  const pct = Math.round(t * 100);
  globalThreshold.value = String(pct);
  globalThresholdVal.textContent = `${toPersianDigits(pct)}٪`;
}

function paintMinChars(n) {
  globalMinChars.value = String(n);
  globalMinCharsVal.textContent = toPersianDigits(n);
}

function modeLabel(m) {
  const names = getModeNames();
  return names[m] || m;
}

function showBackupStatus(msg, isError = false) {
  backupStatus.textContent = msg;
  backupStatus.style.color = isError ? "#B4553B" : "#2F7D6E";
  setTimeout(() => {
    if (backupStatus.textContent === msg) backupStatus.textContent = "";
  }, 4000);
}

// ============ بارگذاری تنظیمات ============
async function loadGlobal() {
  const { smartDirectionDefaults } = await chrome.storage.sync.get(
    "smartDirectionDefaults",
  );
  const s = { ...DEFAULT_SETTINGS, ...(smartDirectionDefaults || {}) };
  paintMode(s.mode);
  paintThreshold(s.threshold);
  paintMinChars(s.minStrongChars);
  if (autoDetectLanguage)
    autoDetectLanguage.checked = s.autoDetectLanguage !== false;
}

async function loadHosts() {
  const { smartDirectionHosts } = await chrome.storage.local.get(
    "smartDirectionHosts",
  );
  const hosts = smartDirectionHosts || {};
  const keys = Object.keys(hosts).sort();

  hostList.innerHTML = "";
  if (keys.length === 0) {
    hostList.innerHTML = `<p class="empty-hosts">${chrome.i18n.getMessage("noHostOverrides") || "هنوز تنظیم اختصاصی برای هیچ سایتی ذخیره نشده است."}</p>`;
    return;
  }

  for (const host of keys) {
    const conf = hosts[host];
    const item = document.createElement("div");
    item.className = "host-item";
    const modeText = modeLabel(conf.mode || "auto");
    item.innerHTML = `
      <div>
        <div class="host-name">${host}</div>
        <div class="host-meta">${chrome.i18n.getMessage("hostModeLabel") || "حالت:"} ${modeText}</div>
      </div>
      <button type="button" class="host-remove" data-host="${host}">${chrome.i18n.getMessage("remove") || "حذف"}</button>
    `;
    hostList.appendChild(item);
  }

  hostList.querySelectorAll(".host-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const h = btn.dataset.host;
      const { smartDirectionHosts } = await chrome.storage.local.get(
        "smartDirectionHosts",
      );
      const map = smartDirectionHosts || {};
      delete map[h];
      await chrome.storage.local.set({ smartDirectionHosts: map });
      await loadHosts();
    });
  });
}

// 📋 لیست‌های سفید/سیاه
async function loadLists() {
  const { smartDirectionWhitelist } = await chrome.storage.local.get(
    "smartDirectionWhitelist",
  );
  const { smartDirectionBlacklist } = await chrome.storage.local.get(
    "smartDirectionBlacklist",
  );
  const whitelist = smartDirectionWhitelist || [];
  const blacklist = smartDirectionBlacklist || [];

  renderList(whitelistContainer, whitelist, "whitelist");
  renderList(blacklistContainer, blacklist, "blacklist");
}

function renderList(container, items, type) {
  container.innerHTML = "";
  if (items.length === 0) {
    container.innerHTML = `<p class="empty-hosts">${chrome.i18n.getMessage("emptyList") || "خالی"}</p>`;
    return;
  }
  for (const host of items) {
    const item = document.createElement("div");
    item.className = "host-item";
    item.innerHTML = `
      <span class="host-name">${host}</span>
      <button type="button" class="host-remove" data-host="${host}" data-type="${type}">${chrome.i18n.getMessage("remove") || "حذف"}</button>
    `;
    container.appendChild(item);
  }

  container.querySelectorAll(".host-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const host = btn.dataset.host;
      const type = btn.dataset.type;
      const key =
        type === "whitelist"
          ? "smartDirectionWhitelist"
          : "smartDirectionBlacklist";
      const { [key]: list } = await chrome.storage.local.get(key);
      const newList = (list || []).filter((h) => h !== host);
      await chrome.storage.local.set({ [key]: newList });
      await loadLists();
    });
  });
}

async function addToList(type, host) {
  if (!host || !/^[a-zA-Z0-9.\-_]+$/.test(host)) {
    alert(chrome.i18n.getMessage("invalidHost") || "نام سایت نامعتبر است.");
    return;
  }
  const key =
    type === "whitelist"
      ? "smartDirectionWhitelist"
      : "smartDirectionBlacklist";
  const { [key]: list } = await chrome.storage.local.get(key);
  const newList = list || [];
  if (newList.includes(host)) {
    alert(
      chrome.i18n.getMessage("alreadyExists") ||
        "این سایت قبلاً اضافه شده است.",
    );
    return;
  }
  newList.push(host);
  await chrome.storage.local.set({ [key]: newList });
  await loadLists();
}

// ============ رویدادها ============
modeChips.forEach((chip) => {
  chip.addEventListener("click", () => paintMode(chip.dataset.mode));
});

globalThreshold.addEventListener("input", () => {
  globalThresholdVal.textContent = `${toPersianDigits(globalThreshold.value)}٪`;
});
globalMinChars.addEventListener("input", () => {
  globalMinCharsVal.textContent = toPersianDigits(globalMinChars.value);
});

saveGlobalBtn.addEventListener("click", async () => {
  const mode =
    modeChips.find((c) => c.getAttribute("aria-checked") === "true")?.dataset
      .mode || "auto";
  const threshold = Number(globalThreshold.value) / 100;
  const minStrongChars = Number(globalMinChars.value);
  const autoDetect = autoDetectLanguage.checked;
  await chrome.storage.sync.set({
    smartDirectionDefaults: {
      mode,
      threshold,
      minStrongChars,
      autoDetectLanguage: autoDetect,
    },
  });
  globalStatus.textContent = chrome.i18n.getMessage("saved") || "ذخیره شد.";
  setTimeout(() => {
    globalStatus.textContent = "";
  }, 2500);
});

clearAllHostsBtn.addEventListener("click", async () => {
  const confirmMsg =
    chrome.i18n.getMessage("confirmClearAllHosts") ||
    "همهٔ تنظیمات اختصاصی سایت‌ها حذف شود؟";
  if (!confirm(confirmMsg)) return;
  await chrome.storage.local.set({ smartDirectionHosts: {} });
  await loadHosts();
});

openShortcuts.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

// لیست‌ها
addWhitelistBtn.addEventListener("click", () => {
  addToList("whitelist", whitelistInput.value.trim());
  whitelistInput.value = "";
});
whitelistInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addToList("whitelist", whitelistInput.value.trim());
    whitelistInput.value = "";
  }
});

addBlacklistBtn.addEventListener("click", () => {
  addToList("blacklist", blacklistInput.value.trim());
  blacklistInput.value = "";
});
blacklistInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    addToList("blacklist", blacklistInput.value.trim());
    blacklistInput.value = "";
  }
});

// 💾 پشتیبان‌گیری
exportBtn.addEventListener("click", async () => {
  try {
    const [defaults, hosts, whitelist, blacklist] = await Promise.all([
      chrome.storage.sync.get("smartDirectionDefaults"),
      chrome.storage.local.get("smartDirectionHosts"),
      chrome.storage.local.get("smartDirectionWhitelist"),
      chrome.storage.local.get("smartDirectionBlacklist"),
    ]);

    const data = {
      version: chrome.runtime.getManifest().version,
      exported: new Date().toISOString(),
      defaults: defaults.smartDirectionDefaults || {},
      hosts: hosts.smartDirectionHosts || {},
      whitelist: whitelist.smartDirectionWhitelist || [],
      blacklist: blacklist.smartDirectionBlacklist || [],
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smart-direction-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showBackupStatus(
      chrome.i18n.getMessage("exportSuccess") || "✅ خروجی با موفقیت ذخیره شد.",
    );
  } catch (error) {
    console.error("Export error:", error);
    showBackupStatus(
      chrome.i18n.getMessage("exportError") || "❌ خطا در خروجی",
      true,
    );
  }
});

importBtn.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.version) {
      throw new Error("Invalid backup file");
    }

    if (data.defaults)
      await chrome.storage.sync.set({ smartDirectionDefaults: data.defaults });
    if (data.hosts)
      await chrome.storage.local.set({ smartDirectionHosts: data.hosts });
    if (data.whitelist)
      await chrome.storage.local.set({
        smartDirectionWhitelist: data.whitelist,
      });
    if (data.blacklist)
      await chrome.storage.local.set({
        smartDirectionBlacklist: data.blacklist,
      });

    showBackupStatus(
      chrome.i18n.getMessage("importSuccess") ||
        "✅ تنظیمات با موفقیت وارد شد.",
    );
    setTimeout(() => location.reload(), 1500);
  } catch (error) {
    console.error("Import error:", error);
    showBackupStatus(
      chrome.i18n.getMessage("importError") || "❌ خطا در ورودی",
      true,
    );
  }
  importFile.value = "";
});

// 📊 آمار
async function loadStats() {
  try {
    const { smartDirectionStats } = await chrome.storage.local.get(
      "smartDirectionStats",
    );
    const stats = smartDirectionStats || null;

    if (!stats || stats.totalSites === 0) {
      statsContainer.innerHTML = `<p class="stats-empty">${chrome.i18n.getMessage("noStats") || "هنوز آماری ثبت نشده است."}</p>`;
      return;
    }

    const totalSites = stats.totalSites || 0;
    const totalBlocks = stats.totalBlocks || 0;
    const lastUsed = stats.lastUsed
      ? new Date(stats.lastUsed).toLocaleString()
      : "—";
    const modeChanges = stats.modeChanges || {};
    const totalChanges = Object.values(modeChanges).reduce((a, b) => a + b, 0);

    const sortedModes = Object.entries(modeChanges).sort((a, b) => b[1] - a[1]);

    let html = `
      <div class="stats-grid">
        <div class="stat-item"><span class="stat-label">${chrome.i18n.getMessage("totalSites") || "تعداد سایت‌ها:"}</span> <span class="stat-value">${toPersianDigits(totalSites)}</span></div>
        <div class="stat-item"><span class="stat-label">${chrome.i18n.getMessage("totalBlocks") || "تعداد بلوک‌ها:"}</span> <span class="stat-value">${toPersianDigits(totalBlocks)}</span></div>
        <div class="stat-item"><span class="stat-label">${chrome.i18n.getMessage("totalChanges") || "تعداد تغییرات:"}</span> <span class="stat-value">${toPersianDigits(totalChanges)}</span></div>
        <div class="stat-item"><span class="stat-label">${chrome.i18n.getMessage("lastUsed") || "آخرین استفاده:"}</span> <span class="stat-value">${lastUsed}</span></div>
      </div>
      <div class="stats-modes">
        <h4>${chrome.i18n.getMessage("modeDistribution") || "توزیع حالت‌ها:"}</h4>
    `;

    for (const [mode, count] of sortedModes) {
      const pct =
        totalChanges > 0 ? Math.round((count / totalChanges) * 100) : 0;
      const modeName = modeLabel(mode);
      html += `
        <div class="mode-bar">
          <span class="mode-bar-label">${modeName}</span>
          <div class="mode-bar-track">
            <div class="mode-bar-fill" style="width: ${pct}%; background: ${getModeColor(mode)}"></div>
          </div>
          <span class="mode-bar-count">${toPersianDigits(count)} (${toPersianDigits(pct)}%)</span>
        </div>
      `;
    }

    html += `</div>`;
    statsContainer.innerHTML = html;
  } catch (error) {
    console.error("Stats error:", error);
    statsContainer.innerHTML = `<p class="stats-empty">${chrome.i18n.getMessage("statsError") || "خطا در بارگذاری آمار"}</p>`;
  }
}

function getModeColor(mode) {
  const colors = {
    auto: "#2F7D6E",
    ltr: "#3B6CB4",
    rtl: "#B4553B",
    off: "#8A8A8A",
  };
  return colors[mode] || "#78756c";
}

// ============ مقداردهی اولیه ============
loadGlobal();
loadHosts();
loadLists();
loadStats();

try {
  const manifest = chrome.runtime.getManifest();
  const el = document.getElementById("footerVersion");
  if (el && manifest?.version) {
    el.textContent = `${chrome.i18n.getMessage("version") || "نسخه"} ${manifest.version}`;
  }
} catch {}

// ============ شنیدن تغییرات ============
chrome.storage.onChanged.addListener(() => {
  loadGlobal();
  loadHosts();
  loadLists();
  loadStats();
});
