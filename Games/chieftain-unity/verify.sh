#!/bin/sh
#
# TS 원본과 C# 포팅이 **같은 시드에서 같은 판을 굴리는지** 확인한다.
#
# 이 스크립트가 통과하는 것이 이 디렉터리의 존재 이유다. 포팅이 "대충 같다"는
# 락스텝에서 아무 값어치가 없다 — 마지막 비트 하나가 다르면 다음 틱에 둘이 되고,
# 30초 뒤에는 다른 판이 된다(GDD 7.2).
#
# 실패하면 diff의 첫 줄이 곧 "몇 번째 틱, 어느 값에서 갈라졌는가"다.
set -e
cd "$(dirname "$0")"

TICKS="${TICKS:-3600}"
SEEDS="${SEEDS:-12345 1 999983 20260824 7}"
TS_DIR=../chieftain

dotnet build Trace/Chieftain.Trace.csproj -c Release -v q --nologo >/dev/null
DLL=Trace/bin/Release/net8.0/Chieftain.Trace.dll

fail=0
for seed in $SEEDS; do
  "$TS_DIR/tools/trace.sh" "$seed" "$TICKS" > "/tmp/chieftain-ts-$seed.trace"
  dotnet "$DLL" "$seed" "$TICKS" > "/tmp/chieftain-cs-$seed.trace"
  if diff -q "/tmp/chieftain-ts-$seed.trace" "/tmp/chieftain-cs-$seed.trace" >/dev/null; then
    printf 'seed %-10s %s틱  일치\n' "$seed" "$TICKS"
  else
    printf 'seed %-10s %s틱  ✗ 발산\n' "$seed" "$TICKS"
    diff "/tmp/chieftain-ts-$seed.trace" "/tmp/chieftain-cs-$seed.trace" | head -6
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "결정론이 깨졌다."
  exit 1
fi
echo "모든 시드에서 TS와 C#이 비트까지 일치한다."
