export type Lang = 'uz' | 'ru';
export type Role = 'applicant' | 'teacher';
export type L10n = { uz: string; ru: string };

/** h — заголовок (l: 1 раздел, 2 глава, 3 параграф), a — начало статьи (n — номер), p — абзац */
export type Block =
  | { t: 'h'; l: 1 | 2 | 3; x: string }
  | { t: 'a'; n: string; x: string }
  | { t: 'p'; x: string; k?: 'def' };

export interface CatalogItem {
  id: string;
  kind: 'book' | 'npa';
  short: L10n;
  title: L10n;
  author?: string;
  date?: string;
  audience?: Role[];
  source?: Partial<Record<Lang, string>>;
  fetched?: string;
  langs: Partial<Record<Lang, { units: number; articles: number; chapters: number; chars: number }>>;
}

export interface Question {
  id: string;
  doc: string;
  art?: string;
  q: L10n;
  options: { uz: string[]; ru: string[] };
  answer: number;
  explain?: L10n;
  auto?: boolean;
}

export interface Unit {
  key: string;
  title: string;
  section?: string;
  start: number;
  end: number;
  articles: string[];
}
