#!/usr/bin/env bash
# 幂等安装官方 Blender 4.1.1（Linux x64，headless 可用）。
# 用法：bash blender/install_blender.sh
# 安装位置：$HOME/blender-4.1.1（已装且版本正确则直接跳过）。
set -euo pipefail

VER=4.1.1
SERIES=4.1
DEST="${BLENDER_HOME:-$HOME/blender-$VER}"
BIN="$DEST/blender"
URL="https://download.blender.org/release/Blender$SERIES/blender-$VER-linux-x64.tar.xz"

if [ -x "$BIN" ] && "$BIN" --version 2>/dev/null | head -1 | grep -q "Blender $VER"; then
  echo "[install_blender] 已安装：$("$BIN" --version | head -1) @ $BIN"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "[install_blender] 下载 $URL ..."
curl -fL --retry 4 --retry-delay 4 -o "$TMP/blender.tar.xz" "$URL"
echo "[install_blender] 解压到 $DEST ..."
rm -rf "$DEST"
mkdir -p "$DEST"
tar -xJf "$TMP/blender.tar.xz" -C "$DEST" --strip-components=1
# headless 渲染依赖的系统库（多数发行版已带；缺失时才装）
if ! "$BIN" --version >/dev/null 2>&1; then
  echo "[install_blender] 补齐系统依赖（libxrender/libxi/libxkbcommon/libsm/libgl）..."
  sudo apt-get update -qq && sudo apt-get install -y -qq \
    libxrender1 libxi6 libxkbcommon0 libsm6 libgl1 libegl1 || true
fi
"$BIN" --version | head -1
echo "[install_blender] 完成。CLI 示例："
echo "  $BIN --background --python blender/gen_characters.py"
