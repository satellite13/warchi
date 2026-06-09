#!/usr/bin/env node
/**
 * Verify package.json, Chart.yaml and values.yaml image.tag share the same version.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkgVersion = JSON.parse(
  readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
).version

const chartYaml = readFileSync(resolve(repoRoot, 'charts/warchi/Chart.yaml'), 'utf8')
const valuesYaml = readFileSync(resolve(repoRoot, 'charts/warchi/values.yaml'), 'utf8')

const appVersionMatch = chartYaml.match(/^appVersion:\s*"?([^"\n]+)"?/m)
const chartVersionMatch = chartYaml.match(/^version:\s*(\S+)/m)
const imageTagMatch = valuesYaml.match(/^\s*tag:\s*"?([^"\n]+)"?/m)

const errors = []

if (!appVersionMatch || appVersionMatch[1] !== pkgVersion) {
  errors.push(`Chart.yaml appVersion must be ${pkgVersion}`)
}
if (!chartVersionMatch || chartVersionMatch[1] !== pkgVersion) {
  errors.push(`Chart.yaml version must be ${pkgVersion}`)
}
if (!imageTagMatch || imageTagMatch[1] !== pkgVersion) {
  errors.push(`values.yaml image.tag must be ${pkgVersion}`)
}

if (errors.length > 0) {
  console.error('Version mismatch:\n' + errors.map((e) => `  - ${e}`).join('\n'))
  console.error('\nRun: node scripts/sync-chart-version.mjs')
  process.exit(1)
}

console.log(`Versions OK (${pkgVersion})`)
