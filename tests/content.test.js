// در انتهای فایل src/utils.js این تابع را اضافه کنید:
import { RTL_STRONG, LTR_STRONG } from "./config.js";

export function detectDirection(text, threshold, minStrongChars) {
  const rtlMatches = text.match(RTL_STRONG);
  const ltrMatches = text.match(LTR_STRONG);
  const rtlCount = rtlMatches ? rtlMatches.length : 0;
  const ltrCount = ltrMatches ? ltrMatches.length : 0;
  const total = rtlCount + ltrCount;

  if (total < minStrongChars) return null;
  const ratio = rtlCount / total;
  return ratio >= threshold ? "rtl" : "ltr";
}
import { describe, it, expect } from "vitest";
import { detectDirection } from "./utils.js";

describe("content.js — منطق تشخیص جهت", () => {
  const THRESHOLD = 0.4;
  const MIN_CHARS = 3;

  // ---------- detectDirection ----------
  describe("detectDirection", () => {
    it("متن کاملاً فارسی را RTL تشخیص دهد", () => {
      const result = detectDirection("سلام دنیا", THRESHOLD, MIN_CHARS);
      expect(result).toBe("rtl");
    });

    it("متن کاملاً انگلیسی را LTR تشخیص دهد", () => {
      const result = detectDirection("Hello World", THRESHOLD, MIN_CHARS);
      expect(result).toBe("ltr");
    });

    it("متن آمیخته با غالب فارسی را RTL تشخیص دهد (>۴۰%)", () => {
      const mixed = "این یک متن فارسی است with some English";
      const result = detectDirection(mixed, THRESHOLD, MIN_CHARS);
      expect(result).toBe("rtl");
    });

    it("متن آمیخته با غالب انگلیسی را LTR تشخیص دهد (<۴۰%)", () => {
      const mixed = "This is English text با کمی فارسی";
      const result = detectDirection(mixed, THRESHOLD, MIN_CHARS);
      expect(result).toBe("ltr");
    });

    it("اگر تعداد حروف قوی کمتر از حداقل باشد، null برگرداند", () => {
      const result = detectDirection("۱۲۳", THRESHOLD, 3); // فقط عدد
      expect(result).toBe(null);

      const result2 = detectDirection("ا", THRESHOLD, 3); // یک حرف
      expect(result2).toBe(null);
    });

    it("اعداد و علائم را در محاسبه نادیده بگیرد", () => {
      // "سلام" = ۴ حرف RTL, "123" = ۳ رقم (نادیده گرفته شوند)
      const text = "سلام 123 !@#";
      const result = detectDirection(text, THRESHOLD, MIN_CHARS);
      expect(result).toBe("rtl");
    });

    it("با آستانه‌های مختلف، رفتار متفاوتی داشته باشد", () => {
      const mixed = "این A است"; // ۲ حرف RTL (ای, ا) و ۱ حرف LTR (A) => نسبت ۶۶٪

      expect(detectDirection(mixed, 0.5, MIN_CHARS)).toBe("rtl"); // ۶۶٪ > ۵۰٪
      expect(detectDirection(mixed, 0.8, MIN_CHARS)).toBe("ltr"); // ۶۶٪ < ۸۰٪
    });
  });
});
