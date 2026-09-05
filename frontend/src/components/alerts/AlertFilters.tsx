import React from 'react';
import { Filter } from 'lucide-react';
import { AlertSeverity } from '../../types/alert.types';
import styles from './AlertFilters.module.css';

interface AlertFiltersProps {
  selectedSeverity?: AlertSeverity;
  onSeverityChange: (severity?: AlertSeverity) => void;
}

export const AlertFilters: React.FC<AlertFiltersProps> = ({
  selectedSeverity,
  onSeverityChange,
}) => {
  return (
    <div className={styles.filterBar}>
      <div className={styles.titleGroup}>
        <Filter size={16} />
        <span>Filtrar por Severidade:</span>
      </div>

      <div className={styles.buttonGroup}>
        <button
          className={`${styles.filterBtn} ${!selectedSeverity ? styles.active : ''}`}
          onClick={() => onSeverityChange(undefined)}
        >
          TODOS
        </button>
        <button
          className={`${styles.filterBtn} ${styles.criticalBtn} ${selectedSeverity === 'CRITICAL' ? styles.activeCritical : ''}`}
          onClick={() => onSeverityChange('CRITICAL')}
        >
          CRÍTICO
        </button>
        <button
          className={`${styles.filterBtn} ${styles.highBtn} ${selectedSeverity === 'HIGH' ? styles.activeHigh : ''}`}
          onClick={() => onSeverityChange('HIGH')}
        >
          ALTO
        </button>
        <button
          className={`${styles.filterBtn} ${styles.mediumBtn} ${selectedSeverity === 'MEDIUM' ? styles.activeMedium : ''}`}
          onClick={() => onSeverityChange('MEDIUM')}
        >
          MÉDIO
        </button>
        <button
          className={`${styles.filterBtn} ${styles.lowBtn} ${selectedSeverity === 'LOW' ? styles.activeLow : ''}`}
          onClick={() => onSeverityChange('LOW')}
        >
          BAIXO
        </button>
      </div>
    </div>
  );
};
