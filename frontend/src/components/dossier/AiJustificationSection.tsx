import React from 'react';
import { AiSummary } from '../../types/dossier.types';
import { Bot, ShieldAlert, CheckCircle2, Bookmark } from 'lucide-react';
import styles from './DossierCards.module.css';

interface AiJustificationSectionProps {
  summary: AiSummary;
}

export const AiJustificationSection: React.FC<AiJustificationSectionProps> = ({ summary }) => {
  return (
    <div className={`${styles.card} ${styles.aiCard}`}>
      <div className={styles.cardHeader}>
        <Bot size={20} className={styles.headerIconAi} />
        <div>
          <h3>Parecer Fundamentado da IA de Auditoria</h3>
          <span className={styles.aiSubtext}>
            Análise consolidada por modelo de linguagem com score de confiança de {(summary.confidenceScore * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.executiveBox}>
          <p>{summary.executiveSummary}</p>
        </div>

        <div className={styles.redFlagsSection}>
          <h4>Red Flags Identificadas ({summary.identifiedRedFlags.length})</h4>
          <div className={styles.flagsGrid}>
            {summary.identifiedRedFlags.map((flag, idx) => (
              <div key={idx} className={styles.flagChip}>
                <ShieldAlert size={14} />
                <span>{flag}</span>
              </div>
            ))}
          </div>
        </div>

        {summary.references && summary.references.length > 0 && (
          <div className={styles.refsSection}>
            <h4>Fontes e Evidências Cruzadas</h4>
            <div className={styles.refsList}>
              {summary.references.map((ref, idx) => (
                <span key={idx} className={styles.refItem}>
                  <Bookmark size={12} /> {ref}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
