/**
 * Smart Direction — content script
 * ---------------------------------------------------------------
 * برای هر بلوک متنیِ صفحه، جهت (rtl/ltr) را بر اساس نسبت کاراکترهای
 * "قوی" (حروف واقعی، نه رقم/علامت/فاصله) تشخیص می‌دهد و از طریق
 * ویژگی dir (نه استایل inline) اعمال می‌کند تا با CSS خودِ سایت
 * تداخل کمتری داشته باشد و رفتار آن با الگوریتم Bidi مرورگر هم‌خوان بماند.
 *
 * نکات کلیدی نسبت به نسخهٔ اول:
 *  - فقط "برگ‌های متنی" (بلوک‌هایی که خودشان فرزند بلوکی ندارند) پردازش
 *    می‌شوند، نه همهٔ اجداد و اَحفاد به‌طور تکراری.
 *  - نسبت RTL از روی حروف واقعی محاسبه می‌شود، نه از روی همهٔ کاراکترهای
 *    غیرفاصله (که رقم/علامت/ایموجی را هم به اشتباه به حساب می‌آورد).
 *  - المان‌های input/textarea/[contenteditable] هرگز دستکاری نمی‌شوند تا
 *    تایپ کاربر خراب نشود.
 *  - MutationObserver فقط زیردرخت تغییرکرده را دوباره پردازش می‌کند،
 *    نه کل صفحه را.
 *  - حالت (auto/ltr/rtl/off) و آستانهٔ تشخیص از storage خوانده می‌شود و
 *    می‌تواند به‌ازای هر دامنه override شود.
 */

(() => {
  "use strict";

  // ------------------------------------------------------------------
  // پیکربندی
  // ------------------------------------------------------------------

  const DEFAULT_SETTINGS = {
    mode: "auto", // "auto" | "ltr" | "rtl" | "off"
    threshold: 0.4, // نسبت لازم برای تشخیص RTL (۰ تا ۱)
    minStrongChars: 3, // حداقل تعداد حروف "قوی" لازم برای تصمیم‌گیری
  };

  const RTL_STRONG = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
  const LTR_STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/g;

  const BLOCK_SELECTOR = [
    "p", "li", "td", "th", "blockquote", "figcaption", "dd", "dt",
    "h1", "h2", "h3", "h4", "h5", "h6", "caption", "summary",
    "label", "legend", "button", "a",
  ].join(",");

  const CODE_SELECTOR = [
    "code", "pre", "samp", "kbd", "var", "tt",
    ".hljs", ".prettyprint", ".source-code", ".code-block",
    "[class*='language-']", "[class*='CodeMirror']", ".cm-editor",
    ".monaco-editor",
  ].join(",");

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "SVG", "TEXTAREA", "INPUT", "SELECT",
    "OPTION", "IFRAME", "CANVAS", "TEMPLATE",
  ]);

  // ------------------------------------------------------------------
  // وضعیت داخلی
  // ------------------------------------------------------------------

  let settings = { ...DEFAULT_SETTINGS };
  /** @type {WeakMap<Element, string>} امضای آخرین متنی که پردازش شده (برای جلوگیری از کار تکراری) */
  const lastSignature = new WeakMap();
  let idleHandle = null;
  let mutationTimer = null;
  const pendingRoots = new Set();

  // ------------------------------------------------------------------
  // بارگذاری تنظیمات (سراسری + override به‌ازای دامنه)
  // ------------------------------------------------------------------

  function currentHost() {
    try {
      return location.hostname || "";
    } catch {
      return "";
    }
  }

  async function loadSettings() {
    const [{ smartDirectionDefaults } = {}, hostMap] = await Promise.all([
      chrome.storage.sync.get("smartDirectionDefaults"),
      chrome.storage.local.get("smartDirectionHosts"),
    ]);

    const globalDefaults = { ...DEFAULT_SETTINGS, ...(smartDirectionDefaults || {}) };
    const hosts = (hostMap && hostMap.smartDirectionHosts) || {};
    const hostOverride = hosts[currentHost()];

    settings = { ...globalDefaults, ...(hostOverride || {}) };
  }

  // ------------------------------------------------------------------
  // تشخیص جهت
  // ------------------------------------------------------------------

  function isEditable(el) {
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function isCodeElement(el) {
    return el.closest(CODE_SELECTOR) !== null;
  }

  /** آیا این عنصر یکی از فرزندانش هم جزو BLOCK_SELECTOR است؟ اگر بله، پردازش را به فرزند واگذار می‌کنیم. */
  function hasBlockDescendant(el) {
    return el.querySelector(BLOCK_SELECTOR) !== null;
  }

  function directTextLength(el) {
    let len = 0;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) len += node.textContent.trim().length;
    }
    // اگر متن مستقیم نداشت، از textContent کلی (فرزندان inline مثل <b>/<em>) استفاده کن
    return len > 0 ? len : el.textContent.trim().length;
  }

  function detectDirection(text) {
    const rtlMatches = text.match(RTL_STRONG);
    const ltrMatches = text.match(LTR_STRONG);
    const rtlCount = rtlMatches ? rtlMatches.length : 0;
    const ltrCount = ltrMatches ? ltrMatches.length : 0;
    const total = rtlCount + ltrCount;

    if (total < settings.minStrongChars) return null; // داده کافی نیست، دست‌نخورده بگذار

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

  /** یک عنصر را طبق حالت فعلی تنظیمات پردازش می‌کند */
  function processElement(el) {
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
      return;
    }

    // mode === "auto"
    const text = el.textContent;
    if (!text || text.trim().length < 2) return;

    const signature = `${text.length}:${text.slice(0, 40)}`;
    if (lastSignature.get(el) === signature) return; // چیزی تغییر نکرده

    const dir = detectDirection(text);
    if (dir) {
      setDir(el, dir);
      lastSignature.set(el, signature);
    }
  }

  /**
   * یک ریشه (کل سند یا زیردرختِ تازه‌اضافه‌شده) را برای بلوک‌های قابل
   * پردازش می‌گردد. فقط "برگ‌ها" (بلوک‌هایی که خودشان بلوک تودرتو ندارند)
   * انتخاب می‌شوند تا از پردازش تکراری اجداد/اَحفاد جلوگیری شود.
   */
  function collectCandidates(root) {
    const candidates = [];

    if (root instanceof Element && root.matches(BLOCK_SELECTOR) && !hasBlockDescendant(root)) {
      candidates.push(root);
    }

    const blocks = root.querySelectorAll ? root.querySelectorAll(BLOCK_SELECTOR) : [];
    for (const el of blocks) {
      if (!hasBlockDescendant(el)) candidates.push(el);
    }

    // بلوک‌های کد همیشه جدا بررسی می‌شوند (حتی اگر تودرتو باشند)
    const codeBlocks = root.querySelectorAll ? root.querySelectorAll(CODE_SELECTOR) : [];
    for (const el of codeBlocks) candidates.push(el);

    // "برگ‌های" div/span بدون فرزند عنصری که مستقیماً متن دارند (مثل کامپوننت‌های ساخته‌شده با div)
    const genericLeaves = root.querySelectorAll ? root.querySelectorAll("div, span") : [];
    for (const el of genericLeaves) {
      if (el.children.length === 0 && directTextLength(el) >= settings.minStrongChars) {
        candidates.push(el);
      }
    }

    return candidates;
  }

  function processRoot(root) {
    const candidates = collectCandidates(root);
    for (const el of candidates) processElement(el);
  }

  function processDocument() {
    if (idleHandle) return; // یک اسکن کامل در حال انتظار/اجراست
    const run = () => {
      idleHandle = null;
      processRoot(document.body || document.documentElement);
    };
    if ("requestIdleCallback" in window) {
      idleHandle = requestIdleCallback(run, { timeout: 1500 });
    } else {
      idleHandle = setTimeout(run, 50);
    }
  }

  // ------------------------------------------------------------------
  // مشاهدهٔ تغییرات DOM (فقط زیردرخت تغییرکرده پردازش می‌شود)
  // ------------------------------------------------------------------

  function scheduleMutationProcessing(node) {
    pendingRoots.add(node);
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      for (const root of roots) {
        if (root.isConnected === false && root !== document) continue;
        processRoot(root);
      }
    }, 250);
  }

  function observeChanges() {
    const observer = new MutationObserver((mutations) => {
      if (settings.mode === "off") return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) scheduleMutationProcessing(node);
          }
        } else if (mutation.type === "characterData") {
          const target = mutation.target.parentElement;
          if (target) {
            lastSignature.delete(target); // مجبورش کن دوباره حساب کند
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

  // ------------------------------------------------------------------
  // اجرا و ارتباط با popup/background
  // ------------------------------------------------------------------

  function reapplyEverything() {
    // با تغییر تنظیمات، امضاهای قبلی دیگر معتبر نیستند
    document.querySelectorAll("[dir]").forEach((el) => {
      if (settings.mode === "off") clearDir(el);
    });
    processRoot(document.body || document.documentElement);
  }

  async function init() {
    await loadSettings();
    processDocument();
    observeChanges();
  }

  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== "sync" && area !== "local") return;
    await loadSettings();
    reapplyEverything();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "smart-direction:apply-now") {
      loadSettings().then(() => {
        reapplyEverything();
        sendResponse({ ok: true, host: currentHost(), mode: settings.mode });
      });
      return true; // پاسخ async
    }
    if (message?.type === "smart-direction:get-status") {
      sendResponse({ ok: true, host: currentHost(), mode: settings.mode });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
