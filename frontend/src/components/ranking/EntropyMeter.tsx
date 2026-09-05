import React from 'react';
import styles from './EntropyMeter.module.css';

interface EntropyMeterProps {
  score: number;
}

export const EntropyMeter: React.FC<EntropyMeterProps> = ({ score }) => {
  // Max ETT visually calibrated to 3.0
  const percentage = Math.min(100, Math.max(0, (score / 3.0) * 100));

  const isHighRisk = score >= 2.0;

  return (
    <div className={styles.container}>
      <div className={styles.labels}>
        <span className={styles.scoreValue}>{score.toFixed(2)} ETT</span>
        <span className={isHighRisk ? styles.highRiskLabel : styles.lowRiskLabel}>
          {isHighRisk ? 'Articulador Multissetorial' : 'Especialista Setorial'}
        </span>
      </div>
      <div className={styles.track}>
        <div 
          className={`${styles.fill} ${isHighRisk ? styles.highFill : styles.normalFill}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
