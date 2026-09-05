import React, { useState } from 'react';
import { TransparencyTreemapPage } from './TransparencyTreemapPage';
import { DataFrameProvisionalPage } from '../dataframe/DataFrameProvisionalPage';
import { OpenDataCatalogPage } from '../opendata/OpenDataCatalogPage';
import { Eye, Database, ShieldCheck, Globe } from 'lucide-react';
import styles from './TransparencyDataHub.module.css';

export type TransparencySubTab = 'TREEMAP' | 'DATAFRAME' | 'OPENDATA';

interface TransparencyDataHubProps {
  initialSubTab?: TransparencySubTab;
  onSubTabChange?: (tab: TransparencySubTab) => void;
}

export const TransparencyDataHub: React.FC<TransparencyDataHubProps> = ({
  initialSubTab = 'TREEMAP',
  onSubTabChange,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<TransparencySubTab>(initialSubTab);

  const handleTabClick = (tab: TransparencySubTab) => {
    setActiveSubTab(tab);
    onSubTabChange?.(tab);
  };

  return (
    <div className={styles.container}>
      {/* Sub-navegação do Hub de Transparência */}
      <div className={styles.subNavBar} role="tablist" aria-label="Abas de Transparência e Dados">
        <div className={styles.subTabsGroup}>
          <button
            role="tab"
            aria-selected={activeSubTab === 'TREEMAP'}
            className={`${styles.subTabBtn} ${activeSubTab === 'TREEMAP' ? styles.subTabActive : ''}`}
            onClick={() => handleTabClick('TREEMAP')}
          >
            <Eye size={17} aria-hidden="true" />
            <span>Índice de Transparência, Treemap &amp; Lag DOU</span>
          </button>

          <button
            role="tab"
            aria-selected={activeSubTab === 'DATAFRAME'}
            className={`${styles.subTabBtn} ${activeSubTab === 'DATAFRAME' ? styles.subTabActive : ''}`}
            onClick={() => handleTabClick('DATAFRAME')}
          >
            <Database size={17} aria-hidden="true" />
            <span>Auditoria de Dados Brutos (DuckDB)</span>
          </button>

          <button
            role="tab"
            aria-selected={activeSubTab === 'OPENDATA'}
            className={`${styles.subTabBtn} ${activeSubTab === 'OPENDATA' ? styles.subTabActive : ''}`}
            onClick={() => handleTabClick('OPENDATA')}
          >
            <Globe size={17} aria-hidden="true" />
            <span>Catálogo de Dados Abertos (dados.gov.br)</span>
          </button>
        </div>

        <div className={styles.hubBadge}>
          <ShieldCheck size={14} aria-hidden="true" />
          <span>Base Oficial: e-Agendas, DOU e CEIS/CNEP</span>
        </div>
      </div>

      <div className={styles.contentWrapper}>
        {activeSubTab === 'TREEMAP' && <TransparencyTreemapPage />}
        {activeSubTab === 'DATAFRAME' && <DataFrameProvisionalPage />}
        {activeSubTab === 'OPENDATA' && <OpenDataCatalogPage />}
      </div>
    </div>
  );
};

