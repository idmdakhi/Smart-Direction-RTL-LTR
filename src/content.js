/**
 * Smart Direction — Content Script (نسخه بهبودیافته)
 * تشخیص هوشمند جهت با پشتیبانی از Shadow DOM، کارایی بالا، و مدیریت خطا
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

// ============ وضعیت داخلی ============

let settings = { ...DEFAULT_SETTINGS };
const lastSignature = new WeakMap();
let idleHandle = null;
let mutationTimer = null;
const pendingRoots = new Set();
let observer = null;

// ============ توابع کمکی ============

function currentHost() {
  try {
    return location.hostname || "";
  } catch {
    return "";
  }
}

function isEditable(el) {
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isCodeElement(el) {
  if (el.closest(CODE_SELECTOR)) return true;
  // تشخیص بر اساس محتوای متن (اگر خیلی شبیه کد باشد)
  const text = el.textContent;
  if (text && text.length > 20 && isCodeLike(text)) return true;
  return false;
}

function hasBlockDescendant(el) {
  return el.querySelector(BLOCK_SELECTOR) !== null;
}

function directTextLength(el) {
  let len = 0;
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) len += node.textContent.trim().length;
  }
  return len > 0 ? len : el.textContent.trim().length;
}

// ============ تشخیص جهت ============

function detectDirection(text) {
  const rtlMatches = text.match(RTL_STRONG);
  const ltrMatches = text.match(LTR_STRONG);
  const rtlCount = rtlMatches ? rtlMatches.length : 0;
  const ltrCount = ltrMatches ? ltrMatches.length : 0;
  const total = rtlCount + ltrCount;

  if (total < settings.minStrongChars) return null;
  const ratio = rtlCount / total;
  return ratio >= settings.threshold ? "rtl" : "ltr";
}

function setDir(el, dir) {
  if (el.getAttribute("dir") !== dir) {
    el.setAttribute("dir", dir);
  }
}

function clearDir(el) {
  if (el.hasAttribute("dir")) el.removeAttribute("dir");
}

// ============ پردازش یک عنصر ============

function processElement(el) {
  try {
    if (!(el instanceof Element)) return;
    if (SKIP_TAGS.has(el.tagName)) return;
    if (isEditable(el)) return;

    if (settings.mode === "off") {
      clearDir(el);
      return;
    }

    // عناصر کد
    if (isCodeElement(el)) {
      setDir(el, "ltr");
      el.style.unicodeBidi = "plaintext";
      return;
    }

    // حالت‌های اجباری
    if (settings.mode === "ltr" || settings.mode === "rtl") {
      const text = el.textContent.trim();
      if (text.length === 0) return;
      setDir(el, settings.mode);
      return;
    }

    // حالت خودکار
    const text = el.textContent;
    if (!text || text.trim().length < 2) return;

    const signature = `${text.length}:${fastHash(text)}`;
    if (lastSignature.get(el) === signature) return;

    const dir = detectDirection(text);
    if (dir) {
      setDir(el, dir);
      lastSignature.set(el, signature);
    }
  } catch (error) {
    logError("processElement error:", error);
  }
}

// ============ جمع‌آوری عناصر نامزد (با پشتیبانی از Shadow DOM) ============

function collectCandidates(root) {
  const candidates = [];

  // پردازش خود ریشه اگر واجد شرایط باشد
  if (
    root instanceof Element &&
    root.matches(BLOCK_SELECTOR) &&
    !hasBlockDescendant(root)
  ) {
    candidates.push(root);
  }

  // جستجوی بلوک‌ها در داخل ریشه
  const blocks = root.querySelectorAll
    ? root.querySelectorAll(BLOCK_SELECTOR)
    : [];
  for (const el of blocks) {
    if (!hasBlockDescendant(el)) candidates.push(el);
  }

  // بلوک‌های کد (حتی تودرتو)
  const codeBlocks = root.querySelectorAll
    ? root.querySelectorAll(CODE_SELECTOR)
    : [];
  for (const el of codeBlocks) candidates.push(el);

  // برگ‌های عمومی (div/span با متن مستقیم)
  const genericLeaves = root.querySelectorAll
    ? root.querySelectorAll("div, span")
    : [];
  for (const el of genericLeaves) {
    if (
      el.children.length === 0 &&
      directTextLength(el) >= settings.minStrongChars
    ) {
      candidates.push(el);
    }
  }

  // ===== پشتیبانی از Shadow DOM (حالت open) =====
  if (root.querySelectorAll) {
    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      if (el.shadowRoot && el.shadowRoot.mode === "open") {
        const shadowCandidates = collectCandidates(el.shadowRoot);
        candidates.push(...shadowCandidates);
      }
    }
  }

  return candidates;
}

function processRoot(root) {
  try {
    const candidates = collectCandidates(root);
    for (const el of candidates) processElement(el);
  } catch (error) {
    logError("processRoot error:", error);
  }
}

// ============ اسکن اولیه با اولویت بندی ============

function processDocument() {
  if (idleHandle) return;
  const run = () => {
    idleHandle = null;
    if (document.body) {
      processRoot(document.body);
      // همچنین ریشه‌های شادو در سطح سند
      if (document.documentElement) {
        const allWithShadow = document.querySelectorAll("*");
        for (const el of allWithShadow) {
          if (el.shadowRoot && el.shadowRoot.mode === "open") {
            processRoot(el.shadowRoot);
          }
        }
      }
    }
    log("Initial scan complete");
  };

  if ("requestIdleCallback" in window) {
    idleHandle = requestIdleCallback(run, { timeout: 1500 });
  } else {
    idleHandle = setTimeout(run, 50);
  }
}

// ============ مشاهده تغییرات DOM (بهینه‌شده) ============

function scheduleMutationProcessing(node) {
  pendingRoots.add(node);
  clearTimeout(mutationTimer);
  // تأخیر کوتاه‌تر برای واکنش سریع‌تر
  mutationTimer = setTimeout(() => {
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    for (const root of roots) {
      if (root.isConnected === false && root !== document) continue;
      processRoot(root);
    }
  }, 150);
}

function observeChanges() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    if (settings.mode === "off") return;
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scheduleMutationProcessing(node);
            // همچنین Shadow DOM داخل گره اضافه‌شده
            if (node.shadowRoot && node.shadowRoot.mode === "open") {
              scheduleMutationProcessing(node.shadowRoot);
            }
          }
        }
      } else if (mutation.type === "characterData") {
        const target = mutation.target.parentElement;
        if (target) {
          lastSignature.delete(target);
          scheduleMutationProcessing(target);
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  return observer;
}

// ============ بارگذاری تنظیمات ============

async function loadSettings() {
  try {
    const host = currentHost();
    if (!isValidHost(host)) {
      settings = { ...DEFAULT_SETTINGS };
      return;
    }

    const [defaultsResult, hostsResult] = await Promise.all([
      safeStorageGet("sync", "smartDirectionDefaults"),
      safeStorageGet("local", "smartDirectionHosts"),
    ]);

    const globalDefaults = {
      ...DEFAULT_SETTINGS,
      ...(defaultsResult.smartDirectionDefaults || {}),
    };
    const hosts = hostsResult.smartDirectionHosts || {};
    const hostOverride = hosts[host];

    settings = { ...globalDefaults, ...(hostOverride || {}) };
    log("Settings loaded:", settings);
  } catch (error) {
    logError("loadSettings error:", error);
    settings = { ...DEFAULT_SETTINGS };
  }
}

function reapplyEverything() {
  // پاک کردن حافظه‌ی امضاها
  // (امضاها با تغییر تنظیمات نامعتبر می‌شوند)
  // اما WeakMap قابل پاک کردن نیست، پس با تغییر signature باعث می‌شویم دوباره محاسبه شود
  // بهتر است از یک شماره نسخه استفاده کنیم، اما برای سادگی، همه‌ی عناصر را دوباره پردازش می‌کنیم
  try {
    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (el.hasAttribute("dir") && settings.mode === "off") {
        clearDir(el);
      }
    }
    processRoot(document.body || document.documentElement);
    log("Reapplied settings");
  } catch (error) {
    logError("reapplyEverything error:", error);
  }
}

// ============ راه‌اندازی ============

async function init() {
  try {
    await loadSettings();
    processDocument();
    observeChanges();
    log("Content script initialized");
  } catch (error) {
    logError("Init error:", error);
  }
}

// ============ گوش‌دادن به پیام‌ها ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "smart-direction:apply-now") {
    loadSettings().then(() => {
      reapplyEverything();
      sendResponse({ ok: true, host: currentHost(), mode: settings.mode });
    });
    return true;
  }

  if (message?.type === "smart-direction:get-status") {
    sendResponse({ ok: true, host: currentHost(), mode: settings.mode });
    return true;
  }

  if (message?.type === "smart-direction:reload-settings") {
    loadSettings().then(() => {
      reapplyEverything();
      sendResponse({ ok: true });
    });
    return true;
  }
});

// ============ گوش‌دادن به تغییرات storage ============

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync" && area !== "local") return;
  await loadSettings();
  reapplyEverything();
});

// ============ اجرا ============

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
