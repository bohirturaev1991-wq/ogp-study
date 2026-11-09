import type { CatalogItem, Lang, Role } from './types';
import type { State } from './store';
import { docLang } from './data';

export function unitCount(item: CatalogItem, lang: Lang) {
  const dl = docLang(item, lang);
  return dl ? item.langs[dl]!.units : 0;
}

export function readFraction(s: State, item: CatalogItem, lang: Lang) {
  const total = unitCount(item, lang);
  if (!total) return 0;
  return Math.min(1, Object.keys(s.read[item.id] || {}).length / total);
}

export function docAccuracy(s: State, doc: string) {
  let seen = 0;
  let correct = 0;
  for (const q of Object.values(s.qstats)) {
    if (q.doc !== doc) continue;
    seen += q.seen;
    correct += q.correct;
  }
  return { seen, acc: seen ? correct / seen : null };
}

/** Материалы, которые изучает пользователь: выбранные вручную или подходящие по роли. */
export function myItems(items: CatalogItem[], s: State, role: Role | null) {
  const chosen = s.profile.docs;
  return items.filter((i) => (chosen ? chosen.includes(i.id) : !i.audience || !role || i.audience.includes(role)));
}

export function streak(s: State) {
  let n = 0;
  const d = new Date();
  const key = (x: Date) => x.toISOString().slice(0, 10);
  const active = (k: string) => {
    const a = s.activity[k];
    return !!a && a.read + a.answered + a.reviewed > 0;
  };
  if (!active(key(d))) d.setDate(d.getDate() - 1); // сегодня ещё можно успеть
  while (active(key(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
