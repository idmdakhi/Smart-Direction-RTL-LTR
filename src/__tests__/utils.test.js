import { describe, it, expect } from "vitest";
import {
  fastHash,
  isValidHost,
  toPersianDigits,
  isCodeLike,
} from "../utils.js";

describe("utils.js — توابع کمکی", () => {
  // ---------- fastHash ----------
  describe("fastHash", () => {
    it("باید برای متن‌های یکسان، هش یکسان برگرداند", () => {
      const text = "Hello Smart Direction";
      expect(fastHash(text)).toBe(fastHash(text));
    });

    it("باید برای متن‌های متفاوت، هش متفاوت برگرداند (احتمال برخورد ناچیز)", () => {
      expect(fastHash("abc")).not.toBe(fastHash("def"));
    });

    it("باید برای رشته‌ی خالی، مقدار ۰ برگرداند", () => {
      expect(fastHash("")).toBe("0");
    });
  });

  // ---------- isValidHost ----------
  describe("isValidHost", () => {
    it("میزبان‌های معتبر را قبول کند", () => {
      expect(isValidHost("google.com")).toBe(true);
      expect(isValidHost("sub.domain.co.uk")).toBe(true);
      expect(isValidHost("my-site_123.ir")).toBe(true);
    });

    it("میزبان‌های نامعتبر را رد کند", () => {
      expect(isValidHost("")).toBe(false);
      expect(isValidHost(null)).toBe(false);
      expect(isValidHost("http://google.com")).toBe(false); // شامل اسلش
      expect(isValidHost("google.com/path")).toBe(false);
      expect(isValidHost("!@#$%")).toBe(false);
    });
  });

  // ---------- toPersianDigits ----------
  describe("toPersianDigits", () => {
    it("اعداد انگلیسی را به فارسی تبدیل کند", () => {
      expect(toPersianDigits("123")).toBe("۱۲۳");
      expect(toPersianDigits("0")).toBe("۰");
      expect(toPersianDigits("9876543210")).toBe("۹۸۷۶۵۴۳۲۱۰");
    });

    it("اعداد را درون متن تبدیل کند", () => {
      expect(toPersianDigits("نسخه 2.0")).toBe("نسخه ۲.۰");
    });
  });

  // ---------- isCodeLike ----------
  describe("isCodeLike", () => {
    it("متن‌های کدگونه را تشخیص دهد", () => {
      const code = "function test() { return true; }";
      expect(isCodeLike(code)).toBe(true);

      const html = '<div class="test">Hello</div>';
      expect(isCodeLike(html)).toBe(true);

      const json = '{"key": "value", "num": 42}';
      expect(isCodeLike(json)).toBe(true);
    });

    it("متن‌های معمولی را کد تشخیص ندهد", () => {
      const persian = "این یک متن معمولی فارسی است.";
      expect(isCodeLike(persian)).toBe(false);

      const english = "This is a normal English sentence.";
      expect(isCodeLike(english)).toBe(false);
    });

    it("برای متن‌های خیلی کوتاه false برگرداند", () => {
      expect(isCodeLike("{}")).toBe(false); // کمتر از ۵ کاراکتر
      expect(isCodeLike("a=1")).toBe(false);
    });
  });
});
