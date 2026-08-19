/**
 * Smart Direction — Central Configuration
 * تمام ثابت‌ها و تنظیمات پیش‌فرض در اینجا متمرکز شده‌اند
 */

export const DEFAULT_SETTINGS = {
  mode: "auto", // "auto" | "ltr" | "rtl" | "off"
  threshold: 0.4, // نسبت RTL لازم برای تشخیص (۰ تا ۱)
  minStrongChars: 3, // حداقل حروف قوی برای تصمیم‌گیری
};

export const BADGE_TEXT = {
  auto: "A",
  ltr: "L",
  rtl: "R",
  off: "",
};

export const BADGE_COLOR = {
  auto: "#2F7D6E",
  ltr: "#3B6CB4",
  rtl: "#B4553B",
  off: "#8A8A8A",
};

// انتخاب‌گرهای بلوک‌های متنی
export const BLOCK_SELECTOR = [
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
export const CODE_SELECTOR = [
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
export const SKIP_TAGS = new Set([
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
export const RTL_STRONG =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
export const LTR_STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/g;
