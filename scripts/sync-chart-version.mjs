#!/usr/bin/env node
/**
 * Sync package.json version into Helm chart (appVersion, chart version, image.tag).
 * Source of truth: package.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = resolve(repoRoot, 'package.json')
const chartPath = resolve(repoRoot, 'charts/warchi/Chart.yaml')
const valuesPath = resolve(repoRoot, 'charts/warchi/values.yaml')

const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version

function syncChartYaml() {
  const content = readFileSync(chartPath, 'utf8')
  const next = content
    .replace(/^version: .*/m, `version: ${version}`)
    .replace(/^appVersion: .*/m, `appVersion: "${version}"`)
  if (next !== content) {
    writeFileSync(chartPath, next)
    console.log(`Updated ${chartPath}`)
  }
}

function syncValuesYaml() {
  const content = readFileSync(valuesPath, 'utf8')
  const next = content.replace(/^(\s*tag:\s*).*/m, `$1"${version}"`)
  if (next !== content) {
    writeFileSync(valuesPath, next)
    console.log(`Updated ${valuesPath}`)
  }
}

syncChartYaml()
syncValuesYaml()
console.log(`Chart version synced to ${version}`)
