import { useEffect, useState, type ReactNode } from 'react';
import { highlight } from './search';
import { setState } from './store';
import { useT } from './i18n';

export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: pct + '%' }} />
    </div>
  );
}

export function Hl({ text, q }: { text: string; q?: string }) {
  if (!q) return <>{text}</>;
  return (
    <>
      {highlight(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.s}</mark> : <span key={i}>{p.s}</span>))}
    </>
  );
}

export function Modal({ onClose, children, title }: { onClose: () => void; children: ReactNode; title: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CardEditor({
  initial,
  onDone,
}: {
  initial: { id?: string; front: string; back: string; doc?: string; anchor?: string };
  onDone: () => void;
}) {
  const { t } = useT();
  const [front, setFront] = useState(initial.front);
  const [back, setBack] = useState(initial.back);
  const save = () => {
    const id = initial.id || 'u' + Date.now().toString(36);
    setState((s) => ({
      ...s,
      userCards: { ...s.userCards, [id]: { id, front, back, doc: initial.doc, anchor: initial.anchor, at: Date.now() } },
    }));
    onDone();
  };
  return (
    <Modal title={t('addCard')} onClose={onDone}>
      <label className="field">
        <span>{t('front')}</span>
        <textarea rows={3} value={front} onChange={(e) => setFront(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('back')}</span>
        <textarea rows={6} value={back} onChange={(e) => setBack(e.target.value)} />
      </label>
      <div className="row end">
        <button className="btn primary" disabled={!front.trim() || !back.trim()} onClick={save}>
          {t('save')}
        </button>
      </div>
    </Modal>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
