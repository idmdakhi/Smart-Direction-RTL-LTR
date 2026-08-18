# Smart Direction — تشخیص هوشمند RTL/LTR

افزونه‌ی کروم (Manifest V3) که جهت متن هر بخش از صفحه را بر اساس محتوای واقعی آن تشخیص می‌دهد:
فارسی/عربی/عبری → راست‌به‌چپ، انگلیسی/لاتین → چپ‌به‌راست، و **کدهای برنامه‌نویسی همیشه چپ‌به‌راست** —
حتی اگر داخل یک صفحه‌ی کاملاً فارسی باشند.

---

## ویژگی‌های نسخه ۲.۱

- ✅ تشخیص هوشمند مبتنی بر حروف قوی (نه رقم و علامت)
- ✅ پشتیبانی از `Shadow DOM` (حالت open)
- ✅ تشخیص خودکار بلوک‌های کد (حتی بدون کلاس خاص)
- ✅ عملکرد بهینه با `MutationObserver` و پردازش تدریجی
- ✅ تنظیمات به‌ازای هر دامنه + پیش‌فرض سراسری
- ✅ بَدج پویا روی آیکون (A/L/R/خالی)
- ✅ پشتیبانی از iframe
- ✅ مدیریت خطا و لاگ‌گیری پیشرفته
- ✅ رابط کاربری بهبودیافته با نمایش وضعیت فعلی

---

## نصب (حالت توسعه‌دهنده)

1. این پوشه را همین‌طور که هست نگه دارید.
2. در کروم به آدرس `chrome://extensions` بروید.
3. **حالت توسعه‌دهنده** را فعال کنید.
4. روی **Load unpacked** بزنید و پوشه را انتخاب کنید.
5. آیکون را پین کنید تا بَدج را ببینید.

---

## استفاده

روی آیکون کلیک کنید تا پاپ‌آپ باز شود:

- **حالت**: خودکار / همیشه LTR / همیشه RTL / خاموش
- **آستانه**: درصد حروف RTL مورد نیاز برای تشخیص (پیش‌فرض ۴۰٪)
- **پیش‌فرض برای همه‌ی سایت‌ها**: با تیک زدن، تنظیم سراسری می‌شود.
- **حذف تنظیم اختصاصی**: override محلی را پاک می‌کند.

---

## ساختار پروژه

```
smart-direction/
├── manifest.json
├── icons/
│ ├── icon16.png
│ ├── icon48.png
│ └── icon128.png
└── src/
├── content.js
├── background.js
├── popup.html
├── popup.css
├── popup.js
├── utils.js ← توابع کمکی
└── config.js ← تنظیمات مرکزی
```

---

## توسعه

برای مشارکت، لطفاً `CONTRIBUTING.md` را مطالعه کنید.

---

## مجوز

MIT

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

---

# مسیر تقریبی روی ویندوز:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --pack-extension="D:\DevOps\js\Smart-Direction-RTL-LTR" --pack-extension-key="D:\path\to\smart-direction.pem"

---

npm install -g crx
crx pack ./smart-direction -o smart-direction.crx -p key.pem
```
