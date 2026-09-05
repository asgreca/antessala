import React from 'react';
import { AlertSeverity } from '../../types/alert.types';
import styles from './BadgeSeverity.module.css';

interface BadgeSeverityProps {
  severity: AlertSeverity;
  score?: number;
}

export const BadgeSeverity: React.FC<BadgeSeverityProps> = ({ severity, score }) => {
  const getLabel = () => {
    switch (severity) {
      case 'CRITICAL': return 'CRÍTICO';
      case 'HIGH': return 'ALTO';
      case 'MEDIUM': return 'MÉDIO';
      case 'LOW': return 'BAIXO';
      default: return severity;
    }
  };

  return (
    <span className={`${styles.badge} ${styles[severity.toLowerCase()]}`}>
      <span className={styles.dot} />
      <span>{getLabel()}</span>
      {score !== undefined && <span className={styles.score}>IAI {score}</span>}
    </span>
  );
};
