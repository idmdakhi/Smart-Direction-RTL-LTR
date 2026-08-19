/**
 * Smart Direction — Utilities
 * توابع عمومی، مدیریت خطا، و عملیات ذخیره‌سازی امن
 */

// ============ ذخیره‌سازی امن ============

export async function safeStorageGet(area, keys) {
  try {
    return await chrome.storage[area].get(keys);
  } catch (error) {
    console.warn("[SmartDirection] Storage get error:", error);
    return {};
  }
}

export async function safeStorageSet(area, items) {
  try {
    await chrome.storage[area].set(items);
    return true;
  } catch (error) {
    console.warn("[SmartDirection] Storage set error:", error);
    return false;
  }
}

// ============ اعتبارسنجی میزبان ============

export function isValidHost(host) {
  if (!host || typeof host !== "string") return false;
  // فقط کاراکترهای مجاز: حروف، اعداد، نقطه، خط تیره، زیرخط
  return /^[a-zA-Z0-9.\-_]+$/.test(host);
}

// ============ مدیریت لاگ ============

const DEBUG = process.env.NODE_ENV === "development" || false;

export function log(...args) {
  if (DEBUG) console.log("[SmartDirection]", ...args);
}

export function logError(...args) {
  console.error("[SmartDirection]", ...args);
}

// ============ هش سریع برای امضای متن ============

export function fastHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// ============ تشخیص حالت‌های خاص ============

export function isCodeLike(text) {
  if (!text || text.length < 5) return false;
  const symbols = /[{}\[\]();=<>+\-*/%&|^~!]/g;
  const matches = text.match(symbols);
  if (!matches) return false;
  const ratio = matches.length / text.length;
  return ratio > 0.15; // بیش از ۱۵٪ نمادهای برنامه‌نویسی
}

// ============ تبدیل اعداد به فارسی ============

export function toPersianDigits(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}
