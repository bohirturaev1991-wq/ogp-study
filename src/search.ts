import MiniSearch from 'minisearch';
import type { CatalogItem, Lang } from './types';
import { buildUnits, docLang, loadDoc, norm, unitOfBlock } from './data';

export interface Hit {
  id: string;
  doc: string;
  unit: string;
  anchor: string; // a12 | b40
  label: string; // «12-modda» или заголовок главы
  text: string;
  score: number;
}

interface Entry {
  id: string;
  doc: string;
  unit: string;
  anchor: string;
  label: string;
  text: string;
}

const tokenize = (s: string) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const indexes = new Map<Lang, Promise<{ ms: MiniSearch<Entry>; entries: Map<string, Entry> }>>();

/** Индекс по всем материалам: статья НПА или абзац учебника = одна запись. */
export function getIndex(items: CatalogItem[], lang: Lang) {
  if (!indexes.has(lang)) {
    indexes.set(
      lang,
      (async () => {
        const ms = new MiniSearch<Entry>({
          fields: ['text', 'label'],
          storeFields: [],
          tokenize,
          processTerm: (t) => (t.length > 1 ? t : null),
          searchOptions: { boost: { label: 2 }, prefix: true, fuzzy: (term) => (term.length > 5 ? 0.2 : false), combineWith: 'AND' },
        });
        const entries = new Map<string, Entry>();
        for (const item of items) {
          const dl = docLang(item, lang);
          if (!dl) continue;
          const blocks = await loadDoc(item.id, dl);
          const units = buildUnits(blocks, dl);
          let art: Entry | null = null;
          blocks.forEach((b, i) => {
            const unit = unitOfBlock(units, i).key;
            if (b.t === 'a') {
              const label = (dl === 'uz' ? `${b.n}-modda` : `Статья ${b.n}`) + (b.x ? `. ${b.x}` : '');
              art = { id: `${item.id}#a${b.n}`, doc: item.id, unit, anchor: `a${b.n}`, label, text: '' };
              entries.set(art.id, art);
            } else if (b.t === 'p' && art) {
              art.text += (art.text ? '\n' : '') + b.x;
            } else {
              art = null;
              if (b.t === 'p') {
                const e = { id: `${item.id}#b${i}`, doc: item.id, unit, anchor: `b${i}`, label: units.find((u) => u.key === unit)?.title || '', text: b.x };
                entries.set(e.id, e);
              }
            }
          });
        }
        await ms.addAllAsync([...entries.values()], { chunkSize: 500 });
        return { ms, entries };
      })(),
    );
  }
  return indexes.get(lang)!;
}

export async function search(items: CatalogItem[], lang: Lang, q: string, docFilter?: string): Promise<Hit[]> {
  const { ms, entries } = await getIndex(items, lang);
  const query = q.trim();
  if (!query) return [];
  const out: Hit[] = [];
  // прямой переход: «12-modda», «статья 12», «ст. 12»
  // «121¹» можно ввести и как «121-1»
  const m = query.match(/^(?:статья|ст\.?|modda|м\.)?\s*(\d+[⁰¹²³⁴⁵⁶⁷⁸⁹]*)(?:-(\d+))?\s*(?:-?\s*(?:modda|moddasi|статья))?$/i);
  if (m) {
    const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    const want = new Set([m[2] ? `${m[1]}-${m[2]}` : m[1], m[1] + (m[2] ? [...m[2]].map((d) => SUP[+d]).join('') : '')]);
    for (const e of entries.values()) {
      if (want.has(e.anchor.slice(1)) && e.anchor[0] === 'a' && (!docFilter || e.doc === docFilter)) out.push({ ...e, score: 1000 });
    }
  }
  let res = ms.search(query, { filter: docFilter ? (r) => entries.get(r.id)?.doc === docFilter : undefined });
  if (!res.length) res = ms.search(query, { combineWith: 'OR', filter: docFilter ? (r) => entries.get(r.id)?.doc === docFilter : undefined });
  for (const r of res.slice(0, 200)) {
    const e = entries.get(r.id);
    if (e && !out.some((o) => o.id === e.id)) out.push({ ...e, score: r.score });
  }
  return out;
}

/** Фрагмент текста вокруг первого совпадения + позиции для подсветки. */
export function snippet(text: string, q: string, len = 220): string {
  const terms = tokenize(q).filter((t) => t.length > 1);
  const n = norm(text);
  let pos = -1;
  for (const t of terms) {
    const p = n.indexOf(t.slice(0, Math.max(3, t.length - 2)));
    if (p >= 0 && (pos < 0 || p < pos)) pos = p;
  }
  // norm() убирает апострофы — позиция может сдвинуться на пару символов, это не критично
  const start = Math.max(0, pos - 60);
  const s = text.slice(start, start + len);
  return (start > 0 ? '…' : '') + s + (start + len < text.length ? '…' : '');
}

/** Разбивает строку на куски для подсветки совпадений. */
export function highlight(text: string, q: string): { s: string; hit: boolean }[] {
  const stems = tokenize(q)
    .filter((t) => t.length > 1)
    .map((t) => t.slice(0, Math.max(3, Math.ceil(t.length * 0.7))));
  if (!stems.length) return [{ s: text, hit: false }];
  const parts: { s: string; hit: boolean }[] = [];
  const re = /[\p{L}\p{N}ʻʼ'‘’`]+|[^\p{L}\p{N}ʻʼ'‘’`]+/gu;
  for (const m of text.matchAll(re)) {
    const w = m[0];
    const hit = /\p{L}|\p{N}/u.test(w) && stems.some((st) => norm(w).startsWith(st));
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.s += w;
    else parts.push({ s: w, hit });
  }
  return parts;
}
