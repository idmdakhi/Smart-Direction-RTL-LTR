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
  return (
    {
      auto: "خودکار",
      ltr: "LTR",
      rtl: "RTL",
      browser: "dir=auto",
      off: "خاموش",
    }[m] || m
  );
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
    hostList.innerHTML = `<p class="empty-hosts">هنوز تنظیم اختصاصی برای هیچ سایتی ذخیره نشده است.</p>`;
    return;
  }

  for (const host of keys) {
    const conf = hosts[host];
    const item = document.createElement("div");
    item.className = "host-item";
    item.innerHTML = `
      <div>
        <div class="host-name">${host}</div>
        <div class="host-meta">حالت: ${modeLabel(conf.mode || "auto")}</div>
      </div>
      <button type="button" class="host-remove" data-host="${host}">حذف</button>
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
  globalStatus.textContent = "ذخیره شد.";
  setTimeout(() => {
    globalStatus.textContent = "";
  }, 2500);
});

clearAllHostsBtn.addEventListener("click", async () => {
  if (!confirm("همهٔ تنظیمات اختصاصی سایت‌ها حذف شود؟")) return;
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
    el.textContent = `نسخه ${manifest.version}`;
  }
} catch {}
