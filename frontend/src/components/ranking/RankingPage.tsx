import React, { useState, useEffect } from 'react';
import { ActorRankingItem } from '../../types/actor.types';
import { fetchApi } from '../../services/api';
import { PageResponse } from '../../services/alertsService';
import { EntropyMeter } from './EntropyMeter';
import { 
  Users, Building2, ExternalLink, SlidersHorizontal, Info, 
  HelpCircle, Calendar, Landmark, UserCheck, RotateCcw, 
  ChevronLeft, ChevronRight, Filter, Search, User
} from 'lucide-react';
import { CompanyLogo } from '../common/CompanyLogo';
import styles from './RankingPage.module.css';

interface RankingPageProps {
  onInspectPerson: (personId: string) => void;
}

export const RankingPage: React.FC<RankingPageProps> = ({ onInspectPerson }) => {
  const [actors, setActors] = useState<ActorRankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<number>(0);
  const [totalElements, setTotalElements] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const PAGE_SIZE = 50;

  // 5 Filtros Solicitados: Data, Ministério, Empresas, Pessoas Visitantes, Visitados
  const [startDate, setStartDate] = useState<string>('2023-01-01');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedMinistry, setSelectedMinistry] = useState<string>('ALL');
  const [companySearch, setCompanySearch] = useState<string>('');
  const [visitorSearch, setVisitorSearch] = useState<string>('');
  const [authoritySearch, setAuthoritySearch] = useState<string>('');
  const [minEntropy, setMinEntropy] = useState<number>(0.0);

  // Opções de autocompletar e metadados vindos do DuckDB
  const [filterOptions, setFilterOptions] = useState<{
    ministries: string[];
    topCompanies: string[];
    topAuthorities: string[];
    topVisitors: string[];
    dateRange: { minDate: string; maxDate: string };
  } | null>(null);

  // Carrega opções de autocompletar do backend
  useEffect(() => {
    const url = selectedMinistry && selectedMinistry !== 'ALL'
      ? `/ranking/filter-options?public_body=${encodeURIComponent(selectedMinistry)}`
      : '/ranking/filter-options';

    fetchApi<{
      ministries: string[];
      topCompanies: string[];
      topAuthorities: string[];
      topVisitors: string[];
      dateRange: { minDate: string; maxDate: string };
    }>(url)
      .then(data => {
        setFilterOptions(data);
        if (data?.dateRange?.maxDate && !endDate) {
          setEndDate(data.dateRange.maxDate);
        }
      })
      .catch(err => console.warn('Falha ao obter opções de filtro:', err));
  }, [selectedMinistry]);

  const loadRanking = async (targetPage = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(targetPage));
      params.append('size', String(PAGE_SIZE));
      params.append('minEntropy', String(minEntropy));
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (selectedMinistry && selectedMinistry !== 'ALL') params.append('public_body', selectedMinistry);
      if (companySearch.trim()) params.append('entity_name', companySearch.trim());
      if (visitorSearch.trim()) params.append('lobbyist_name', visitorSearch.trim());
      if (authoritySearch.trim()) params.append('authority_name', authoritySearch.trim());

      const res = await fetchApi<PageResponse<ActorRankingItem>>(
        `/actors/ranking?${params.toString()}`
      );
      setActors(res.content);
      setTotalElements(res.totalElements);
      setTotalPages(res.totalPages || 1);
      setPage(res.number);
    } catch (err) {
      console.error('Erro ao carregar ranking:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(0);
    loadRanking(0);
  }, [startDate, endDate, selectedMinistry, companySearch, visitorSearch, authoritySearch, minEntropy]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 0 && newPage < totalPages) {
      loadRanking(newPage);
    }
  };

  const hasActiveFilters = Boolean(
    startDate || endDate || (selectedMinistry && selectedMinistry !== 'ALL') ||
    companySearch || visitorSearch || authoritySearch || minEntropy > 0
  );

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSelectedMinistry('ALL');
    setCompanySearch('');
    setVisitorSearch('');
    setAuthoritySearch('');
    setMinEntropy(0.0);
  };

  const handlePresetYear = (year: string) => {
    if (year === 'ALL') {
      setStartDate('');
      setEndDate('');
    } else {
      setStartDate(`${year}-01-01`);
      setEndDate(`${year}-12-31`);
    }
  };

  return (
    <div className={styles.container}>
      {/* Banner Principal UX Especialista */}
      <div className={styles.headerBanner}>
        <div className={styles.bannerInfo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <div className={styles.uxTag}>
              <Users size={14} /> Mapeamento de Influência Multisetorial
            </div>
          </div>
          <h2>Ranking de Representantes &amp; Entropia Temática de Trânsito (ETT)</h2>
          <p>
            Mapeamento de representantes de interesses e intermediários que transitam por múltiplos <strong>Ministérios Supervisores</strong> (ex: Saúde, Fazenda, MME) 
            e suas respectivas <strong>Autarquias, Agências Regulatórias e Fundações</strong> (ex: ANVISA, CADE, IBAMA).
          </p>
        </div>

        <div className={styles.bannerRight}>
          <div className={styles.mascotBadge}>
            <img 
              src="/antunes_mala.png" 
              alt="Robô Antunes" 
              className={styles.mascotImg} 
            />
            <div className={styles.mascotMeta}>
              <span className={styles.mascotTitle}>Robô Antunes</span>
              <span className={styles.mascotSub}>Supervisão Metodológica ETT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Caixa Explicativa Metodologia Antunes */}
      <div className={styles.explanationCallout}>
        <div className={styles.calloutTitle}>
          <HelpCircle size={16} />
          <span>Metodologia Antunes: Ministérios Supervisores vs Autarquias Vinculadas</span>
        </div>
        <p className={styles.calloutText}>
          A metodologia analítica do <strong>Robô Antunes</strong> investiga o trânsito de influência sobre os <strong>38 Ministérios Supervisores</strong> do Governo Federal e suas dezenas de autarquias e agências vinculadas (ANVISA, CADE, IBAMA, ANATEL), calculando a <strong>ETT (Entropia Temática de Trânsito)</strong> para evidenciar atores multissetoriais e pautas de maior concentração de contatos.
        </p>
      </div>

      {/* PAINEL DE FILTROS MULTIDIMENSIONAL (Data, Ministério, Empresas, Pessoas Visitantes, Visitados) */}
      <div className={styles.filterPanel}>
        <div className={styles.filterPanelHeader}>
          <div className={styles.filterPanelTitle}>
            <Filter size={18} color="#00A859" />
            <span>Filtros Estruturados de Análise</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className={styles.filterBadgeCount}>
              {loading ? 'Calculando...' : `${totalElements} ${totalElements === 1 ? 'representante encontrado' : 'representantes encontrados'}`}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleResetFilters}
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
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Início"
                title="Data Inicial da Audiência"
              />
              <span className={styles.dateSep}>até</span>
              <input
                type="date"
                className={styles.dateInput}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="Fim"
                title="Data Final da Audiência"
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
              onChange={(e) => setSelectedMinistry(e.target.value)}
            >
              <option value="ALL">Todos os Ministérios ({filterOptions?.ministries?.length || 0})</option>
              {filterOptions?.ministries?.map((min) => (
                <option key={min} value={min}>
                  {min}
                </option>
              ))}
            </select>
          </div>

          {/* 3. FILTRO POR ENTIDADES & ORGANIZAÇÕES EXTERNAS */}
          <div className={styles.filterField}>
            <label className={styles.filterLabel} title="Empresas, Associações Setoriais, Federações, ONGs, Institutos e Sindicatos">
              <Building2 size={14} color="#3B82F6" />
              <span>3. Entidades &amp; Organizações Externas</span>
            </label>
            <input
              type="text"
              list="top-companies-list"
              className={styles.filterInput}
              placeholder="Buscar por Petrobras, CNI, Febraban, MST, Vale, FGV..."
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              title="Empresas, Associações Setoriais, Federações, ONGs, Institutos, Sindicatos e Movimentos Sociais"
            />
            <datalist id="top-companies-list">
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
              list="top-visitors-list"
              className={styles.filterInput}
              placeholder="Nome do representante/visitante..."
              value={visitorSearch}
              onChange={(e) => setVisitorSearch(e.target.value)}
            />
            <datalist id="top-visitors-list">
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
              list="top-authorities-list"
              className={styles.filterInput}
              placeholder="Nome da autoridade pública..."
              value={authoritySearch}
              onChange={(e) => setAuthoritySearch(e.target.value)}
            />
            <datalist id="top-authorities-list">
              {filterOptions?.topAuthorities?.map((auth) => (
                <option key={auth} value={auth} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Linha Inferior com Atalhos de Ano e Filtro de Risco ETT */}
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SlidersHorizontal size={15} color="#64748B" />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Risco ETT:</span>
            <select
              className={styles.select}
              value={minEntropy}
              onChange={(e) => setMinEntropy(parseFloat(e.target.value))}
            >
              <option value={0.0}>Todos os Atores (ETT ≥ 0.0)</option>
              <option value={1.5}>Trânsito Elevado (ETT ≥ 1.5)</option>
              <option value={1.8}>Articuladores Multissetoriais (ETT ≥ 1.8)</option>
            </select>
          </div>
        </div>
      </div>

      {/* TABELA DE RESULTADOS DO RANKING */}
      <div className={styles.card}>
        {loading ? (
          <div className={styles.skeletonList}>
            <div className="skeleton" style={{ height: '50px', width: '100%' }} />
            <div className="skeleton" style={{ height: '50px', width: '100%' }} />
            <div className="skeleton" style={{ height: '50px', width: '100%' }} />
          </div>
        ) : actors.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748B' }}>
            <Filter size={36} color="#94A3B8" style={{ marginBottom: '12px' }} />
            <p style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
              Nenhum representante encontrado para os critérios selecionados
            </p>
            <p style={{ fontSize: '0.86rem', maxWidth: '440px', margin: '0 auto 16px' }}>
              Tente alterar as datas, o ministério ou limpar termos de busca para visualizar mais interlocutores.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                className={styles.clearBtn}
                onClick={handleResetFilters}
                style={{ margin: '0 auto' }}
              >
                <RotateCcw size={14} />
                <span>Limpar Filtros</span>
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Posição &amp; Nome do Visitante</th>
                    <th>Entropia Temática (ETT)</th>
                    <th>Reuniões</th>
                    <th>Ministérios Supervisores Visados</th>
                    <th>Entidades &amp; Organizações Representadas</th>
                    <th>Vínculos Especiais</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {actors.map((actor, idx) => {
                    const minCount = actor.distinctMinistriesCount ?? actor.distinctOrgansCount ?? 1;
                    const entCount = actor.distinctEntitiesCount ?? actor.distinctOrgansCount ?? 1;
                    const displayRank = page * PAGE_SIZE + idx + 1;

                    return (
                      <tr key={actor.id} className={styles.tr}>
                        <td>
                          <div className={styles.nameCell} style={{ cursor: 'pointer' }} onClick={() => onInspectPerson(actor.id)}>
                            <span className={styles.rankNum}>#{displayRank}</span>
                            <div>
                              <span className={styles.actorName} style={{ color: '#0284C7', textDecoration: 'underline' }}>{actor.name}</span>
                              <span className={styles.cpfText}>{actor.maskedCpf}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <EntropyMeter score={actor.entropyScore} />
                        </td>
                        <td className="font-mono">{actor.meetingsCount} audiências</td>
                        <td>
                          <div className={styles.organCell}>
                            <span className="font-bold font-mono">{minCount} Ministérios</span>
                            <span className={styles.autarchySubText}>({entCount} autarquias e agências)</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.companiesList}>
                            {actor.representedCompanies.slice(0, 2).map((comp, cIdx) => (
                              <span key={cIdx} className={styles.companyTag} title={comp}>
                                <CompanyLogo name={comp} size={15} />
                                <span>{comp}</span>
                              </span>
                            ))}
                            {actor.representedCompanies.length > 2 && (
                              <span
                                className={styles.companyMoreTag}
                                title={actor.representedCompanies.slice(2).join(', ')}
                              >
                                +{actor.representedCompanies.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className={styles.tagsContainer}>
                            {actor.isExServant && <span className={styles.tagExServant}>Ex-servidor</span>}
                            {actor.isTseDonor && <span className={styles.tagDonor}>Doador TSE</span>}
                            {!actor.isExServant && !actor.isTseDonor && <span className={styles.tagNormal}>Representante</span>}
                          </div>
                        </td>
                        <td>
                          <button
                            className={styles.dossierBtn}
                            onClick={() => {
                              onInspectPerson(actor.id);
                            }}
                          >
                            <span>Abrir Dossiê</span>
                            <ExternalLink size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação da Tabela */}
            {totalPages > 1 && (
              <div className={styles.paginationBar}>
                <span>
                  Exibindo página <strong>{page + 1}</strong> de <strong>{totalPages}</strong> ({totalElements} representantes)
                </span>
                <div className={styles.paginationControls}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page <= 0}
                    onClick={() => handlePageChange(page - 1)}
                  >
                    <ChevronLeft size={14} />
                    <span>Anterior</span>
                  </button>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page >= totalPages - 1}
                    onClick={() => handlePageChange(page + 1)}
                  >
                    <span>Próxima</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
