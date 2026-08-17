#!/usr/bin/env node
/**
 * generate-material-icon-names.mjs — генерация списка имён Material Symbols Outlined.
 * Сканирует @material-symbols/svg-400/outlined и пишет
 * src/config/materialSymbolsOutlinedNames.generated.ts для автодополнения иконок
 * в UI (бейджи свойств и т.п.).
 *
 * Использование:
 *   node scripts/generate-material-icon-names.mjs
 *   npm run generate:badge-icon-names
 *
 * Требует: npm install -D @material-symbols/svg-400
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const OUTLINED_DIR = path.join(root, 'node_modules', '@material-symbols', 'svg-400', 'outlined');
const OUT_FILE = path.join(root, 'src', 'config', 'materialSymbolsOutlinedNames.generated.ts');

function main() {
  if (!fs.existsSync(OUTLINED_DIR)) {
    console.error(
      'Missing @material-symbols/svg-400. Install it first:\n  npm install -D @material-symbols/svg-400'
    );
    process.exit(1);
  }

  const files = fs.readdirSync(OUTLINED_DIR);
  const names = files
    .filter((f) => f.endsWith('.svg') && !f.endsWith('-fill.svg'))
    .map((f) => f.slice(0, -4))
    .sort((a, b) => a.localeCompare(b, 'en'));

  const content = `/**
 * Material Symbols Outlined icon names (generated).
 * Do not edit by hand. Run: npm run generate:badge-icon-names
 */
export const MATERIAL_SYMBOLS_OUTLINED_NAMES: string[] = ${JSON.stringify(names, null, 2)}
`;

  fs.writeFileSync(OUT_FILE, content, 'utf8');
  console.log(`Generated ${names.length} icon names -> ${path.relative(root, OUT_FILE)}`);
}

main();
