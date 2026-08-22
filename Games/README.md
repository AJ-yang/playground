# Games

| 프로젝트 | 무엇 | 상태 |
| --- | --- | --- |
| [`joseon-defense/`](joseon-defense/) | **조선 방어전** — 왜구의 노략에서 병자호란까지, 여섯 전쟁으로부터 성을 지키는 경로형 타워디펜스 | [배포됨](https://aj-yang.github.io/playground/joseon-defense/) |
| [`casino-learning-game/`](casino-learning-game/) | **카지노 게임 배우기** — 걸어다니며 룰을 익히는 학습용 카지노 | [배포됨](https://aj-yang.github.io/playground/casino-learning-game/) |

**빌드가 있는 프로젝트와 없는 프로젝트가 섞여 있다.** 조선 방어전은 vite로
`dist`를 굽고, 카지노 학습 게임은 `index.html` 한 장이 곧 게임이라 빌드 단계가
없다. 그래서 `deploy.yml`의 조립 단계는 갈래 폴더를 훑지 않고 **프로젝트마다
올릴 것을 따로 적는다.**

## 게임을 만드는 방법

[`CONTRIBUTING.md`](CONTRIBUTING.md)에 적혀 있다 — 등급(T1 스케치 / T2 작품),
역할별 소유권, 산출물이 놓이는 자리, 그리고 T2가 지켜야 할 표준 계약 두 가지
(헤드리스 시뮬레이터와 조작 훅).

역할은 `.claude/agents/` 아래 여섯이고, `/new-game`으로 처음부터,
`/game-review`로 이미 있는 게임을 한 회차 더 돌린다.

게임끼리는 맥락이 섞이지 않는다 — 다른 게임의 `docs/`는 읽지 않고, 한 세션에 한
게임만 다룬다. 대신 여러 게임에서 **반복된** 시행착오는 `/retro`가 찾아
[`LESSONS.md`](LESSONS.md)에 쌓고, 두 번 나온 것만 규약으로 승격시킨다.
게임을 만들수록 나아지는 것은 게임이 아니라 이 규약이다.

## 프로젝트를 추가할 때

저장소 루트 [`README.md`](../README.md)의 「배포」 절을 따른다 — `deploy.yml`의
「배포 트리 조립」 단계에 한 줄, `site/index.html`에 카드 하나, 그리고 위 표와
루트 표에 한 줄씩.
