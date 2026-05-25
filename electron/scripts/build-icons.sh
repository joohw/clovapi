#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$ROOT_DIR/assets"
ICONSET_DIR="$ASSETS_DIR/app-icon.iconset"
SOURCE_SVG="$ASSETS_DIR/app-icon.svg"
BASE_PNG="$ASSETS_DIR/app-icon-1024.png"
ICNS_OUT="$ASSETS_DIR/icon.icns"
ICO_OUT="$ASSETS_DIR/icon.ico"
PYTHON_BIN=""

for candidate in ${(f)"$(which -a python3 2>/dev/null)"}; do
  if "$candidate" - <<'PY' >/dev/null 2>&1
from PIL import Image
PY
  then
    PYTHON_BIN="$candidate"
    break
  fi
done

if [[ -z "$PYTHON_BIN" ]]; then
  echo "Unable to find a python3 with Pillow installed for ICO generation." >&2
  exit 1
fi

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

qlmanage -t -s 1024 -o "$ASSETS_DIR" "$SOURCE_SVG" >/dev/null 2>&1
mv "$ASSETS_DIR/app-icon.svg.png" "$BASE_PNG"

cp "$BASE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"
sips -z 512 512 "$BASE_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 512 512 "$BASE_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
sips -z 256 256 "$BASE_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 256 256 "$BASE_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
sips -z 128 128 "$BASE_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 128 128 "$BASE_PNG" --out "$ICONSET_DIR/icon_64x64@2x.png" >/dev/null
sips -z 64 64 "$BASE_PNG" --out "$ICONSET_DIR/icon_64x64.png" >/dev/null
sips -z 64 64 "$BASE_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
sips -z 32 32 "$BASE_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 32 32 "$BASE_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
sips -z 16 16 "$BASE_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_OUT"

"$PYTHON_BIN" - "$BASE_PNG" "$ICO_OUT" <<'PY'
import sys
from PIL import Image

source_path, out_path = sys.argv[1], sys.argv[2]
icon = Image.open(source_path).convert("RGBA")
icon.save(out_path, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
PY

echo "Generated:"
echo "  $ICNS_OUT"
echo "  $ICO_OUT"
echo "  $BASE_PNG"
