import { useState } from 'react';
import { setState } from '../store';
import { tr } from '../i18n';
import type { Lang, Role } from '../types';

export default function Onboarding() {
  const [lang, setLang] = useState<Lang>('uz');
  const [role, setRole] = useState<Role | null>(null);
  const t = (k: Parameters<typeof tr>[1]) => tr(lang, k);
  return (
    <div className="onboarding">
      <div className="card onboarding-card">
        <img src="icon.svg" alt="" width={64} height={64} />
        <h1>{t('appName')}</h1>
        <p className="muted">{t('welcome')}</p>
        <h3>{t('chooseLang')}</h3>
        <div className="seg">
          <button className={lang === 'uz' ? 'on' : ''} onClick={() => setLang('uz')}>
            Oʻzbekcha
          </button>
          <button className={lang === 'ru' ? 'on' : ''} onClick={() => setLang('ru')}>
            Русский
          </button>
        </div>
        <h3>{t('whoAreYou')}</h3>
        <div className="choice-list">
          {(['applicant', 'teacher'] as Role[]).map((r) => (
            <button key={r} className={'choice ' + (role === r ? 'on' : '')} onClick={() => setRole(r)}>
              <span className="choice-icon">{r === 'applicant' ? '🎓' : '👩‍🏫'}</span>
              {t(r)}
            </button>
          ))}
        </div>
        <button
          className="btn primary wide"
          disabled={!role}
          onClick={() => setState((s) => ({ ...s, profile: { ...s.profile, lang, role } }))}
        >
          {t('go')}
        </button>
      </div>
    </div>
  );
}
