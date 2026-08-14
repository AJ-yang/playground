#!/usr/bin/env bash
# out/ 정적 빌드를 gh-pages 브랜치로 밀어 넣는다.
#
# out/ 은 .gitignore 대상이라 subtree를 쓸 수 없다. 대신 out/ 안에 일회용
# 저장소를 만들어 gh-pages 로 강제 푸시한다. 히스토리가 필요 없는 산출물이라
# 매번 덮어쓰는 편이 단순하다.
set -euo pipefail

REPO_URL="$(git config --get remote.origin.url)"
COMMIT="$(git rev-parse --short HEAD)"

cd out
rm -rf .git
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-Xan Yang}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-xan@Xanui-MacBookAir.local}" \
    commit -q -m "deploy from ${COMMIT}"
git push -q --force "$REPO_URL" gh-pages
rm -rf .git

echo "gh-pages 배포 완료 (source ${COMMIT})"
