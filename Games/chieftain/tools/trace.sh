#!/bin/sh
# TS 대조 트레이스를 뽑는다. esbuild로 한 파일로 묶어 node로 돌린다 —
# 이 저장소에는 ts 러너가 따로 없고, esbuild는 vite가 이미 들고 있다.
set -e
cd "$(dirname "$0")/.."
./node_modules/.bin/esbuild tools/trace.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/chieftain-trace.mjs --log-level=warning
exec node /tmp/chieftain-trace.mjs "$@"
