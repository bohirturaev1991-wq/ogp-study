import { useSyncExternalStore } from 'react';
import type { Lang, Question, Role } from './types';
import type { CardState } from './srs';

export interface Bookmark {
  doc: string;
  anchor: string; // a12 (статья) или b34 (абзац книги)
  unit: string;
  label: string;
  text: string;
  note?: string;
  starred?: boolean;
  at: number;
}

export interface UserCard {
  id: string;
  front: string;
  back: string;
  doc?: string;
  anchor?: string;
  at: number;
}

export interface TestRecord {
  at: number;
  mode: 'practice' | 'exam';
  total: number;
  correct: number;
  secs: number;
  docs: string[];
}

export interface State {
  profile: { lang: Lang; role: Role | null; examDate?: string; docs?: string[]; fontSize: number };
  read: Record<string, Record<string, number>>; // doc → unit → когда прочитано
  last?: { doc: string; unit: string; at: number };
  bookmarks: Record<string, Bookmark>; // `${doc}#${anchor}`
  userCards: Record<string, UserCard>;
  qstats: Record<string, { seen: number; correct: number; lastWrong?: boolean; doc: string }>;
  cards: Record<string, CardState>;
  history: TestRecord[];
  mistakes: Record<string, Question>; // вопросы с ошибками — для теста «Мои ошибки»
  activity: Record<string, { read: number; answered: number; reviewed: number }>;
}

const KEY = 'ogp:v1';
const initial: State = {
  profile: { lang: 'uz', role: null, fontSize: 18 },
  read: {},
  bookmarks: {},
  userCards: {},
  qstats: {},
  cards: {},
  history: [],
  mistakes: {},
  activity: {},
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...initial, ...s, profile: { ...initial.profile, ...s.profile } };
    }
  } catch {
    /* приватный режим / повреждённые данные — начинаем с нуля */
  }
  return initial;
}

let state = load();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

export function getState() {
  return state;
}

export function setState(fn: (s: State) => State) {
  state = fn(state);
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* хранилище недоступно — прогресс живёт до закрытия вкладки */
    }
  }, 300);
}

export function replaceState(s: State) {
  setState(() => ({ ...initial, ...s, profile: { ...initial.profile, ...s.profile } }));
}

export function resetState() {
  setState((s) => ({ ...initial, profile: s.profile }));
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sel(state),
  );
}

export const today = () => new Date().toISOString().slice(0, 10);

export function bumpActivity(kind: 'read' | 'answered' | 'reviewed', n = 1) {
  setState((s) => {
    const d = today();
    const a = s.activity[d] || { read: 0, answered: 0, reviewed: 0 };
    return { ...s, activity: { ...s.activity, [d]: { ...a, [kind]: a[kind] + n } } };
  });
}

export function markUnitRead(doc: string, unit: string, value = true) {
  const wasRead = !!state.read[doc]?.[unit];
  setState((s) => {
    const d = { ...(s.read[doc] || {}) };
    if (value) d[unit] = d[unit] || Date.now();
    else delete d[unit];
    return { ...s, read: { ...s.read, [doc]: d } };
  });
  if (value && !wasRead) bumpActivity('read');
}
