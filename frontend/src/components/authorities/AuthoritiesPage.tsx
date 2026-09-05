import React, { useState, useEffect } from 'react';
import { Landmark, Search, Filter, AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Building2, Sparkles, X, User } from 'lucide-react';
import { AuthorityListItem, AuthoritiesListResponse } from '../../types/authority.types';
import { authorityService } from '../../services/authorityService';
import { fetchApi } from '../../services/api';
import { CompanyLogo } from '../common/CompanyLogo';
import { AuthorityAvatar } from '../common/AuthorityAvatar';
import { StructuredFilterPanel } from '../common/StructuredFilterPanel';
import styles from './AuthoritiesPage.module.css';

interface AuthoritiesPageProps {
  onInspectAuthority: (authorityName: string) => void;
}

const POPULAR_COMPANIES = ['Petrobras', 'Vale', 'JBS', 'Google', 'Ambev', 'Boeing', 'Uber', 'Claro', 'Suzano', 'Embraer'];

export const AuthoritiesPage: React.FC<AuthoritiesPageProps> = ({ onInspectAuthority }) => {
  const [data, setData] = useState<AuthoritiesListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [organ, setOrgan] = useState('ALL');
  const [sortBy, setSortBy] = useState('meetings');
  const [page, setPage] = useState(1);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [visitorSearch, setVisitorSearch] = useState('');
  const [filterOptions, setFilterOptions] = useState<any>(null);

  useEffect(() => {
    fetchApi<{
      ministries: string[];
      topCompanies: string[];
      topAuthorities: string[];
      topVisitors: string[];
      dateRange: { minDate: string; maxDate: string };
    }>('/ranking/filter-options')
      .then(setFilterOptions)
      .catch((err) => console.warn('Falha ao obter opções de filtro:', err));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    authorityService
      .getAuthorities({
        q: search.trim() || undefined,
        company: company.trim() || undefined,
        organ: organ !== 'ALL' ? organ : undefined,
        sortBy,
        page,
        size: 20,
      })
      .then((res) => setData(res))
      .catch((err) => {
        console.error('Erro ao buscar autoridades:', err);
        setError('Não foi possível carregar a lista de autoridades.');
      })
      .finally(() => setLoading(false));
  }, [search, company, organ, sortBy, page]);

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setOrgan('ALL');
    setCompany('');
    setVisitorSearch('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className={styles.container}>
      {/* Banner Principal Harmonizado */}
      <div className={styles.headerBanner}>
        <div className={styles.bannerInfo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <div className={styles.uxTag}>
              <Landmark size={14} /> Monitoramento do 1º Escalão &amp; Gabinetes
            </div>
          </div>
          <h1>Autoridades Públicas &amp; Gabinetes Federais</h1>
          <p>
            Auditoria cívica contínua de ministros, secretários e dirigentes do Executivo Federal que recebem
            representantes de interesses privados, analisando volume de audiências, pluralidade de
            acesso e cumprimento dos padrões de transparência ativa (Art. 11 do Decreto nº 10.889/2021).
          </p>
        </div>

        <div className={styles.bannerRight}>
          <div className={styles.bannerStatCard}>
            <div className={styles.statNumber}>{data?.total ? data.total.toLocaleString('pt-BR') : '5.881'}</div>
            <div className={styles.statLabel}>Autoridades Cadastradas</div>
          </div>

          <div className={styles.mascotBadge}>
            <img 
              src="/antunes_mascot.png" 
              alt="Robô Antunes" 
              className={styles.mascotImg} 
            />
            <div className={styles.mascotMeta}>
              <span className={styles.mascotTitle}>Robô Antunes</span>
              <span className={styles.mascotSub}>Vigilância de Gabinetes</span>
            </div>
          </div>
        </div>
      </div>

      {/* PAINEL DE FILTROS ESTRUTURADOS DE ANÁLISE */}
      <StructuredFilterPanel
        startDate={startDate}
        endDate={endDate}
        selectedMinistry={organ}
        companySearch={company}
        visitorSearch={visitorSearch}
        authoritySearch={search}
        onStartDateChange={(v) => { setStartDate(v); setPage(1); }}
        onEndDateChange={(v) => { setEndDate(v); setPage(1); }}
        onMinistryChange={(v) => { setOrgan(v); setPage(1); }}
        onCompanyChange={(v) => { setCompany(v); setPage(1); }}
        onVisitorChange={(v) => { setVisitorSearch(v); setPage(1); }}
        onAuthorityChange={(v) => { setSearch(v); setPage(1); }}
        onResetFilters={handleResetFilters}
        filterOptions={filterOptions}
        totalElementsCount={data?.total}
        resultsLabelSingular="autoridade encontrada"
        resultsLabelPlural="autoridades encontradas"
        loading={loading}
        idPrefix="authorities"
        secondaryControl={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Ordenar por:</span>
            <select
              className={styles.filterSelect}
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            >
              <option value="meetings">Mais Reuniões Concedidas</option>
              <option value="opacity">Maior Índice de Pautas Opacas</option>
              <option value="entities">Mais Empresas / Entidades Atendidas</option>
              <option value="lobbyists">Mais Interlocutores Recebidos</option>
            </select>
          </div>
        }
      />

      {/* Tabela de Autoridades */}
      <div className={styles.tableWrapper}>
        {loading ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748B' }}>
            Carregando autoridades públicas...
          </div>
        ) : error ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: '#EF4444' }}>
            {error}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748B' }}>
            Nenhuma autoridade pública encontrada com os filtros selecionados.
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ minWidth: '240px' }}>Autoridade Pública</th>
                  <th style={{ minWidth: '220px' }}>Órgão / Ministério</th>
                  <th style={{ minWidth: '120px' }}>
                    {company ? 'Audiências com a Empresa' : 'Total Audiências'}
                  </th>
                  <th style={{ minWidth: '120px' }}>
                    {company ? 'Empresas Atendidas' : 'Entidades Atendidas'}
                  </th>
                  <th style={{ minWidth: '110px' }}>Interlocutores</th>
                  <th style={{ minWidth: '140px' }}>Transparência de Pauta</th>
                  <th style={{ minWidth: '140px', textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((auth) => (
                  <tr key={auth.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <AuthorityAvatar
                          name={auth.authorityName}
                          role={auth.authorityRole}
                          size={40}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <button
                            type="button"
                            className={styles.authorityLinkBtn}
                            onClick={() => onInspectAuthority(auth.authorityName)}
                          >
                            {auth.authorityName}
                          </button>
                          <div className={styles.roleSubtext}>{auth.authorityRole}</div>

                          {/* Exibição das entidades representadas com logos */}
                          {auth.matchedEntities && auth.matchedEntities.length > 0 && (
                            <div className={styles.matchedEntitiesContainer}>
                              {auth.matchedEntities.slice(0, 2).map((ent, eIdx) => (
                                <span key={eIdx} className={styles.matchedEntityBadge} title={ent}>
                                  <CompanyLogo name={ent} size={13} />
                                  <span className={styles.matchedEntityText}>{ent}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>{auth.publicBody}</div>
                      <div className={styles.roleSubtext}>{auth.tierLabel}</div>
                    </td>
                    <td className="font-mono" style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      {auth.meetingsCount}
                    </td>
                    <td className="font-mono">
                      {auth.distinctEntities} {auth.distinctEntities === 1 ? 'entidade' : 'entidades'}
                    </td>
                    <td className="font-mono">
                      {auth.distinctLobbyists} visitantes
                    </td>
                    <td>
                      <span className={auth.opacityRate > 0.4 ? styles.badgeOpaque : styles.badgeClear}>
                        {Math.round(auth.opacityRate * 100)}% opaca ({auth.opaqueMeetingsCount})
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', minWidth: '140px' }}>
                      <button
                        type="button"
                        className={styles.viewDossierBtn}
                        onClick={() => onInspectAuthority(auth.authorityName)}
                      >
                        <Sparkles size={13} />
                        <span>Ver Dossiê</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Paginação */}
            <div className={styles.pagination}>
              <span>
                Mostrando página <strong>{data.page}</strong> de <strong>{data.totalPages}</strong> ({data.total} autoridades cadastradas)
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                >
                  Próxima <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
