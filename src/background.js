/**
 * Smart Direction — Service Worker
 * مدیریت بَدج، همگام‌سازی تنظیمات، و ارتباط بین اجزا
 */

/**
 * Smart Direction — Central Configuration
 * تمام ثابت‌ها و تنظیمات پیش‌فرض در اینجا متمرکز شده‌اند
 */

const DEFAULT_SETTINGS = {
  mode: "auto", // "auto" | "ltr" | "rtl" | "off"
  threshold: 0.4, // نسبت RTL لازم برای تشخیص (۰ تا ۱)
  minStrongChars: 3, // حداقل حروف قوی برای تصمیم‌گیری
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

// انتخاب‌گرهای بلوک‌های متنی
const BLOCK_SELECTOR = [
  "p",
  "li",
  "td",
  "th",
  "blockquote",
  "figcaption",
  "dd",
  "dt",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "caption",
  "summary",
  "label",
  "legend",
  "button",
  "a",
].join(",");

// انتخاب‌گرهای بلوک‌های کد
const CODE_SELECTOR = [
  "code",
  "pre",
  "samp",
  "kbd",
  "var",
  "tt",
  ".hljs",
  ".prettyprint",
  ".source-code",
  ".code-block",
  "[class*='language-']",
  "[class*='CodeMirror']",
  ".cm-editor",
  ".monaco-editor",
  '[role="code"]',
  '[aria-label*="code" i]',
].join(",");

// برچسب‌هایی که هرگز پردازش نمی‌شوند
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "SVG",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "IFRAME",
  "CANVAS",
  "TEMPLATE",
]);

// الگوهای کاراکترهای قوی
const RTL_STRONG =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
const LTR_STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/g;
/**
 * Smart Direction — Utilities
 * توابع عمومی، مدیریت خطا، و عملیات ذخیره‌سازی امن
 */

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

// ============ اعتبارسنجی میزبان ============

function isValidHost(host) {
  if (!host || typeof host !== "string") return false;
  // فقط کاراکترهای مجاز: حروف، اعداد، نقطه، خط تیره، زیرخط
  return /^[a-zA-Z0-9.\-_]+$/.test(host);
}

// ============ مدیریت لاگ ============

const DEBUG = false;

function log(...args) {
  if (DEBUG) console.log("[SmartDirection]", ...args);
}

function logError(...args) {
  console.error("[SmartDirection]", ...args);
}

// ============ هش سریع برای امضای متن ============

function fastHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// ============ تشخیص حالت‌های خاص ============

function isCodeLike(text) {
  if (!text || text.length < 5) return false;
  const symbols = /[{}\[\]();=<>+\-*/%&|^~!]/g;
  const matches = text.match(symbols);
  if (!matches) return false;
  const ratio = matches.length / text.length;
  return ratio > 0.15; // بیش از ۱۵٪ نمادهای برنامه‌نویسی
}

// ============ تبدیل اعداد به فارسی ============

function toPersianDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
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
