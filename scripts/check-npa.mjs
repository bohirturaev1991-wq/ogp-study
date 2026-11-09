// Проверка импорта: по каждому акту — статьи, главы, единицы изучения, расхождения uz/ru.
//   node scripts/check-npa.mjs            — сводка
//   node scripts/check-npa.mjs labor-code — подробно по одному акту
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnits } from '../src/units.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'npa.json'), 'utf8')).acts;
const only = process.argv[2];

for (const act of acts) {
  if (only && act.id !== only) continue;
  const p = path.join(ROOT, 'content', 'raw', 'npa', `${act.id}.json`);
  if (!fs.existsSync(p)) {
    console.log(`${act.id}: НЕТ ИМПОРТА`);
    continue;
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  const info = {};
  for (const lang of ['uz', 'ru']) {
    const l = raw.langs[lang];
    if (!l) {
      info[lang] = null;
      continue;
    }
    const b = l.blocks;
    const arts = b.filter((x) => x.t === 'a').map((x) => x.n);
    const h = [1, 2, 3].map((n) => b.filter((x) => x.t === 'h' && x.l === n).length);
    const units = buildUnits(b, lang);
    const dup = arts.filter((n, i) => arts.indexOf(n) !== i);
    info[lang] = { arts, h, units, dup, n: b.length };
  }
  const f = (i) => (i ? `${String(i.arts.length).padStart(4)} ст, гл ${i.h.join('/')}, ед ${String(i.units.length).padStart(3)}${i.dup.length ? ` ДУБЛИ:${[...new Set(i.dup)].slice(0, 5)}` : ''}` : '—'.padEnd(30));
  let diff = '';
  if (info.uz && info.ru) {
    const ru = new Set(info.ru.arts), uz = new Set(info.uz.arts);
    const a = info.uz.arts.filter((n) => !ru.has(n)), b = info.ru.arts.filter((n) => !uz.has(n));
    if (a.length || b.length) diff = `  ≠ только uz:[${a.slice(0, 6)}] только ru:[${b.slice(0, 6)}]`;
  }
  console.log(`${act.id.padEnd(19)} uz: ${f(info.uz)} | ru: ${f(info.ru)}${diff}`);
  if (only) {
    for (const lang of ['uz', 'ru']) {
      if (!info[lang]) continue;
      console.log(`\n--- ${lang} units ---`);
      for (const u of info[lang].units) console.log(`${u.key} [${u.articles.length} ст] ${u.section ? u.section.slice(0, 40) + ' › ' : ''}${u.title.slice(0, 90)}`);
      console.log(`--- ${lang} первые блоки ---`);
      for (const x of raw.langs[lang].blocks.slice(0, 8)) console.log(x.t, x.l || x.n || '', (x.x || '').slice(0, 100));
    }
  }
}
