import React from 'react';
import styles from './CardKpi.module.css';

interface CardKpiProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'critical' | 'high' | 'medium' | 'low';
}

export const CardKpi: React.FC<CardKpiProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
}) => {
  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {icon && <div className={styles.iconContainer}>{icon}</div>}
      </div>
      <div className={styles.valueContainer}>
        <span className={styles.value}>{value}</span>
      </div>
      {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
    </div>
  );
};
