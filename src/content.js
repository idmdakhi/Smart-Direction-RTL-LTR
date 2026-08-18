/**
 * Smart Direction — content script (v2.3)
 * تشخیص جهت بر اساس حروف قوی RTL/LTR، اعمال با ویژگی dir،
 * نگه‌داشتن کد همیشه LTR، پردازش کامنت‌های فارسی داخل کد،
 * پشتیبانی از Shadow DOM باز، حالت dir=auto، و toast میانبر.
 */

(() => {
  "use strict";

  const DEFAULT_SETTINGS = {
    mode: "auto",
    threshold: 0.4,
    minStrongChars: 3,
  };

  // حروف قوی RTL — عبری، عربی (فارسی/اردو/پشتو/سندی/کردی)، سریانی،
  // ثانا، N’Ko، سامری، مندایی و فرم‌های ارائه‌ای عربی
  const RTL_STRONG =
    /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0800-\u083F\u0840-\u085F\u0860-\u086F\u0870-\u089F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;

  // حروف قوی LTR
  const LTR_STRONG =
    /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0500-\u052F]/g;

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
    "article",
    "section",
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
    ".cm-content",
    ".CodeMirror-code",
    "[data-lang]",
    ".highlight",
    ".syntaxhighlighter",
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
    "MATH",
  ]);

  const MODE_LABELS = {
    auto: "خودکار (هوشمند)",
    ltr: "همیشه LTR",
    rtl: "همیشه RTL",
    browser: "خودکار مرورگر (dir=auto)",
    off: "خاموش",
  };

  let settings = { ...DEFAULT_SETTINGS };
  /** @type {WeakMap<Element, string>} */
  const lastSignature = new WeakMap();
  let idleHandle = null;
  let mutationTimer = null;
  const pendingRoots = new Set();

  // ------------------------------------------------------------------
  // تنظیمات
  // ------------------------------------------------------------------

  function currentHost() {
    try {
      return location.hostname || "";
    } catch {
      return "";
    }
  }

  async function loadSettings() {
    try {
      const [{ smartDirectionDefaults } = {}, hostMap] = await Promise.all([
        chrome.storage.sync.get("smartDirectionDefaults"),
        chrome.storage.local.get("smartDirectionHosts"),
      ]);
      const globalDefaults = {
        ...DEFAULT_SETTINGS,
        ...(smartDirectionDefaults || {}),
      };
      const hosts = (hostMap && hostMap.smartDirectionHosts) || {};
      const hostOverride = hosts[currentHost()];
      settings = { ...globalDefaults, ...(hostOverride || {}) };
    } catch {
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  // ------------------------------------------------------------------
  // تشخیص جهت
  // ------------------------------------------------------------------

  function isEditable(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function isCodeElement(el) {
    return el.closest(CODE_SELECTOR) !== null;
  }

  function hasBlockDescendant(el) {
    try {
      return el.querySelector(BLOCK_SELECTOR) !== null;
    } catch {
      return false;
    }
  }

  function directTextLength(el) {
    let len = 0;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        len += node.textContent.trim().length;
      }
    }
    return len > 0 ? len : (el.textContent || "").trim().length;
  }

  function detectDirection(text) {
    if (!text) return null;
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

  // ------------------------------------------------------------------
  // پردازش المان
  // ------------------------------------------------------------------

  function processElement(el) {
    if (!(el instanceof Element)) return;
    if (SKIP_TAGS.has(el.tagName)) return;
    if (isEditable(el)) return;

    if (settings.mode === "off") {
      clearDir(el);
      if (el.style.unicodeBidi === "plaintext") el.style.unicodeBidi = "";
      return;
    }

    if (isCodeElement(el)) {
      setDir(el, "ltr");
      el.style.unicodeBidi = "plaintext";
      processCodeComments(el);
      return;
    }

    if (settings.mode === "ltr" || settings.mode === "rtl") {
      const text = (el.textContent || "").trim();
      if (text.length === 0) return;
      setDir(el, settings.mode);
      return;
    }

    if (settings.mode === "browser") {
      const text = (el.textContent || "").trim();
      if (text.length === 0) return;
      setDir(el, "auto");
      return;
    }

    // mode === "auto"
    const text = el.textContent || "";
    if (!text || text.trim().length < 2) return;

    const signature = `${text.length}:${text.slice(0, 48)}:${settings.threshold}:${settings.minStrongChars}`;
    if (lastSignature.get(el) === signature) return;

    const dir = detectDirection(text);
    if (dir) {
      setDir(el, dir);
      lastSignature.set(el, signature);
    }
  }

  function processCodeComments(codeEl) {
    if (settings.mode === "off") return;

    const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        const t = node.textContent || "";
        if (t.trim().length < 4) return NodeFilter.FILTER_REJECT;
        const rtl = (t.match(RTL_STRONG) || []).length;
        const ltr = (t.match(LTR_STRONG) || []).length;
        if (rtl === 0 || rtl < ltr) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodesToWrap = [];
    let node;
    while ((node = walker.nextNode())) {
      nodesToWrap.push(node);
    }

    for (const textNode of nodesToWrap) {
      const parent = textNode.parentElement;
      if (!parent || parent.dataset.sdComment === "1") continue;
      if (parent.tagName === "SPAN" && parent.getAttribute("dir") === "rtl")
        continue;

      const span = document.createElement("span");
      span.setAttribute("dir", "rtl");
      span.dataset.sdComment = "1";
      span.style.unicodeBidi = "isolate";
      textNode.parentNode.insertBefore(span, textNode);
      span.appendChild(textNode);
    }
  }

  // ------------------------------------------------------------------
  // جمع‌آوری کاندیداها (شامل Shadow DOM باز)
  // ------------------------------------------------------------------

  function collectFromRoot(root, candidates) {
    if (!root) return;

    if (
      root instanceof Element &&
      root.matches?.(BLOCK_SELECTOR) &&
      !hasBlockDescendant(root)
    ) {
      candidates.push(root);
    }

    try {
      const blocks = root.querySelectorAll?.(BLOCK_SELECTOR) || [];
      for (const el of blocks) {
        if (!hasBlockDescendant(el)) candidates.push(el);
      }

      const codeBlocks = root.querySelectorAll?.(CODE_SELECTOR) || [];
      for (const el of codeBlocks) candidates.push(el);

      const generics = root.querySelectorAll?.("div, span") || [];
      for (const el of generics) {
        if (
          el.children.length === 0 &&
          directTextLength(el) >= settings.minStrongChars
        ) {
          candidates.push(el);
        }
      }

      const all = root.querySelectorAll?.("*") || [];
      for (const el of all) {
        if (el.shadowRoot) {
          collectFromRoot(el.shadowRoot, candidates);
        }
      }
    } catch {}
  }

  function collectCandidates(root) {
    const candidates = [];
    collectFromRoot(root, candidates);
    return candidates;
  }

  function processRoot(root) {
    if (!root) return;
    const candidates = collectCandidates(root);
    for (const el of candidates) {
      try {
        processElement(el);
      } catch {}
    }
  }

  function processDocument() {
    if (idleHandle) return;
    const run = () => {
      idleHandle = null;
      const root = document.body || document.documentElement;
      if (root) processRoot(root);
    };
    if ("requestIdleCallback" in window) {
      idleHandle = requestIdleCallback(run, { timeout: 1200 });
    } else {
      idleHandle = setTimeout(run, 40);
    }
  }

  // ------------------------------------------------------------------
  // MutationObserver
  // ------------------------------------------------------------------

  function scheduleMutationProcessing(node) {
    if (!node) return;
    pendingRoots.add(node);
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      for (const root of roots) {
        if (root.isConnected === false && root !== document) continue;
        processRoot(root);
      }
    }, 200);
  }

  function observeChanges() {
    const observer = new MutationObserver((mutations) => {
      if (settings.mode === "off") return;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              scheduleMutationProcessing(node);
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

    const observeTarget = document.documentElement || document.body;
    if (observeTarget) {
      observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return observer;
  }

  // ------------------------------------------------------------------
  // Toast
  // ------------------------------------------------------------------

  function showToast(mode) {
    const old = document.getElementById("smart-direction-toast");
    if (old) old.remove();

    const toast = document.createElement("div");
    toast.id = "smart-direction-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.textContent = `Smart Direction: ${MODE_LABELS[mode] || mode}`;

    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(12px)",
      background: "rgba(27, 35, 33, 0.92)",
      color: "#f6f5f1",
      padding: "10px 18px",
      borderRadius: "10px",
      fontSize: "13px",
      fontFamily: '"Segoe UI", Tahoma, system-ui, sans-serif',
      zIndex: "2147483647",
      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
      opacity: "0",
      transition: "opacity 0.2s ease, transform 0.2s ease",
      pointerEvents: "none",
      direction: "rtl",
      maxWidth: "90vw",
      textAlign: "center",
    });

    (document.body || document.documentElement).appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(8px)";
      setTimeout(() => toast.remove(), 250);
    }, 2000);
  }

  // ------------------------------------------------------------------
  // اجرا و ارتباط
  // ------------------------------------------------------------------

  function reapplyEverything() {
    if (settings.mode === "off") {
      document.querySelectorAll("[dir]").forEach((el) => {
        clearDir(el);
        if (el.style.unicodeBidi === "plaintext") el.style.unicodeBidi = "";
      });
      document.querySelectorAll("span[data-sd-comment='1']").forEach((span) => {
        const parent = span.parentNode;
        if (parent) {
          while (span.firstChild) parent.insertBefore(span.firstChild, span);
          parent.removeChild(span);
        }
      });
    }
    if (settings.mode === "off") {
    }
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
        if (message.showToast && message.mode) {
          showToast(message.mode);
        }
        sendResponse({ ok: true, host: currentHost(), mode: settings.mode });
      });
      return true;
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
