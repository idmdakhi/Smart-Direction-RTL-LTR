/**
 * Smart Direction — Content Script (نسخه بهبودیافته با IntersectionObserver)
 * تشخیص هوشمند جهت با پشتیبانی از Shadow DOM، کارایی بالا، و مدیریت خطا
 */

const DEFAULT_SETTINGS = {
  mode: "auto",
  threshold: 0.4,
  minStrongChars: 3,
  autoDetectLanguage: true,
};

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

const RTL_STRONG =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
const LTR_STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/g;

// ============ توابع کمکی ============
async function safeStorageGet(area, keys) {
  try {
    return await chrome.storage[area].get(keys);
  } catch {
    return {};
  }
}

function isValidHost(host) {
  if (!host || typeof host !== "string") return false;
  return /^[a-zA-Z0-9.\-_]+$/.test(host);
}

const DEBUG = false;
function log(...args) {
  if (DEBUG) console.log("[SmartDirection]", ...args);
}
function logError(...args) {
  console.error("[SmartDirection]", ...args);
}

function fastHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function isCodeLike(text) {
  if (!text || text.length < 5) return false;
  const symbols = /[{}\[\]();=<>+\-*/%&|^~!]/g;
  const matches = text.match(symbols);
  if (!matches) return false;
  const ratio = matches.length / text.length;
  return ratio > 0.15;
}

// ============ وضعیت داخلی ============
let settings = { ...DEFAULT_SETTINGS };
const lastSignature = new WeakMap();
let idleHandle = null;
let mutationTimer = null;
const pendingRoots = new Set();
let observer = null;
let processedBlockCount = 0;
let whitelist = [];
let blacklist = [];
let intersectionObserver = null; // ⚡ جدید

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

// 🎯 تشخیص زبان صفحه
function detectPageLanguage() {
  try {
    // از تگ html
    const htmlLang = document.documentElement.lang;
    if (htmlLang) {
      const rtlLangs = ["fa", "ar", "he", "ur", "ku", "ps", "sd"];
      if (rtlLangs.some((lang) => htmlLang.startsWith(lang))) return "rtl";
      if (
        htmlLang.startsWith("en") ||
        htmlLang.startsWith("fr") ||
        htmlLang.startsWith("de") ||
        htmlLang.startsWith("es")
      )
        return "ltr";
    }

    // از متا تگ
    const meta = document.querySelector('meta[name="language"]');
    if (meta) {
      const lang = meta.content.toLowerCase();
      const rtlLangs = ["fa", "ar", "he", "ur", "ku", "ps", "sd"];
      if (rtlLangs.some((l) => lang.includes(l))) return "rtl";
      if (["en", "fr", "de", "es", "it", "pt"].some((l) => lang.includes(l)))
        return "ltr";
    }

    // از محتوای متن (حداقل ۲۰۰ کاراکتر)
    const textSample = document.body?.innerText?.slice(0, 500);
    if (textSample && textSample.length > 50) {
      const rtlMatches = textSample.match(RTL_STRONG);
      const ltrMatches = textSample.match(LTR_STRONG);
      const rtlCount = rtlMatches ? rtlMatches.length : 0;
      const ltrCount = ltrMatches ? ltrMatches.length : 0;
      const total = rtlCount + ltrCount;
      if (total > 10) {
        const ratio = rtlCount / total;
        if (ratio > 0.6) return "rtl";
        if (ratio < 0.4) return "ltr";
      }
    }
    return null;
  } catch {
    return null;
  }
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

    if (isCodeElement(el)) {
      setDir(el, "ltr");
      el.style.unicodeBidi = "plaintext";
      return;
    }

    if (settings.mode === "ltr" || settings.mode === "rtl") {
      const text = el.textContent.trim();
      if (text.length === 0) return;
      setDir(el, settings.mode);
      processedBlockCount++;
      return;
    }

    const text = el.textContent;
    if (!text || text.trim().length < 2) return;

    const signature = `${text.length}:${fastHash(text)}`;
    if (lastSignature.get(el) === signature) return;

    const dir = detectDirection(text);
    if (dir) {
      setDir(el, dir);
      lastSignature.set(el, signature);
      processedBlockCount++;
    }
  } catch (error) {
    logError("processElement error:", error);
  }
}

// ============ جمع‌آوری عناصر نامزد ============
function collectCandidates(root) {
  const candidates = [];

  if (
    root instanceof Element &&
    root.matches(BLOCK_SELECTOR) &&
    !hasBlockDescendant(root)
  ) {
    candidates.push(root);
  }

  const blocks = root.querySelectorAll
    ? root.querySelectorAll(BLOCK_SELECTOR)
    : [];
  for (const el of blocks) {
    if (!hasBlockDescendant(el)) candidates.push(el);
  }

  const codeBlocks = root.querySelectorAll
    ? root.querySelectorAll(CODE_SELECTOR)
    : [];
  for (const el of codeBlocks) candidates.push(el);

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

// ============ اسکن اولیه با IntersectionObserver ============
function processDocument() {
  if (idleHandle) return;

  // ⚡ استفاده از IntersectionObserver برای پردازش تدریجی
  if ("IntersectionObserver" in window && !intersectionObserver) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target;
            processElement(el);
            intersectionObserver.unobserve(el);
            // همچنین فرزندان را پردازش کن
            const children = el.querySelectorAll(BLOCK_SELECTOR);
            for (const child of children) {
              if (!hasBlockDescendant(child)) {
                processElement(child);
              }
            }
          }
        }
      },
      {
        root: null,
        rootMargin: "200px",
        threshold: 0.01,
      },
    );

    // مشاهده‌ی تمام عناصر بالقوه
    const allElements = document.querySelectorAll(
      `${BLOCK_SELECTOR}, ${CODE_SELECTOR}, div, span`,
    );
    for (const el of allElements) {
      if (el.children.length === 0 || el.matches(CODE_SELECTOR)) {
        intersectionObserver.observe(el);
      }
    }
  }

  // همچنین پردازش اولیه با IdleCallback
  const run = () => {
    idleHandle = null;
    if (document.body) {
      processRoot(document.body);
      // ریشه‌های شادو
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

// ============ مشاهده تغییرات DOM ============
function scheduleMutationProcessing(node) {
  pendingRoots.add(node);
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    for (const root of roots) {
      if (root.isConnected === false && root !== document) continue;
      processRoot(root);
      // ⚡ اضافه کردن به IntersectionObserver
      if (intersectionObserver && root instanceof Element) {
        const newElements = root.querySelectorAll(
          `${BLOCK_SELECTOR}, ${CODE_SELECTOR}, div, span`,
        );
        for (const el of newElements) {
          if (el.children.length === 0 || el.matches(CODE_SELECTOR)) {
            intersectionObserver.observe(el);
          }
        }
      }
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
            if (node.shadowRoot && node.shadowRoot.mode === "open") {
              scheduleMutationProcessing(node.shadowRoot);
            }
            // ⚡ اضافه کردن به IntersectionObserver
            if (intersectionObserver) {
              const newElements = node.querySelectorAll(
                `${BLOCK_SELECTOR}, ${CODE_SELECTOR}, div, span`,
              );
              for (const el of newElements) {
                if (el.children.length === 0 || el.matches(CODE_SELECTOR)) {
                  intersectionObserver.observe(el);
                }
              }
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
      whitelist = [];
      blacklist = [];
      return;
    }

    const [defaultsResult, hostsResult, whitelistResult, blacklistResult] =
      await Promise.all([
        safeStorageGet("sync", "smartDirectionDefaults"),
        safeStorageGet("local", "smartDirectionHosts"),
        safeStorageGet("local", "smartDirectionWhitelist"),
        safeStorageGet("local", "smartDirectionBlacklist"),
      ]);

    const globalDefaults = {
      ...DEFAULT_SETTINGS,
      ...(defaultsResult.smartDirectionDefaults || {}),
    };
    const hosts = hostsResult.smartDirectionHosts || {};
    const hostOverride = hosts[host];
    whitelist = whitelistResult.smartDirectionWhitelist || [];
    blacklist = blacklistResult.smartDirectionBlacklist || [];

    let settingsTemp = { ...globalDefaults, ...(hostOverride || {}) };

    // 📋 لیست‌های سفید/سیاه
    if (blacklist.includes(host)) {
      settingsTemp.mode = "off";
    } else if (whitelist.length > 0 && !whitelist.includes(host)) {
      settingsTemp.mode = "off";
    }

    // 🎯 تشخیص خودکار زبان (فقط اگر فعال باشد و override وجود نداشته باشد)
    if (settingsTemp.autoDetectLanguage && !hostOverride) {
      const detected = detectPageLanguage();
      if (detected) {
        settingsTemp.mode = detected;
        log("Detected language direction:", detected);
        // ارسال به background برای آمار
        chrome.runtime
          .sendMessage({
            type: "smart-direction:detected-language",
            host: host,
            direction: detected,
          })
          .catch(() => {});
      }
    }

    settings = settingsTemp;
    log("Settings loaded:", settings);
  } catch (error) {
    logError("loadSettings error:", error);
    settings = { ...DEFAULT_SETTINGS };
  }
}

function shouldProcess() {
  const host = currentHost();
  if (!host || !isValidHost(host)) return false;
  if (blacklist.includes(host)) return false;
  if (whitelist.length > 0 && !whitelist.includes(host)) return false;
  return true;
}

function reapplyEverything() {
  try {
    if (!shouldProcess()) {
      // اگر در لیست سیاه است، همه‌ی dirها را پاک کن
      const allElements = document.querySelectorAll("*");
      for (const el of allElements) {
        if (el.hasAttribute("dir")) clearDir(el);
      }
      return;
    }

    const allElements = document.querySelectorAll("*");
    for (const el of allElements) {
      if (el.hasAttribute("dir") && settings.mode === "off") {
        clearDir(el);
      }
    }
    processedBlockCount = 0;
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
    if (shouldProcess()) {
      processedBlockCount = 0;
      processDocument();
      observeChanges();
    }
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
      sendResponse({
        ok: true,
        host: currentHost(),
        mode: settings.mode,
        count: processedBlockCount,
      });
    });
    return true;
  }

  if (message?.type === "smart-direction:get-status") {
    sendResponse({
      ok: true,
      host: currentHost(),
      mode: settings.mode,
      count: processedBlockCount,
    });
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

// ============ تغییرات storage ============
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
