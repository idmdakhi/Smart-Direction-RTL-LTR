# Smart Direction — تشخیص هوشمند RTL/LTR

افزونه‌ی کروم (Manifest V3) که جهت متن هر بخش از صفحه را بر اساس محتوای واقعی تشخیص می‌دهد:
فارسی/عربی/اردو/پشتو → راست‌به‌چپ، انگلیسی/لاتین → چپ‌به‌راست، و **کدهای برنامه‌نویسی همیشه چپ‌به‌راست**.

## نصب (حالت توسعه‌دهنده)

1. این پوشه را نگه دارید (نیازی به build نیست).
2. به `chrome://extensions` بروید.
3. **Developer mode** را فعال کنید.
4. **Load unpacked** را بزنید و پوشه را انتخاب کنید.
5. آیکون را پین کنید.

## حالت‌ها

| حالت      | توضیح                              | بَج    |
| --------- | ---------------------------------- | ------ |
| خودکار    | تشخیص هوشمند بر اساس نسبت حروف قوی | A      |
| همیشه LTR | همه بلوک‌ها چپ‌به‌راست             | L      |
| همیشه RTL | همه بلوک‌ها راست‌به‌چپ             | R      |
| dir=auto  | تصمیم به الگوریتم Bidi مرورگر      | B      |
| خاموش     | بدون دخالت                         | (خالی) |

## میانبر

`Alt+Shift+D` — چرخش بین حالت‌ها + نمایش toast کوتاه.

قابل تغییر در `chrome://extensions/shortcuts`.

## تنظیمات

- **پاپ‌آپ**: حالت و آستانه برای سایت فعلی
- **Options**: پیش‌فرض سراسری + مدیریت overrideهای هر دامنه

## ساختار

```
smart-direction/
├── manifest.json
├── icons/
└── src/
├── background.js
├── content.js
├── popup.html / .css / .js
└── options.html / .css / .js
```

# اجرای

```bash
chmod +x pack.sh
./pack.sh

```

# خروجی

```
smart-direction-v0.3.0.zip
```

---

# اگر execution policy محدودیت دارد (یک‌بار):

```shell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

.\pack.ps1

# یا

.\pack.ps1 -Version 2.3.0
```
