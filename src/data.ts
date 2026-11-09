import { useEffect, useState } from 'react';
import type { Block, CatalogItem, Lang, Question, Unit } from './types';
export { buildUnits } from './units';

const base = './content/';
const cache = new Map<string, Promise<unknown>>();

function getJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(base + path).then((r) => {
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export const loadCatalog = () => getJson<{ built: string; items: CatalogItem[] }>('catalog.json').then((c) => c.items);
export const loadQuestions = () => getJson<Question[]>('questions.json');

/** Язык, на котором реально есть материал (предпочитаем выбранный). */
export function docLang(item: CatalogItem, lang: Lang): Lang | null {
  if (item.langs[lang]) return lang;
  const other: Lang = lang === 'uz' ? 'ru' : 'uz';
  return item.langs[other] ? other : null;
}

export const loadDoc = (id: string, lang: Lang) => getJson<Block[]>(`docs/${id}.${lang}.json`);

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data?: T; error?: Error } {
  const [st, setSt] = useState<{ data?: T; error?: Error }>({});
  useEffect(() => {
    let alive = true;
    setSt({});
    fn().then(
      (data) => alive && setSt({ data }),
      (error) => alive && setSt({ error }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return st;
}

export const useCatalog = () => useAsync(loadCatalog, []);

/** Абзацы статьи n (для карточек, авто-вопросов и сниппетов). */
export function articleText(blocks: Block[], n: string): string {
  const i = blocks.findIndex((b) => b.t === 'a' && b.n === n);
  if (i < 0) return '';
  const out: string[] = [];
  for (let j = i + 1; j < blocks.length && blocks[j].t === 'p'; j++) out.push(blocks[j].x);
  return out.join('\n');
}

export function unitOfBlock(units: Unit[], index: number) {
  return units.find((u) => index >= u.start && index < u.end) || units[0];
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʻʼ'‘’`]/g, '')
    .replace(/ё/g, 'е');
