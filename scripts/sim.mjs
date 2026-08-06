#!/usr/bin/env node
/**
 * 헤드리스 시뮬레이터 실행 스크립트.
 *
 * 브라우저 코드는 ESM + 확장자 없는 import를 쓰는데, Node에서 그대로 돌리려면
 * 로더가 필요하다. 추가 의존성 없이 해결하려고 CommonJS로 한 번 컴파일한 뒤
 * 실행한다. 루트 package.json이 "type": "module"이므로 빌드 디렉터리에만
 * commonjs 표시를 따로 남겨준다.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const BUILD_DIR = '.sim-build'

const compile = spawnSync('npx', ['tsc', '-p', 'tsconfig.sim.json'], { stdio: 'inherit' })
if (compile.status !== 0) process.exit(compile.status ?? 1)

mkdirSync(BUILD_DIR, { recursive: true })
writeFileSync(`${BUILD_DIR}/package.json`, JSON.stringify({ type: 'commonjs' }))

const run = spawnSync('node', [`${BUILD_DIR}/sim/run.js`, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(run.status ?? 1)
