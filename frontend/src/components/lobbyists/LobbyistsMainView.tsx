import React, { useState } from 'react';
import { GlobalSearchBar } from '../search/GlobalSearchBar';
import { RankingPage } from '../ranking/RankingPage';
import { AlertsPage } from '../alerts/AlertsPage';
import { SearchResultItem } from '../../types/search.types';
import { Users, ShieldAlert, Search } from 'lucide-react';
import styles from './LobbyistsMainView.module.css';

interface LobbyistsMainViewProps {
  onInspectPerson: (personId: string) => void;
}

export const LobbyistsMainView: React.FC<LobbyistsMainViewProps> = ({ onInspectPerson }) => {
  const [subTab, setSubTab] = useState<'RANKING' | 'ALERTS'>('RANKING');

  const handleSelectEntity = (item: SearchResultItem) => {
    if (item.entityType === 'PERSON') {
      onInspectPerson(item.id);
    }
  };

  return (
    <div className={styles.container}>
      {/* Busca Global Unificada */}
      <div className={styles.searchHeaderBox}>
        <h2>Busca Unificada &amp; Consulta de Representantes</h2>
        <p>Pesquise qualquer representante privado, CPF ou empresa por autocomplete responsivo em tempo real.</p>
        <GlobalSearchBar onSelectEntity={handleSelectEntity} />
      </div>

      {/* Sub-Abas Internas para alternar entre Ranking e Alertas */}
      <div className={styles.subTabsHeader}>
        <button
          className={`${styles.subTabBtn} ${subTab === 'RANKING' ? styles.subTabActive : ''}`}
          onClick={() => setSubTab('RANKING')}
        >
          <Users size={18} />
          <span>Ranking de Atores &amp; Entropia (ETT)</span>
        </button>

        <button
          className={`${styles.subTabBtn} ${subTab === 'ALERTS' ? styles.subTabActive : ''}`}
          onClick={() => setSubTab('ALERTS')}
        >
          <ShieldAlert size={18} />
          <span>Central de Alertas de Auditoria</span>
        </button>
      </div>

      {/* Exibição da Visão Selecionada */}
      {subTab === 'RANKING' && (
        <RankingPage onInspectPerson={onInspectPerson} />
      )}

      {subTab === 'ALERTS' && (
        <AlertsPage onInspectPerson={onInspectPerson} />
      )}
    </div>
  );
};
