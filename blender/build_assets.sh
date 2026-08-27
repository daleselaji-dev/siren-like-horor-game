#!/usr/bin/env bash
# 《返潮》Blender 资产管线一条龙：bpy 生成 → CLI 渲染验证 → gltfpack 压缩入库
# 用法：bash blender/build_assets.sh [轮次标签，默认 rX] [渲染采样，默认 48]
# 产物：
#   blender/out/*.blend        —— 可复查/续雕的工程文件（入库）
#   blender/export/*.glb       —— 原始导出（中间产物，不入库）
#   src/assets/models/*.glb    —— meshopt 压缩后的游戏资产（vite ?inline 内联进 bundle）
#   verify/blender/<轮>_*.png  —— Cycles CPU 渲染验证图（入库作对照证据）
set -euo pipefail
cd "$(dirname "$0")/.."

ROUND="${1:-rX}"
SAMPLES="${2:-48}"
BLENDER="${BLENDER_BIN:-$HOME/blender-4.1.1/blender}"

if [ ! -x "$BLENDER" ]; then
  echo "[build_assets] 未找到 Blender，先执行 bash blender/install_blender.sh"
  exit 1
fi

echo "[build_assets] 1/3 生成角色（bpy → .blend + 原始 GLB）"
"$BLENDER" --background --python blender/gen_characters.py -- --glb blender/export

echo "[build_assets] 2/3 渲染验证（Cycles CPU, ${SAMPLES}spp, 轮=${ROUND}）"
"$BLENDER" --background --python blender/render_verify.py -- --round "$ROUND" --samples "$SAMPLES"

echo "[build_assets] 3/3 gltfpack 压缩（meshopt EXT_meshopt_compression）"
mkdir -p src/assets/models
for f in blender/export/*.glb; do
  base="$(basename "$f")"
  npx gltfpack -i "$f" -o "src/assets/models/$base" -cc
  printf '  %s: %s → %s\n' "$base" "$(stat -c%s "$f")" "$(stat -c%s "src/assets/models/$base")"
done
rm -f blender/out/*.blend1
echo "[build_assets] 完成。"
