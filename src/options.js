// ============ ترجمه ============
function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const msg = chrome.i18n.getMessage(key);
    if (msg) {
      if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
        el.placeholder = msg;
      } else if (el.tagName === "BUTTON" || el.tagName === "A") {
        // برای دکمه‌ها و لینک‌ها، محتوا را حفظ کن
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
const DEFAULT_SETTINGS = { mode: "auto", threshold: 0.4, minStrongChars: 3 };

const globalMode = document.getElementById("globalMode");
const modeChips = Array.from(globalMode.querySelectorAll(".chip"));
const globalThreshold = document.getElementById("globalThreshold");
const globalThresholdVal = document.getElementById("globalThresholdVal");
const globalMinChars = document.getElementById("globalMinChars");
const globalMinCharsVal = document.getElementById("globalMinCharsVal");
const saveGlobalBtn = document.getElementById("saveGlobal");
const globalStatus = document.getElementById("globalStatus");
const hostList = document.getElementById("hostList");
const clearAllHostsBtn = document.getElementById("clearAllHosts");
const openShortcuts = document.getElementById("openShortcuts");

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

async function loadGlobal() {
  const { smartDirectionDefaults } = await chrome.storage.sync.get(
    "smartDirectionDefaults",
  );
  const s = { ...DEFAULT_SETTINGS, ...(smartDirectionDefaults || {}) };
  paintMode(s.mode);
  paintThreshold(s.threshold);
  paintMinChars(s.minStrongChars);
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
  await chrome.storage.sync.set({
    smartDirectionDefaults: { mode, threshold, minStrongChars },
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

loadGlobal();
loadHosts();

try {
  const manifest = chrome.runtime.getManifest();
  const el = document.getElementById("footerVersion");
  if (el && manifest?.version) {
    el.textContent = `${chrome.i18n.getMessage("version") || "نسخه"} ${manifest.version}`;
  }
} catch {}
