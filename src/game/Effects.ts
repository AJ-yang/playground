import type { Vec2 } from '../core/vec2'

/** 폭발 링 이펙트. 대포·얼음탑 착탄 시 생성. */
export interface Blast {
  pos: Vec2
  radius: number
  age: number
  life: number
  color: string
}

/** 골드 획득·생명 감소 등을 알리는 떠오르는 텍스트. */
export interface FloatingText {
  pos: Vec2
  text: string
  age: number
  life: number
  color: string
}

/** 적 사망 시 흩어지는 파편. */
export interface Particle {
  pos: Vec2
  vel: Vec2
  age: number
  life: number
  color: string
  size: number
}

/**
 * 순수 연출용 이펙트 풀.
 *
 * 게임 로직과 완전히 분리해 두면 시뮬레이션을 건드리지 않고 연출만
 * 바꿀 수 있고, 나중에 리플레이·헤드리스 밸런스 테스트를 돌릴 때
 * 이 시스템만 통째로 꺼버리면 된다.
 */
export class Effects {
  readonly blasts: Blast[] = []
  readonly texts: FloatingText[] = []
  readonly particles: Particle[] = []

  blast(pos: Vec2, radius: number, color: string, life = 0.32): void {
    this.blasts.push({ pos: { ...pos }, radius, age: 0, life, color })
  }

  text(pos: Vec2, text: string, color: string, life = 0.9): void {
    this.texts.push({ pos: { ...pos }, text, age: 0, life, color })
  }

  burst(pos: Vec2, color: string, count: number, speed = 90): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
      const s = speed * (0.4 + Math.random() * 0.8)
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(angle) * s, y: Math.sin(angle) * s },
        age: 0,
        life: 0.45 + Math.random() * 0.25,
        color,
        size: 2 + Math.random() * 2,
      })
    }
  }

  update(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]!
      b.age += dt
      if (b.age >= b.life) this.blasts.splice(i, 1)
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]!
      t.age += dt
      t.pos.y -= 26 * dt
      if (t.age >= t.life) this.texts.splice(i, 1)
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!
      p.age += dt
      p.pos.x += p.vel.x * dt
      p.pos.y += p.vel.y * dt
      p.vel.x *= 0.92
      p.vel.y *= 0.92
      if (p.age >= p.life) this.particles.splice(i, 1)
    }
  }

  clear(): void {
    this.blasts.length = 0
    this.texts.length = 0
    this.particles.length = 0
  }
}
