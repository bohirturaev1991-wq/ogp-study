import { useMemo, useState } from 'react';
import { docLang, loadDoc, loadQuestions, useAsync, useCatalog } from '../data';
import { useStore, setState, bumpActivity, getState } from '../store';
import { useT } from '../i18n';
import { CardEditor, Empty } from '../components';
import { myItems } from '../progress';
import { newCard, review, intervalLabel, type Grade } from '../srs';
import { shuffle } from '../autoq';
import { href } from '../router';
import type { CatalogItem, Lang } from '../types';

interface Card {
  id: string;
  front: string;
  back: string;
  doc?: string;
  anchor?: string;
  kind: 'q' | 'def' | 'bm' | 'user';
}

const NEW_PER_SESSION = 20;

async function buildDeck(items: CatalogItem[], lang: Lang): Promise<Card[]> {
  const s = getState();
  const ids = new Set(items.map((i) => i.id));
  const cards: Card[] = [];
  const questions = await loadQuestions();
  for (const q of questions) {
    if (!ids.has(q.doc)) continue;
    const opts = q.options[lang]?.length ? q.options[lang] : q.options.uz;
    const text = q.q[lang] || q.q.uz;
    if (!text || !opts) continue;
    const ex = q.explain ? '\n\n' + (q.explain[lang] || q.explain.uz) : '';
    cards.push({ id: 'q:' + q.id, front: text, back: opts[q.answer] + ex, doc: q.doc, anchor: q.art && 'a' + q.art, kind: 'q' });
  }
  // определения из учебников: абзацы вида «> Термин — определение»
  for (const it of items.filter((i) => i.kind === 'book')) {
    const dl = docLang(it, lang);
    if (!dl) continue;
    const blocks = await loadDoc(it.id, dl);
    blocks.forEach((b, i) => {
      if (b.t !== 'p' || b.k !== 'def') return;
      const m = b.x.match(/^(.{2,80}?)\s[—–-]\s(.+)$/);
      if (!m) return;
      const back = m[2].replace(/^(это|bu)\s+/i, '');
      const front = m[1].replace(/^(Так|Итак|Например|Также|Таким образом|Следовательно),\s*/i, '');
      cards.push({ id: `d:${it.id}:${m[1]}`, front: front[0].toUpperCase() + front.slice(1), back: back[0].toUpperCase() + back.slice(1), doc: it.id, anchor: 'b' + i, kind: 'def' });
    });
  }
  for (const [k, b] of Object.entries(s.bookmarks))
    if (b.starred) cards.push({ id: 'b:' + k, front: b.label, back: b.text, doc: b.doc, anchor: b.anchor, kind: 'bm' });
  for (const c of Object.values(s.userCards)) cards.push({ id: 'c:' + c.id, front: c.front, back: c.back, doc: c.doc, anchor: c.anchor, kind: 'user' });
  return cards;
}

export default function Cards() {
  const { t } = useT();
  const [tab, setTab] = useState<'review' | 'mine' | 'notes'>('review');
  return (
    <div className="page">
      <h1>{t('cards')}</h1>
      <div className="seg tabs">
        <button className={tab === 'review' ? 'on' : ''} onClick={() => setTab('review')}>
          {t('startReview')}
        </button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          {t('myCards')}
        </button>
        <button className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>
          {t('notes')}
        </button>
      </div>
      {tab === 'review' && <Review />}
      {tab === 'mine' && <MyCards />}
      {tab === 'notes' && <Notes />}
    </div>
  );
}

export function useDeckStats() {
  const { lang } = useT();
  const { data: items } = useCatalog();
  const s = useStore((s) => s);
  const mine = items ? myItems(items, s, s.profile.role) : null;
  const { data: deck } = useAsync(() => (mine ? buildDeck(mine, lang) : Promise.resolve(null)), [
    mine?.map((i) => i.id).join(),
    lang,
    Object.keys(s.userCards).length,
    Object.values(s.bookmarks).filter((b) => b.starred).length,
  ]);
  return useMemo(() => {
    if (!deck) return null;
    const now = Date.now();
    const due = deck.filter((c) => s.cards[c.id] && s.cards[c.id].due <= now);
    const fresh = deck.filter((c) => !s.cards[c.id]);
    return { deck, due, fresh };
  }, [deck, s.cards]);
}

function Review() {
  const { t, lang } = useT();
  const stats = useDeckStats();
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [flipped, setFlipped] = useState(false);
  const cardsState = useStore((s) => s.cards);
  if (!stats) return <Empty>{t('loading')}</Empty>;

  if (!queue) {
    return (
      <div className="card center">
        <div className="stat-row">
          <div>
            <div className="big-num">{stats.due.length}</div>
            <div className="muted small">{t('due')}</div>
          </div>
          <div>
            <div className="big-num">{stats.fresh.length}</div>
            <div className="muted small">{t('newCards')}</div>
          </div>
        </div>
        <p className="muted small">{t('deckSources')}</p>
        <button
          className="btn primary wide"
          disabled={!stats.due.length && !stats.fresh.length}
          onClick={() => {
            setFlipped(false);
            setQueue([...shuffle(stats.due), ...shuffle(stats.fresh).slice(0, NEW_PER_SESSION)]);
          }}
        >
          {t('startReview')}
        </button>
      </div>
    );
  }

  const card = queue[0];
  if (!card)
    return (
      <div className="card center">
        <p>{t('doneForToday')}</p>
        <button className="btn" onClick={() => setQueue(null)}>
          OK
        </button>
      </div>
    );

  const st = cardsState[card.id] || newCard();
  const rate = (g: Grade) => {
    const next = review(st, g);
    setState((s) => ({ ...s, cards: { ...s.cards, [card.id]: next } }));
    bumpActivity('reviewed');
    setFlipped(false);
    setQueue((q) => {
      const rest = q!.slice(1);
      return g === 0 ? [...rest, card] : rest; // «не помню» — ещё раз в конце сессии
    });
  };

  return (
    <div className="flash-wrap">
      <div className="muted small">
        {queue.length} {t('due').toLowerCase()}
      </div>
      <div className={'card flashcard' + (flipped ? ' flipped' : '')} onClick={() => !flipped && setFlipped(true)}>
        <div className="fc-front">{card.front}</div>
        {flipped && (
          <>
            <hr />
            <div className="fc-back">{card.back}</div>
            {card.doc && card.anchor && (
              <a className="small" href={href('/read/' + card.doc, { a: card.anchor })} onClick={(e) => e.stopPropagation()}>
                {t('source')} →
              </a>
            )}
          </>
        )}
      </div>
      {!flipped ? (
        <button className="btn primary wide" onClick={() => setFlipped(true)}>
          {t('showAnswer')}
        </button>
      ) : (
        <div className="grades">
          {([0, 1, 2, 3] as Grade[]).map((g) => (
            <button key={g} className={'btn grade g' + g} onClick={() => rate(g)}>
              {t((['rAgain', 'rHard', 'rGood', 'rEasy'] as const)[g])}
              <span className="small">{intervalLabel(st, g, lang)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MyCards() {
  const { t } = useT();
  const cards = useStore((s) => s.userCards);
  const [edit, setEdit] = useState<{ id?: string; front: string; back: string; doc?: string; anchor?: string } | null>(null);
  const list = Object.values(cards).sort((a, b) => b.at - a.at);
  return (
    <>
      <button className="btn primary" onClick={() => setEdit({ front: '', back: '' })}>
        ＋ {t('addCard')}
      </button>
      <div className="list">
        {list.map((c) => (
          <div key={c.id} className="card mini-card">
            <div className="fc-front small">{c.front}</div>
            <div className="muted small clamp">{c.back}</div>
            <div className="row end">
              <button className="btn small ghost" onClick={() => setEdit(c)}>
                ✎
              </button>
              <button
                className="btn small ghost"
                onClick={() =>
                  setState((s) => {
                    const u = { ...s.userCards };
                    delete u[c.id];
                    return { ...s, userCards: u };
                  })
                }
              >
                {t('delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
      {edit && <CardEditor initial={edit} onDone={() => setEdit(null)} />}
    </>
  );
}

function Notes() {
  const { t, l } = useT();
  const { data: items } = useCatalog();
  const bms = useStore((s) => s.bookmarks);
  const list = Object.values(bms).sort((a, b) => a.doc.localeCompare(b.doc) || b.at - a.at);
  if (!list.length) return <Empty>{t('noNotes')}</Empty>;
  let lastDoc = '';
  return (
    <div className="list">
      {list.map((b) => {
        const head = b.doc !== lastDoc;
        lastDoc = b.doc;
        return (
          <div key={b.doc + b.anchor}>
            {head && <h3>{l(items?.find((i) => i.id === b.doc)?.title)}</h3>}
            <a className="card mini-card" href={href('/read/' + b.doc, { u: b.unit, a: b.anchor })}>
              <div className="small">
                {b.starred && '★ '}
                <b>{b.label}</b>
              </div>
              {b.note && <div className="note">✎ {b.note}</div>}
              <div className="muted small clamp">{b.text}</div>
            </a>
          </div>
        );
      })}
    </div>
  );
}
