import React, { useEffect, useState } from 'react';
import { Database, AlertTriangle, HelpCircle } from 'lucide-react';
import { AntessalaLogo } from './AntessalaLogo';
import { getApiUrl } from '../../services/api';
import styles from './Header.module.css';

interface HealthResponse {
  status: string;
  counts?: {
    meetings: number;
    entities: number;
    dou_acts: number;
    correlations: number;
  };
}

interface HeaderProps {
  onOpenSearch?: () => void;
  onNavigateHome?: () => void;
  onOpenOnboarding?: () => void;
}

const compact = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n);

export const Header: React.FC<HeaderProps> = ({ onNavigateHome, onOpenOnboarding }) => {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch(getApiUrl('/api/v1/health'))
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ status: 'degraded' }));
  }, []);

  const ok = health?.status === 'ok';
  const counts = health?.counts;

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.logoGroup} onClick={onNavigateHome} title="Ir para a página inicial do Antessala">
          <AntessalaLogo size="md" showSubtitle={true} />
        </div>

        <div className={styles.rightGroup}>
          {onOpenOnboarding && (
            <button
              type="button"
              className={styles.helpBtn}
              onClick={onOpenOnboarding}
              title="Como Funciona o Antessala — Guia Rápido do Cidadão em 60s"
            >
              <HelpCircle size={14} />
              <span>Como Funciona</span>
            </button>
          )}

          <div 
            className={styles.antunesBadge} 
            onClick={onNavigateHome}
            title="Conheça o Robô Antunes — O Auditor da República"
          >
            <img src="/antunes_mascot.png" alt="Robô Antunes" className={styles.antunesMini} />
            <span className={styles.antunesLabel}>Robô Antunes</span>
          </div>

          <div className={styles.statusBadge} title={
            ok ? 'Base carregada e consultável' : 'Base indisponível ou ingestão em andamento'
          }>
            {ok ? <span className={styles.liveDot} aria-hidden="true" /> : <AlertTriangle size={14} />}
            <span>{ok ? 'Base ativa' : 'Base indisponível'}</span>
          </div>

          <div className={styles.dataBadge} title="Contagens reais da base ingerida">
            <Database size={14} />
            <span>
              {counts
                ? `${compact(counts.meetings)} participações · ${compact(counts.dou_acts)} atos do DOU`
                : 'carregando…'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
