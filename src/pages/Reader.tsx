import { useEffect, useMemo, useRef, useState } from 'react';
import { buildUnits, docLang, loadDoc, useAsync, useCatalog } from '../data';
import { useStore, setState, markUnitRead, getState, type Bookmark } from '../store';
import { useT } from '../i18n';
import { CardEditor, Empty, Hl, Modal, Progress, Rich } from '../components';
import { href, useRoute } from '../router';
import { useBackClose } from '../back';
import { LessonSummary } from '../summary';
import { plain, type Block, type CatalogItem, type Lang, type Unit } from '../types';

export default function Reader({ id }: { id: string }) {
  const { t, lang } = useT();
  const { data: items } = useCatalog();
  const item = items?.find((i) => i.id === id);
  const dl = item ? docLang(item, lang) : null;
  const { data: blocks, error } = useAsync(() => (dl ? loadDoc(id, dl) : Promise.resolve(null)), [id, dl]);
  if (error) return <Empty>{error.message}</Empty>;
  if (!items || blocks === undefined) return <Empty>{t('loading')}</Empty>;
  if (!item || !dl || !blocks) return <Empty>404</Empty>;
  return <ReaderView item={item} dl={dl} blocks={blocks} langMismatch={dl !== lang} />;
}

function ReaderView({ item, dl, blocks, langMismatch }: { item: CatalogItem; dl: Lang; blocks: Block[]; langMismatch: boolean }) {
  const { t, l } = useT();
  const { params } = useRoute();
  const units = useMemo(() => buildUnits(blocks, dl), [blocks, dl]);
  const readMap = useStore((s) => s.read[item.id]) || {};
  const [tocOpen, setTocOpen] = useState(false);
  const [card, setCard] = useState<{ front: string; back: string; anchor: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [showSum, setShowSum] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const anchor = params.get('a') || '';
  const hl = params.get('hl') || '';
  let unit: Unit | undefined = units.find((u) => u.key === params.get('u'));
  if (!unit && anchor.startsWith('a')) unit = units.find((u) => u.articles.includes(anchor.slice(1)));
  if (!unit && anchor.startsWith('b')) unit = units.find((u) => +anchor.slice(1) >= u.start && +anchor.slice(1) < u.end);
  if (!unit) {
    const last = getState().last;
    unit = (last?.doc === item.id && units.find((u) => u.key === last.unit)) || units.find((u) => !readMap[u.key]) || units[0];
  }
  const idx = units.indexOf(unit);
  const prev = units[idx - 1];
  const next = units[idx + 1];
  const readCount = Object.keys(readMap).length;

  useEffect(() => {
    setState((s) => ({ ...s, last: { doc: item.id, unit: unit!.key, at: Date.now() } }));
    const el = anchor && document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.classList.add('flash');
    } else topRef.current?.scrollIntoView({ block: 'start' });
  }, [item.id, unit.key, anchor]);

  // смена главы не добавляет шаг в историю: «Назад» из читалки ведёт туда, откуда её открыли
  const goUnit = (u: Unit) => location.replace(href('/read/' + item.id, { u: u.key }));
  useBackClose(tocOpen, () => setTocOpen(false));
  const docShort = l(item.short);

  return (
    <div className="reader" ref={topRef}>
      <div className="reader-head">
        <button className="btn ghost" onClick={() => setTocOpen((o) => !o)} aria-expanded={tocOpen}>
          ☰ {t('contents')}
        </button>
        <div className="reader-title">
          <div className="small muted">{l(item.title)}</div>
          <Progress value={readCount / units.length} />
        </div>
        <span className="small muted">
          {idx + 1}/{units.length}
        </span>
      </div>

      {tocOpen && (
        <Toc
          units={units}
          current={unit.key}
          readMap={readMap}
          onPick={(u) => {
            setTocOpen(false);
            goUnit(u);
          }}
        />
      )}

      {langMismatch && <div className="notice">{t('notInLang')}</div>}

      {item.kind === 'book' && (
        <div className="lesson-tools">
          <button className={'btn' + (showSum ? ' on' : '')} onClick={() => setShowSum((v) => !v)} aria-expanded={showSum}>
            🧭 {t('summary')}
          </button>
          <a className="btn" href={href('/quiz', { doc: item.id, u: unit.key })}>
            📝 {t('lessonTest')}
          </a>
        </div>
      )}
      {showSum && <LessonSummary key={unit.key} blocks={blocks.slice(unit.start, unit.end)} title={unit.title} />}

      <article className="reader-body">
        {unit.section && unit.section !== unit.title && <div className="section-label">{unit.section}</div>}
        {blocks.slice(unit.start, unit.end).map((b, k) => {
          const i = unit!.start + k;
          if (b.t === 'h') {
            if (b.l === 1 && b.x === unit!.section) return null;
            const H = b.l <= 2 ? 'h2' : 'h3';
            return (
              <H key={i} id={'b' + i}>
                <Hl text={plain(b.x)} q={hl} />
              </H>
            );
          }
          if (b.t === 'a') {
            const label = dl === 'uz' ? `${b.n}-modda.` : `Статья ${b.n}.`;
            return (
              <ArticleHead
                key={i}
                item={item}
                unit={unit!.key}
                anchor={'a' + b.n}
                label={label}
                title={b.x}
                hl={hl}
                text={() => collect(blocks, i)}
                onCard={(front, back) => setCard({ front, back, anchor: 'a' + b.n })}
                docShort={docShort}
              />
            );
          }
          if (b.t === 'img')
            return (
              <figure key={i} id={'b' + i} className="fig" onClick={() => setZoom(b.src)}>
                <img src={'content/' + b.src} alt={b.x} loading="lazy" width={b.w} height={b.h} />
                {b.x && <figcaption>{b.x}</figcaption>}
              </figure>
            );
          const bid = 'b' + i;
          const inArticle = item.kind === 'npa';
          return (
            <div key={i} className="para-wrap">
              <p
                id={bid}
                className={(b.k === 'def' ? 'def ' : '') + (selected === bid ? 'selected' : '')}
                onClick={() => !inArticle && setSelected(selected === bid ? null : bid)}
              >
                <Rich text={b.x} q={hl} />
              </p>
              {!inArticle && selected === bid && (
                <ParaActions
                  item={item}
                  unit={unit!.key}
                  anchor={bid}
                  label={unit!.title}
                  text={plain(b.x)}
                  onCard={() => setCard({ front: b.k === 'def' ? plain(b.x).split(/\s[—–-]\s/)[0] : '', back: plain(b.x), anchor: bid })}
                />
              )}
              {!inArticle && <NoteView doc={item.id} anchor={bid} />}
            </div>
          );
        })}
      </article>
      {zoom && (
        <Modal title="" onClose={() => setZoom(null)}>
          <img className="fig-zoom" src={'content/' + zoom} alt="" />
        </Modal>
      )}

      {item.kind === 'book' && (
        <a className="btn primary wide lesson-test-btn" href={href('/quiz', { doc: item.id, u: unit.key })}>
          📝 {t('lessonTest')}
        </a>
      )}
      <div className="reader-foot">
        <button
          className={'btn ' + (readMap[unit.key] ? 'done' : '')}
          onClick={() => markUnitRead(item.id, unit!.key, !readMap[unit!.key])}
        >
          {readMap[unit.key] ? t('isRead') : t('markRead')}
        </button>
        <div className="row">
          {prev && (
            <button className="btn ghost" onClick={() => goUnit(prev)}>
              ← {t('prev')}
            </button>
          )}
          {next && (
            <button
              className="btn primary"
              onClick={() => {
                markUnitRead(item.id, unit!.key);
                goUnit(next);
              }}
            >
              {t('next')} →
            </button>
          )}
        </div>
      </div>

      {card && (
        <CardEditor
          initial={{ front: card.front, back: card.back, doc: item.id, anchor: card.anchor }}
          onDone={() => setCard(null)}
        />
      )}
    </div>
  );
}

function collect(blocks: Block[], i: number) {
  const out: string[] = [];
  for (let j = i + 1; j < blocks.length && blocks[j].t === 'p'; j++) out.push(blocks[j].x);
  return out.join('\n');
}

function Toc({ units, current, readMap, onPick }: { units: Unit[]; current: string; readMap: Record<string, number>; onPick: (u: Unit) => void }) {
  let lastSection: string | undefined;
  return (
    <nav className="toc card">
      {units.map((u) => {
        const showSection = u.section && u.section !== lastSection;
        lastSection = u.section;
        return (
          <div key={u.key}>
            {showSection && <div className="toc-section">{u.section}</div>}
            <button className={'toc-item' + (u.key === current ? ' current' : '')} onClick={() => onPick(u)}>
              <span className={'tick' + (readMap[u.key] ? ' on' : '')}>{readMap[u.key] ? '✓' : ''}</span>
              <span>{u.title}</span>
              {u.articles.length > 0 && (
                <span className="muted small toc-range">
                  {u.articles[0]}
                  {u.articles.length > 1 && '–' + u.articles[u.articles.length - 1]}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function ArticleHead(props: {
  item: CatalogItem;
  unit: string;
  anchor: string;
  label: string;
  title: string;
  hl: string;
  docShort: string;
  text: () => string;
  onCard: (front: string, back: string) => void;
}) {
  const { t } = useT();
  const key = `${props.item.id}#${props.anchor}`;
  const bm = useStore((s) => s.bookmarks[key]);
  const [editing, setEditing] = useState(false);
  const fullLabel = `${props.docShort}, ${props.label.replace(/\.$/, '')}${props.title ? '. ' + props.title : ''}`;
  return (
    <>
      <h4 className="article-head" id={props.anchor}>
        <span>
          <b>{props.label}</b> <Hl text={props.title} q={props.hl} />
        </span>
        <span className="article-actions">
          <button
            className={'icon-btn' + (bm?.starred ? ' star-on' : '')}
            title={t('bookmark')}
            aria-label={t('bookmark')}
            onClick={() => toggleStar(props.item.id, props.anchor, props.unit, fullLabel, props.text())}
          >
            {bm?.starred ? '★' : '☆'}
          </button>
          <button className="icon-btn" title={t('note')} aria-label={t('note')} onClick={() => setEditing((e) => !e)}>
            ✎
          </button>
          <button className="icon-btn" title={t('makeCard')} aria-label={t('makeCard')} onClick={() => props.onCard(fullLabel, props.text())}>
            ＋
          </button>
        </span>
      </h4>
      {editing ? (
        <NoteEditor
          initial={bm?.note || ''}
          onSave={(note) => {
            saveNote(props.item.id, props.anchor, props.unit, fullLabel, props.text(), note);
            setEditing(false);
          }}
        />
      ) : (
        <NoteView doc={props.item.id} anchor={props.anchor} />
      )}
    </>
  );
}

function ParaActions(props: { item: CatalogItem; unit: string; anchor: string; label: string; text: string; onCard: () => void }) {
  const { t } = useT();
  const bm = useStore((s) => s.bookmarks[`${props.item.id}#${props.anchor}`]);
  const [editing, setEditing] = useState(false);
  return (
    <div className="para-actions">
      <button className="btn small" onClick={() => toggleStar(props.item.id, props.anchor, props.unit, props.label, props.text)}>
        {bm?.starred ? '★' : '☆'} {t('bookmark')}
      </button>
      <button className="btn small" onClick={() => setEditing(true)}>
        ✎ {t('note')}
      </button>
      <button className="btn small" onClick={props.onCard}>
        ＋ {t('makeCard')}
      </button>
      {editing && (
        <NoteEditor
          initial={bm?.note || ''}
          onSave={(note) => {
            saveNote(props.item.id, props.anchor, props.unit, props.label, props.text, note);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function NoteView({ doc, anchor }: { doc: string; anchor: string }) {
  const note = useStore((s) => s.bookmarks[`${doc}#${anchor}`]?.note);
  return note ? <div className="note">✎ {note}</div> : null;
}

function NoteEditor({ initial, onSave }: { initial: string; onSave: (s: string) => void }) {
  const { t } = useT();
  const [v, setV] = useState(initial);
  return (
    <div className="note-editor">
      <textarea autoFocus rows={3} value={v} placeholder={t('notePlaceholder')} onChange={(e) => setV(e.target.value)} />
      <button className="btn primary small" onClick={() => onSave(v.trim())}>
        {t('save')}
      </button>
    </div>
  );
}

function upsert(doc: string, anchor: string, unit: string, label: string, text: string, patch: Partial<Bookmark>) {
  const key = `${doc}#${anchor}`;
  setState((s) => {
    const cur: Bookmark = s.bookmarks[key] || { doc, anchor, unit, label, text, at: Date.now() };
    const nb = { ...cur, ...patch, label, text };
    const bookmarks = { ...s.bookmarks };
    if (!nb.starred && !nb.note) delete bookmarks[key];
    else bookmarks[key] = nb;
    return { ...s, bookmarks };
  });
}

const toggleStar = (doc: string, anchor: string, unit: string, label: string, text: string) =>
  upsert(doc, anchor, unit, label, text, { starred: !getState().bookmarks[`${doc}#${anchor}`]?.starred });

const saveNote = (doc: string, anchor: string, unit: string, label: string, text: string, note: string) =>
  upsert(doc, anchor, unit, label, text, { note: note || undefined });
