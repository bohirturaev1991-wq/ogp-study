import { useRef, useState } from 'react';
import { useStore, setState, getState, replaceState, resetState } from '../store';
import { useT } from '../i18n';
import type { Lang, Role } from '../types';

export default function Settings() {
  const { t } = useT();
  const profile = useStore((s) => s.profile);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const setProfile = (p: Partial<typeof profile>) => setState((s) => ({ ...s, profile: { ...s.profile, ...p } }));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(getState())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ogp-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!data.profile) throw new Error('format');
      replaceState(data);
      setMsg(t('imported'));
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <div className="page">
      <h1>{t('settings')}</h1>
      <div className="card form">
        <div className="field">
          <span>{t('language')}</span>
          <div className="seg">
            {(['uz', 'ru'] as Lang[]).map((l) => (
              <button key={l} className={profile.lang === l ? 'on' : ''} onClick={() => setProfile({ lang: l })}>
                {l === 'uz' ? 'Oʻzbekcha' : 'Русский'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t('role')}</span>
          <div className="seg">
            {(['applicant', 'teacher'] as Role[]).map((r) => (
              <button key={r} className={profile.role === r ? 'on' : ''} onClick={() => setProfile({ role: r, docs: undefined })}>
                {t(r)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>
            {t('fontSize')}: {profile.fontSize}px
          </span>
          <input type="range" min={14} max={26} value={profile.fontSize} onChange={(e) => setProfile({ fontSize: +e.target.value })} />
        </div>
      </div>
      <h2>{t('backup')}</h2>
      <div className="card form">
        <p className="muted small">{t('backupHint')}</p>
        <div className="row">
          <button className="btn" onClick={exportData}>
            ⬇ {t('exportBtn')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ {t('importBtn')}
          </button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
        </div>
        {msg && <div className="notice">{msg}</div>}
        <button className="btn danger" onClick={() => confirm(t('resetConfirm')) && resetState()}>
          {t('reset')}
        </button>
      </div>
    </div>
  );
}
