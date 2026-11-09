// Интервальное повторение (упрощённый SM-2).
export interface CardState {
  ef: number; // коэффициент лёгкости
  ivl: number; // интервал в днях
  reps: number;
  due: number; // timestamp
  lapses: number;
}

export type Grade = 0 | 1 | 2 | 3; // не помню / трудно / хорошо / легко

const DAY = 86400000;

export function newCard(): CardState {
  return { ef: 2.5, ivl: 0, reps: 0, due: 0, lapses: 0 };
}

export function review(c: CardState, g: Grade, now = Date.now()): CardState {
  if (g === 0) {
    // повторим через 10 минут в этой же сессии
    return { ...c, reps: 0, ivl: 0, lapses: c.lapses + 1, ef: Math.max(1.3, c.ef - 0.2), due: now + 10 * 60000 };
  }
  const q = [0, 3, 4, 5][g];
  const ef = Math.max(1.3, c.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  let ivl: number;
  if (c.reps === 0) ivl = g === 3 ? 4 : 1;
  else if (c.reps === 1) ivl = g === 1 ? 2 : g === 3 ? 7 : 4;
  else ivl = Math.round(c.ivl * (g === 1 ? 1.2 : g === 3 ? ef * 1.3 : ef));
  ivl = Math.max(1, ivl);
  return { ef, ivl, reps: c.reps + 1, lapses: c.lapses, due: startOfDay(now) + ivl * DAY };
}

export function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(4, 0, 0, 0); // «новый день» с 4 утра
  return d.getTime() > t ? d.getTime() - DAY : d.getTime();
}

export function intervalLabel(c: CardState, g: Grade, lang: 'uz' | 'ru') {
  if (g === 0) return lang === 'uz' ? '10 daq' : '10 мин';
  const n = review(c, g).ivl;
  return lang === 'uz' ? `${n} kun` : `${n} дн`;
}
