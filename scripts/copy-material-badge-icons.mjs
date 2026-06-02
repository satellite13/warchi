#!/usr/bin/env node
/**
 * copy-material-badge-icons.mjs — копирование SVG-иконок Material Design в public/icons/.
 * Нужен для интерактивного выбора иконок в бейджах пользовательских свойств;
 * после обновления пакета @material-design-icons/svg перегенерирует статические файлы.
 *
 * Использование:
 *   node scripts/copy-material-badge-icons.mjs
 *   npm run copy:badge-icons
 *
 * Требует: npm install -D @material-design-icons/svg
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const OUTLINED_DIR = path.join(root, 'node_modules', '@material-design-icons', 'svg', 'outlined');
const PUBLIC_ICONS_DIR = path.join(root, 'public', 'icons');

function main() {
  if (!fs.existsSync(OUTLINED_DIR)) {
    console.error(
      'Missing @material-design-icons/svg. Install it first:\n  npm install -D @material-design-icons/svg'
    );
    process.exit(1);
  }

  if (!fs.existsSync(PUBLIC_ICONS_DIR)) {
    fs.mkdirSync(PUBLIC_ICONS_DIR, { recursive: true });
  }

  const files = fs.readdirSync(OUTLINED_DIR).filter((f) => f.endsWith('.svg'));
  let copied = 0;
  for (const file of files) {
    const src = path.join(OUTLINED_DIR, file);
    const dest = path.join(PUBLIC_ICONS_DIR, file);
    fs.copyFileSync(src, dest);
    copied++;
  }
  console.log(`Copied ${copied} Material outlined SVGs to public/icons/`);
}

main();
