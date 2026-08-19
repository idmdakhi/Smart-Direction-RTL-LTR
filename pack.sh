#!/usr/bin/env bash
# pack.sh — بسته‌بندی Smart Direction به صورت ZIP تمیز
# استفاده: ./pack.sh          → می‌سازد smart-direction-vVERSION.zip
#          ./pack.sh 2.3.0    → نسخه را دستی مشخص می‌کند

set -euo pipefail

# مسیر ریشهٔ پروژه (همان جایی که این اسکریپت و manifest.json هستند)
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# خواندن نسخه از manifest.json (اگر آرگومان داده نشده باشد)
if [[ -n "${1:-}" ]]; then
  VERSION="$1"
else
  VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' manifest.json \
            | head -1 \
            | sed 's/.*"\([0-9.]*\)".*/\1/')
fi

if [[ -z "$VERSION" ]]; then
  echo "❌ نتوانستم نسخه را از manifest.json بخوانم. نسخه را دستی بدهید: ./pack.sh 0.3.0"
  exit 1
fi

OUT_NAME="smart-direction-v${VERSION}.zip"
OUT_PATH="${ROOT}/${OUT_NAME}"
STAGE="${ROOT}/.pack-stage"

# پاک‌سازی قبلی
rm -rf "$STAGE"
rm -f "$OUT_PATH"
mkdir -p "$STAGE/smart-direction"

echo "📦 در حال بسته‌بندی نسخه ${VERSION} ..."

# کپی فایل‌های لازم
cp manifest.json "$STAGE/smart-direction/"

# آیکون‌ها
if [[ -d icons ]]; then
  mkdir -p "$STAGE/smart-direction/icons"
  cp icons/icon16.png icons/icon48.png icons/icon128.png "$STAGE/smart-direction/icons/" 2>/dev/null || true
fi

# سورس
if [[ -d src ]]; then
  mkdir -p "$STAGE/smart-direction/src"
  cp src/background.js \
     src/content.js \
     src/popup.html src/popup.css src/popup.js \
     src/options.html src/options.css src/options.js \
     "$STAGE/smart-direction/src/"
fi

# اختیاری
[[ -f LICENSE ]] && cp LICENSE "$STAGE/smart-direction/"
[[ -f README.md ]] && cp README.md "$STAGE/smart-direction/"

# ساخت ZIP (از داخل stage تا ساختار درست باشد)
(
  cd "$STAGE"
  zip -r -q "$OUT_PATH" smart-direction \
    -x "*.DS_Store" -x "*__MACOSX*" -x "*.git*" -x "*node_modules*"
)

# پاک‌سازی موقت
rm -rf "$STAGE"

# نتیجه
SIZE=$(du -h "$OUT_PATH" | cut -f1)
echo ""
echo "✅ بسته آماده شد:"
echo "   $OUT_PATH"
echo "   حجم: $SIZE"
echo ""
echo "محتوای بسته:"
unzip -l "$OUT_PATH" | sed 's/^/   /'