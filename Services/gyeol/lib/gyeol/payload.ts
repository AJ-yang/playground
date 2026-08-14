// lib/gyeol/payload.ts
import type { Media } from './types'

/** 공유 링크에 담기는 선택 한 건. */
export type PickRef = { i: number; m: Media }

/**
 * 선택 기록을 URL 문자열로 만든다.
 *
 * **배열 인덱스가 아니라 TMDB id를 담는다.** 카탈로그는 재빌드될 때마다
 * 순서와 크기가 바뀌므로, 인덱스를 담으면 어제 공유한 링크가 오늘 조용히
 * 다른 작품을 가리킨다. id는 TMDB가 영구히 유지한다.
 *
 * `(id << 1) | media`를 varint(7비트씩, 상위 비트가 continuation)로 인코딩해
 * 이어 붙인 뒤 base64url로 만든다. 선택 수가 가변이라 고정 길이를 못 쓴다.
 */
export function encodePicks(picks: PickRef[]): string {
  const bytes: number[] = []
  for (const pick of picks) {
    let value = pick.i * 2 + pick.m
    while (value >= 0x80) {
      bytes.push((value & 0x7f) | 0x80)
      value = Math.floor(value / 128)
    }
    bytes.push(value)
  }
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * URL 문자열을 선택 기록으로 되돌린다. 망가진 입력에는 `null`을 낸다.
 *
 * 사용자가 주소창을 고칠 수 있으므로 던지면 안 된다. 결과 화면이 통째로
 * 죽는 대신 호출자가 안내를 그릴 수 있어야 한다.
 */
export function decodePicks(payload: string): PickRef[] | null {
  let binary: string
  try {
    binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    return null
  }

  const picks: PickRef[] = []
  let value = 0
  let shift = 1
  let pending = false

  for (let index = 0; index < binary.length; index += 1) {
    const byte = binary.charCodeAt(index)
    value += (byte & 0x7f) * shift
    if (byte & 0x80) {
      shift *= 128
      pending = true
      continue
    }
    picks.push({ i: Math.floor(value / 2), m: (value % 2) as Media })
    value = 0
    shift = 1
    pending = false
  }

  // 마지막 바이트의 continuation 비트가 켜진 채 끝났으면 잘린 것이다.
  if (pending) return null
  return picks
}
