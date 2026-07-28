/**
 * check-node-version.mjs — проверка версии Node.js перед сборкой.
 * Запускается автоматически как prebuild-хук; завершает процесс с ошибкой,
 * если текущая версия Node не входит в диапазон из package.json engines.
 *
 * Использование:
 *   node scripts/check-node-version.mjs
 *   npm run build   # prebuild вызывает этот скрипт
 */
const REQUIRED = '>=20.19.0 <21 || >=22.12.0'

const version = process.versions.node
const [major, minor] = version.split('.').map((value) => Number(value))

const isSupported =
  (major === 20 && minor >= 19) || (major >= 22 && (major !== 22 || minor >= 12))

if (!isSupported) {
  console.error(
    [
      `Unsupported Node.js version: ${version}`,
      `Required version: ${REQUIRED}`,
      'Use `nvm use` (or install the required version) and retry.',
    ].join('\n')
  )
  process.exit(1)
}
