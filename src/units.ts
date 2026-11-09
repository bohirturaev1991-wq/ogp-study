// Общий модуль: используется и приложением, и scripts/build-content.mjs (без runtime-импортов!)
import type { Block, Lang, Unit } from './types';

/**
 * Делит документ на «единицы изучения» — главы (боб/глава), в учебниках — главы ##.
 * Если глав нет — разделы, если нет и их — порции по 10 статей.
 */
export function buildUnits(blocks: Block[], lang: Lang): Unit[] {
  const hasL2 = blocks.some((b) => b.t === 'h' && b.l === 2);
  const hasL1 = blocks.some((b) => b.t === 'h' && b.l === 1);
  const L = hasL2 ? 2 : hasL1 ? 1 : 0;
  const noStructure = L === 0 && !blocks.some((b) => b.t === 'a');
  const PARA = 25;
  let paras = 0;
  const units: Unit[] = [];
  let section: string | undefined;
  let sectionStart = -1; // заголовок раздела прикрепляем к первой главе раздела
  let cur: Unit | null = null;
  const open = (start: number, title: string): Unit => {
    if (cur) cur.end = start;
    const u: Unit = { key: `u${units.length}`, title, section, start, end: blocks.length, articles: [] };
    units.push(u);
    return u;
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.t === 'h' && L === 2 && b.l === 1) {
      section = b.x;
      sectionStart = i;
      continue;
    }
    if (b.t === 'h' && b.l <= L) {
      cur = open(sectionStart >= 0 ? sectionStart : i, b.x);
      sectionStart = -1;
      continue;
    }
    if (sectionStart >= 0) {
      cur = open(sectionStart, section || '');
      sectionStart = -1;
    }
    if (noStructure) {
      // ни глав, ни статей (указы, постановления) — порции по PARA абзацев
      if (!cur || (b.t === 'p' && paras >= PARA)) {
        cur = open(i, `${lang === 'uz' ? 'Qism' : 'Часть'} ${units.length + 1}`);
        paras = 0;
      }
      if (b.t === 'p') paras++;
      continue;
    }
    if (!cur) cur = open(i, lang === 'uz' ? 'Muqaddima' : 'Преамбула');
    if (b.t === 'a') {
      if (L === 0 && cur.articles.length >= 10) cur = open(i, '');
      cur.articles.push(b.n);
    }
  }
  for (const u of units) {
    if (!u.title) {
      const a = u.articles;
      u.title = a.length ? (lang === 'uz' ? `${a[0]}–${a[a.length - 1]}-moddalar` : `Статьи ${a[0]}–${a[a.length - 1]}`) : '—';
    }
  }
  return units;
}

