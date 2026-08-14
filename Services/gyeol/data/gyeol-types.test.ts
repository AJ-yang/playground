import { describe, expect, it } from 'vitest'
import { GYEOL_TYPES } from './gyeol-types'
import { GENRE_LABELS } from '../lib/gyeol/types'

describe('GYEOL_TYPES', () => {
  it('25개다', () => {
    expect(GYEOL_TYPES).toHaveLength(25)
  })

  it('id가 서로 겹치지 않는다', () => {
    const ids = GYEOL_TYPES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('이름이 서로 겹치지 않는다', () => {
    const names = GYEOL_TYPES.map((g) => g.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('모든 결이 이름과 설명을 갖는다', () => {
    for (const g of GYEOL_TYPES) {
      expect(g.name.length, g.id).toBeGreaterThan(0)
      expect(g.description.length, g.id).toBeGreaterThan(20)
    }
  })

  it('설명이 사용자를 인격으로 규정하지 않는다', () => {
    for (const g of GYEOL_TYPES) {
      expect(g.description, g.id).not.toMatch(/당신은 .*사람입니다/)
    }
  })

  it('모든 결이 조건 키워드를 2개 이상 갖는다', () => {
    for (const g of GYEOL_TYPES) {
      expect(g.keywords.length, g.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('장르 조건이 정규 라벨만 쓴다', () => {
    for (const g of GYEOL_TYPES) {
      for (const label of g.genres) {
        expect(GENRE_LABELS, `${g.id}: ${label}`).toContain(label)
      }
    }
  })

  it('드라마 장르를 조건에 쓰지 않는다', () => {
    for (const g of GYEOL_TYPES) {
      expect(g.genres, g.id).not.toContain('드라마')
    }
  })

  it('조건 키워드가 소문자다', () => {
    for (const g of GYEOL_TYPES) {
      for (const k of g.keywords) {
        expect(k, `${g.id}: ${k}`).toBe(k.toLowerCase())
      }
    }
  })
})
