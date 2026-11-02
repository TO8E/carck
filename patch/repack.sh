#!/bin/bash
# 用法: ./patch_ipa.sh <vmaddr_hex> <new_bytes_hex_le>
# 例:   ./patch_ipa.sh 0x100004244 "1f2003d5"
set -euo pipefail

SRC_IPA="/Users/tobe/Desktop/demo/baiyun/白云天气_2.81.ipa"
WORK="/tmp/wc_patch"
OUT="/Users/tobe/Desktop/demo/baiyun/白云天气_2.81_patched.ipa"

VMADDR="${1:-0x100004e68}"
NEWBYTES="${2:-1f2003d5}"

rm -rf "$WORK"; mkdir -p "$WORK"
unzip -q "$SRC_IPA" -d "$WORK"

APP="$WORK/Payload/WhiteCloud.app"
BIN="$APP/WhiteCloud"
[ -f "$BIN" ] || { echo "binary not found"; exit 1; }

# vmaddr -> file offset  (__TEXT vmaddr 0x100000000, fileoff 0)
ADDR=$((VMADDR))
OFF=$((ADDR - 0x100000000))

echo "patching file offset $(printf 0x%x $OFF)"
python3 - "$BIN" "$OFF" "$NEWBYTES" <<'PY'
import sys
p, off, hx = sys.argv[1], int(sys.argv[2]), sys.argv[3]
data = bytearray(open(p,'rb').read())
new = bytes.fromhex(hx)
print('  old:', data[off:off+len(new)].hex())
data[off:off+len(new)] = new
print('  new:', data[off:off+len(new)].hex())
open(p,'wb').write(data)
PY

# 去掉旧的签名产物
find "$APP" -name "_CodeSignature" -type d -prune -exec rm -rf {} + 2>/dev/null || true

# 先签 frameworks / dylibs，再签主程序与 app
if [ -d "$APP/Frameworks" ]; then
  find "$APP/Frameworks" -maxdepth 1 -mindepth 1 \( -name "*.framework" -o -name "*.dylib" \) -print0 |
  while IFS= read -r -d '' f; do
    codesign --force --sign - --timestamp=none "$f" >/dev/null 2>&1 || echo "  sign fail: $f"
  done
fi
codesign --force --sign - --timestamp=none "$APP" 2>&1 | tail -2

# 校验
codesign -v "$APP" && echo "codesign OK"

# 打包
rm -f "$OUT"
(cd "$WORK" && zip -qry "$OUT" Payload)
ls -lh "$OUT"
echo "done -> $OUT"
