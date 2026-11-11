#!/bin/sh
# src/core.js + src/plugin.js → figma-plugin/code.js, 그리고 스킬용 core.js 복사
cd "$(dirname "$0")"
cat src/core.js src/plugin.js > figma-plugin/code.js
cp src/core.js skill/slides/core.js
node -e "new Function(require('fs').readFileSync('figma-plugin/code.js','utf8'))" && echo "build ok"
