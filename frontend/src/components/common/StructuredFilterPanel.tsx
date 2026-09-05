import React from 'react';
import { Filter, Calendar, Landmark, Building2, User, UserCheck, RotateCcw } from 'lucide-react';
import styles from './StructuredFilterPanel.module.css';

export interface FilterOptionsData {
  ministries?: string[];
  topCompanies?: string[];
  topVisitors?: string[];
  topAuthorities?: string[];
}

export interface StructuredFilterPanelProps {
  // Core Filter Values
  startDate: string;
  endDate: string;
  selectedMinistry: string;
  companySearch: string;
  visitorSearch: string;
  authoritySearch: string;

  // Setters
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  onMinistryChange: (val: string) => void;
  onCompanyChange: (val: string) => void;
  onVisitorChange: (val: string) => void;
  onAuthorityChange: (val: string) => void;
  onResetFilters: () => void;

  // Optional Metadata & Options
  filterOptions?: FilterOptionsData | null;
  totalElementsCount?: number;
  resultsLabelSingular?: string;
  resultsLabelPlural?: string;
  loading?: boolean;

  // Custom Controls (e.g. extra select or buttons in bottom row)
  secondaryControl?: React.ReactNode;

  // Datalist IDs to avoid DOM ID collisions if multiple panels exist
  idPrefix?: string;
}

export const StructuredFilterPanel: React.FC<StructuredFilterPanelProps> = ({
  startDate,
  endDate,
  selectedMinistry,
  companySearch,
  visitorSearch,
  authoritySearch,
  onStartDateChange,
  onEndDateChange,
  onMinistryChange,
  onCompanyChange,
  onVisitorChange,
  onAuthorityChange,
  onResetFilters,
  filterOptions,
  totalElementsCount,
  resultsLabelSingular = 'item encontrado',
  resultsLabelPlural = 'itens encontrados',
  loading = false,
  secondaryControl,
  idPrefix = 'sf',
}) => {
  const hasActiveFilters = Boolean(
    startDate ||
      endDate ||
      (selectedMinistry && selectedMinistry !== 'ALL') ||
      companySearch ||
      visitorSearch ||
      authoritySearch
  );

  const handlePresetYear = (year: string) => {
    if (year === 'ALL') {
      onStartDateChange('');
      onEndDateChange('');
    } else {
      onStartDateChange(`${year}-01-01`);
      onEndDateChange(`${year}-12-31`);
    }
  };

  const companiesListId = `${idPrefix}-companies-list`;
  const visitorsListId = `${idPrefix}-visitors-list`;
  const authoritiesListId = `${idPrefix}-authorities-list`;

  return (
    <div className={styles.filterPanel}>
      <div className={styles.filterPanelHeader}>
        <div className={styles.filterPanelTitle}>
          <Filter size={18} color="#00A859" />
          <span>Filtros Estruturados de Análise</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {totalElementsCount !== undefined && (
            <span className={styles.filterBadgeCount}>
              {loading
                ? 'Calculando...'
                : `${totalElementsCount.toLocaleString('pt-BR')} ${
                    totalElementsCount === 1 ? resultsLabelSingular : resultsLabelPlural
                  }`}
            </span>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={onResetFilters}
              title="Redefinir todos os filtros para o padrão"
            >
              <RotateCcw size={14} />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      </div>

      <div className={styles.filterGrid}>
        {/* 1. FILTRO POR DATA (PERÍODO) */}
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>
            <Calendar size={14} color="#0284C7" />
            <span>1. Período / Data</span>
          </label>
          <div className={styles.dateRangeRow}>
            <input
              type="date"
              className={styles.dateInput}
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              placeholder="Início"
              title="Data Inicial"
            />
            <span className={styles.dateSep}>até</span>
            <input
              type="date"
              className={styles.dateInput}
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              placeholder="Fim"
              title="Data Final"
            />
          </div>
        </div>

        {/* 2. FILTRO POR MINISTÉRIO */}
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>
            <Landmark size={14} color="#00A859" />
            <span>2. Ministério / Órgão</span>
          </label>
          <select
            className={styles.filterInput}
            value={selectedMinistry}
            onChange={(e) => onMinistryChange(e.target.value)}
          >
            <option value="ALL">
              Todos os Ministérios ({filterOptions?.ministries?.length || 0})
            </option>
            {filterOptions?.ministries?.map((min) => (
              <option key={min} value={min}>
                {min}
              </option>
            ))}
          </select>
        </div>

        {/* 3. FILTRO POR ENTIDADES & ORGANIZAÇÕES EXTERNAS */}
        <div className={styles.filterField}>
          <label
            className={styles.filterLabel}
            title="Empresas, Associações Setoriais, Federações, ONGs, Institutos e Sindicatos"
          >
            <Building2 size={14} color="#3B82F6" />
            <span>3. Entidades &amp; Organizações</span>
          </label>
          <input
            type="text"
            list={companiesListId}
            className={styles.filterInput}
            placeholder="Buscar por Petrobras, CNI, Febraban, Vale, FGV..."
            value={companySearch}
            onChange={(e) => onCompanyChange(e.target.value)}
            title="Empresas, Associações Setoriais, Federações, ONGs, Institutos, Sindicatos e Movimentos Sociais"
          />
          <datalist id={companiesListId}>
            {filterOptions?.topCompanies?.map((comp) => (
              <option key={comp} value={comp} />
            ))}
          </datalist>
        </div>

        {/* 4. FILTRO POR PESSOAS VISITANTES */}
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>
            <User size={14} color="#F59E0B" />
            <span>4. Pessoas Visitantes</span>
          </label>
          <input
            type="text"
            list={visitorsListId}
            className={styles.filterInput}
            placeholder="Nome do representante/visitante..."
            value={visitorSearch}
            onChange={(e) => onVisitorChange(e.target.value)}
          />
          <datalist id={visitorsListId}>
            {filterOptions?.topVisitors?.map((vis) => (
              <option key={vis} value={vis} />
            ))}
          </datalist>
        </div>

        {/* 5. FILTRO POR VISITADOS (AUTORIDADES) */}
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>
            <UserCheck size={14} color="#10B981" />
            <span>5. Visitados (Autoridade)</span>
          </label>
          <input
            type="text"
            list={authoritiesListId}
            className={styles.filterInput}
            placeholder="Nome da autoridade pública..."
            value={authoritySearch}
            onChange={(e) => onAuthorityChange(e.target.value)}
          />
          <datalist id={authoritiesListId}>
            {filterOptions?.topAuthorities?.map((auth) => (
              <option key={auth} value={auth} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Linha Inferior: Atalhos de Ano e Controles Secundários */}
      <div className={styles.filterRowBottom}>
        <div className={styles.datePresets}>
          <span className={styles.presetLabel}>Atalhos de Período:</span>
          <button
            type="button"
            className={`${styles.presetBtn} ${!startDate && !endDate ? styles.presetActive : ''}`}
            onClick={() => handlePresetYear('ALL')}
          >
            Todo o Histórico
          </button>
          <button
            type="button"
            className={`${styles.presetBtn} ${startDate === '2026-01-01' ? styles.presetActive : ''}`}
            onClick={() => handlePresetYear('2026')}
          >
            2026
          </button>
          <button
            type="button"
            className={`${styles.presetBtn} ${startDate === '2025-01-01' ? styles.presetActive : ''}`}
            onClick={() => handlePresetYear('2025')}
          >
            2025
          </button>
          <button
            type="button"
            className={`${styles.presetBtn} ${startDate === '2024-01-01' ? styles.presetActive : ''}`}
            onClick={() => handlePresetYear('2024')}
          >
            2024
          </button>
          <button
            type="button"
            className={`${styles.presetBtn} ${startDate === '2023-01-01' ? styles.presetActive : ''}`}
            onClick={() => handlePresetYear('2023')}
          >
            2023
          </button>
        </div>

        {secondaryControl && <div className={styles.secondaryControl}>{secondaryControl}</div>}
      </div>
    </div>
  );
};
