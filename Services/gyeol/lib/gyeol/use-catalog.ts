// lib/gyeol/use-catalog.ts
'use client'

import { useEffect, useState } from 'react'
import type { Catalog, CatalogEntry } from './types'

/**
 * 정적 배포라 basePath가 붙는다. fetch 경로에 직접 붙여야 GitHub Pages에서
 * 404가 나지 않는다. next.config.ts의 basePath와 같은 값이어야 한다.
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json() as Promise<T>
}

/**
 * 1라운드 후보만 먼저 받는다.
 *
 * 후보 50장은 사용자와 무관하게 정해지므로 빌드 때 미리 굽는다(gzip 2.8KB).
 * 예전에는 이걸 계산하려고 색인 607KB를 통째로 기다린 뒤 12,595편을 훑느라
 * 데스크톱에서도 168ms를 더 썼다. 첫 화면이 뜨는 데 필요한 것은 이 50장뿐이다.
 */
export function usePool() {
  const [pool, setPool] = useState<CatalogEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    loadJson<CatalogEntry[]>('/pool.json')
      .then((data) => alive && setPool(data))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  return { pool, failed }
}

/**
 * 색인을 받는다.
 *
 * 검색·2라운드·결과 판정에 필요하다. 첫 화면은 후보만으로 뜨므로 이것은
 * 뒤에서 받는다 — 사용자가 다섯 편을 고르는 동안 도착한다.
 */
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    loadJson<Catalog>('/catalog.json')
      .then((data) => alive && setCatalog(data))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  return { catalog, failed }
}
