/**
 * 유닛 2종 (GDD 6.3).
 *
 * 둘로 끊은 이유는 v1이 알아내려는 것이 유닛 조합이 아니라 강림이기 때문이다.
 * 다만 **아무 둘이나** 고르면 안 된다 — 지휘 반경 보너스를 서로 다른 축으로
 * 받는 둘이어야 "누구를 반경에 넣을 것인가"가 결정이 된다(`tuning.ts`의
 * COMMANDED_BONUS).
 *
 * 방패병은 반경 안에서 **버티고**, 도끼병은 반경 안에서 **때린다**. 그래서
 * 방패병을 앞세우고 반경을 그 위에 두면 벽이 되고, 도끼병 위에 두면 창이 된다.
 */
export type UnitKind = 'shield' | 'axe' | 'worker'

export interface UnitDef {
  readonly kind: UnitKind
  readonly name: string
  readonly cost: number
  /** 생산에 걸리는 초. */
  readonly buildSeconds: number
  readonly hp: number
  /** 초당 피해량. 실제 타격은 아래 간격마다 뭉쳐서 들어간다. */
  readonly dps: number
  /**
   * 한 번 휘두르는 간격(초).
   *
   * 예전에는 매 프레임 `dps * dt`를 흘려보냈다. 숫자로는 같지만 **화면에는
   * 아무 일도 일어나지 않았다** — 휘두르는 동작도, 맞는 순간도 없이 상대가
   * 조용히 줄어들 뿐이었다. 끊어 치면 리듬이 생기고, 그제서야 "지휘 반경 안의
   * 방패병이 덜 맞는다"가 눈에 보인다(GDD 6.2).
   *
   * 초당 피해량은 그대로다 — 한 대에 `dps * swing`이 들어간다.
   */
  readonly swing: number
  /** 받는 피해에 곱해지는 값. 낮을수록 단단하다. */
  readonly damageTaken: number
  /** 월드 단위 / 초. */
  readonly speed: number
  /** 사거리. 둘 다 근접이지만 방패병이 조금 더 길다(창·방패 대형). */
  readonly range: number
  /** 3D에서의 대략적 몸 크기. 렌더링 전용. */
  readonly radius: number
  readonly height: number
  /**
   * 싸우지 않는 유닛인가.
   *
   * 일꾼만 참이다. 표적은 되지만 표적을 고르지 않고, 적이 있는 칸에서는
   * 도망친다. `dps`를 0으로 두는 것만으로는 부족하다 — 0이어도 표적을 잡고
   * 붙어 서 있으면 화면에서는 싸우다 죽는 것처럼 보인다.
   */
  readonly civilian?: boolean
}

export const UNITS: Record<UnitKind, UnitDef> = {
  shield: {
    kind: 'shield',
    name: '방패병',
    cost: 45,
    buildSeconds: 5,
    hp: 130,
    dps: 9,
    // 방패병은 느리고 무겁게 친다.
    swing: 1.15,
    damageTaken: 1,
    speed: 7.5,
    range: 3.2,
    radius: 1.15,
    height: 3.4,
  },
  worker: {
    kind: 'worker',
    name: '일꾼',
    // 병사보다 싸고 빠르게 나온다. 초반에 무엇에 쓸지가 결정이어야 하므로,
    // 값이 비싸면 결정 자체가 안 생긴다.
    cost: 30,
    buildSeconds: 4,
    // 무르다. 앞 땅에 세운 일꾼은 실제로 위험해야 "어디를 일구느냐"가 결정이 된다.
    hp: 60,
    dps: 0,
    swing: 1,
    damageTaken: 1.3,
    speed: 9,
    range: 0,
    radius: 0.9,
    height: 3.0,
    civilian: true,
  },
  axe: {
    kind: 'axe',
    name: '도끼병',
    cost: 55,
    buildSeconds: 6,
    hp: 85,
    dps: 17,
    // 도끼병은 빠르게 몰아친다. 반경 안에서 공격이 오르는 유닛이라
    // 타격이 잦아야 그 차이가 보인다.
    swing: 0.7,
    damageTaken: 1.25,
    speed: 10.5,
    range: 2.6,
    radius: 1.0,
    height: 3.2,
  },
}

/**
 * 일꾼 (GDD 4.6).
 *
 * **자원 노드를 캐지 않는다.** 내 땅 위에 서 있으면 그 칸의 수입이 오른다 —
 * 이 게임의 경제가 애초에 땅이기 때문이다(GDD 4.3). 노드를 놓았다면 은광이
 * 본진 옆에 있을 때 앞으로 나갈 이유가 줄고, 전선에 있을 때는 일꾼을 지키느라
 * 부감에 묶인다. 둘 다 이 게임의 중심 규칙과 정면으로 부딪힌다.
 *
 * 대신 **칸마다 정원이 있다**(`workersPerTile`). 그래서 더 벌려면 땅을 더
 * 먹어야 하고, 땅을 먹으려면 앞으로 나가야 하고, 앞으로 나가는 가장 빠른
 * 길은 강림이다. 경제가 강림을 밀어주는 방향으로 붙는다.
 */
export const UNIT_ORDER: readonly UnitKind[] = ['shield', 'axe', 'worker']
