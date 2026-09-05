import React, { useState, useEffect } from 'react';
import { transparencyService } from '../../services/transparencyService';
import { douCorrelationService } from '../../services/douCorrelationService';
import { TransparencyItem, TreemapNode } from '../../types/transparency.types';
import { DouCorrelationRecord, DouLagStats } from '../../types/dou.types';
import { CardKpi } from '../common/CardKpi';
import { Eye, PieChart, ShieldAlert, CheckCircle2, Building2, Search, Filter, Clock, FileText, ArrowRight, DollarSign, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './TransparencyTreemapPage.module.css';

export const TransparencyTreemapPage: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'TRANSPARENCY' | 'DOU_LAG'>('TRANSPARENCY');
  
  // Transparência e Treemap
  const [transparencyList, setTransparencyList] = useState<TransparencyItem[]>([]);
  const [treemapData, setTreemapData] = useState<TreemapNode | null>(null);
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [tablePage, setTablePage] = useState<number>(1);
  const PAGE_SIZE = 15;

  // Correlação Temporal DOU
  const [douRecords, setDouRecords] = useState<DouCorrelationRecord[]>([]);
  const [douStats, setDouStats] = useState<DouLagStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [transRes, treeRes, douRes, lagRes] = await Promise.all([
          transparencyService.getTransparencyIndex(100),
          transparencyService.getTreemapTopics(),
          douCorrelationService.getCorrelations(1, 30),
          douCorrelationService.getLagStats(),
        ]);
        setTransparencyList(transRes);
        setTreemapData(treeRes);
        setDouRecords(douRes.records);
        setDouStats(lagRes);
      } catch (err) {
        console.error('Erro ao carregar dados de transparência e DOU:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  type RatingCategory = 'TODOS' | 'EXCELENTE' | 'BOM' | 'RUIM' | 'PESSIMO';
  const [ratingFilter, setRatingFilter] = useState<RatingCategory>('TODOS');

  const getRatingCategory = (pct: number): 'EXCELENTE' | 'BOM' | 'RUIM' | 'PESSIMO' => {
    if (pct >= 85) return 'EXCELENTE';
    if (pct >= 70) return 'BOM';
    if (pct >= 55) return 'RUIM';
    return 'PESSIMO';
  };

  const getRatingBadgeClass = (pct: number) => {
    if (pct >= 85) return styles.pctExcelente;
    if (pct >= 70) return styles.pctBom;
    if (pct >= 55) return styles.pctRuim;
    return styles.pctPessimo;
  };

  const getRatingLabel = (pct: number) => {
    if (pct >= 85) return 'Excelente';
    if (pct >= 70) return 'Bom';
    if (pct >= 55) return 'Regular';
    return 'Crítico';
  };

  const allTreemapBodies = treemapData?.children || [];
  const ratingCounts = {
    TODOS: allTreemapBodies.length,
    EXCELENTE: allTreemapBodies.filter(c => getRatingCategory(c.transparency_index_pct ?? 0) === 'EXCELENTE').length,
    BOM: allTreemapBodies.filter(c => getRatingCategory(c.transparency_index_pct ?? 0) === 'BOM').length,
    RUIM: allTreemapBodies.filter(c => getRatingCategory(c.transparency_index_pct ?? 0) === 'RUIM').length,
    PESSIMO: allTreemapBodies.filter(c => getRatingCategory(c.transparency_index_pct ?? 0) === 'PESSIMO').length,
  };

  const displayedBodies = allTreemapBodies.filter(body => {
    if (selectedBody && body.name !== selectedBody) return false;
    if (ratingFilter !== 'TODOS' && getRatingCategory(body.transparency_index_pct ?? 0) !== ratingFilter) {
      return false;
    }
    return true;
  });

  const filteredList = transparencyList.filter(item => {
    const matchesSearch = item.public_body.toLowerCase().includes(searchFilter.toLowerCase());
    if (!matchesSearch) return false;
    if (ratingFilter !== 'TODOS' && getRatingCategory(item.transparency_index_pct ?? 0) !== ratingFilter) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const paginatedList = filteredList.slice((tablePage - 1) * PAGE_SIZE, tablePage * PAGE_SIZE);

  return (
    <div className={styles.container}>
      {/* Sub-Navegação Superior */}
      <div className={styles.subTabHeader}>
        <button
          className={`${styles.subTabBtn} ${activeSubTab === 'TRANSPARENCY' ? styles.subTabActive : ''}`}
          onClick={() => setActiveSubTab('TRANSPARENCY')}
        >
          <Eye size={18} />
          <span>Índice de Transparência &amp; Treemap Temático</span>
        </button>

        <button
          className={`${styles.subTabBtn} ${activeSubTab === 'DOU_LAG' ? styles.subTabActive : ''}`}
          onClick={() => setActiveSubTab('DOU_LAG')}
        >
          <Clock size={18} />
          <span>Correlação Temporal DOU (Tempo Reunião → Ato Oficial)</span>
        </button>
      </div>

      {activeSubTab === 'TRANSPARENCY' ? (
        <>
          {/* Banner Inicial Transparência */}
          <div className={styles.headerBanner}>
            <div className={styles.bannerInfo}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <div className={styles.badgeLabel}>
                  <Eye size={14} /> Auditoria Cidadã de Pautas Públicas (1.20M Audiências Externas)
                </div>
                <img 
                  src="/logo_antessala.png" 
                  alt="Antessala — Monitorando Agenda. Rastreando Influências." 
                  style={{ height: '34px', width: 'auto' }} 
                />
              </div>
              <h2>Índice de Transparência &amp; Treemap Temático por Ministério e Autarquia</h2>
              <p>
                Análise automatizada da clareza dos objetos e pautas de reuniões com <strong>agentes externos</strong> (representantes, consultores e empresários). 
                Reuniões estritamente internas foram desconsideradas. O índice mede se o registro é compreensível para o cidadão comum ou se utiliza pautas opacas ("visita de cortesia", "assuntos diversos").
              </p>
            </div>

            <div className={styles.mascotBadge}>
              <img src="/antunes_mascot.png" alt="Robô Antunes" className={styles.mascotImg} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>Robô Antunes</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#00A859', textTransform: 'uppercase' }}>Auditor Cidadão</div>
              </div>
            </div>
          </div>

          {/* KPI Cards Transparência */}
          <div className={styles.kpiGrid}>
            <CardKpi
              title="Índice Médio de Transparência"
              value="49.7%"
              subtitle="Pautas com objeto claro ao cidadão"
              variant="high"
              icon={<CheckCircle2 size={20} />}
            />
            <CardKpi
              title="Audiências Externas Auditadas"
              value="1.20M"
              subtitle="Filtradas reuniões internas"
              variant="default"
              icon={<PieChart size={20} />}
            />
            <CardKpi
              title="Ministérios &amp; Autarquias"
              value="230"
              subtitle="Esfera Executiva Federal"
              variant="low"
              icon={<Building2 size={20} />}
            />
            <CardKpi
              title="Pautas Opacas com Externos"
              value="604.8k"
              subtitle="Pautas genéricas ou sem detalhamento"
              variant="critical"
              icon={<ShieldAlert size={20} />}
            />
          </div>

          {/* Treemap */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.titleWithBadge}>
                <h3>Treemap de Assuntos Temáticos por Órgão Público</h3>
                <span className={styles.subTag}>Distribuição Visual de Pautas</span>
              </div>

              <div className={styles.filterControls}>
                {/* Filtro por Nível de Transparência: Excelente, Bom, Regular, Crítico */}
                <div className={styles.ratingFilterGroup}>
                  <button
                    type="button"
                    className={`${styles.ratingFilterBtn} ${ratingFilter === 'TODOS' ? styles.ratingActiveTodos : ''}`}
                    onClick={() => { setRatingFilter('TODOS'); setSelectedBody(null); setTablePage(1); }}
                  >
                    Todos ({ratingCounts.TODOS})
                  </button>
                  <button
                    type="button"
                    className={`${styles.ratingFilterBtn} ${ratingFilter === 'EXCELENTE' ? styles.ratingActiveExcelente : ''}`}
                    onClick={() => { setRatingFilter('EXCELENTE'); setSelectedBody(null); setTablePage(1); }}
                    title="Índice de Transparência ≥ 85%"
                  >
                    <span className={styles.ratingDot} style={{ background: '#00A859' }} />
                    Excelente ({ratingCounts.EXCELENTE})
                  </button>
                  <button
                    type="button"
                    className={`${styles.ratingFilterBtn} ${ratingFilter === 'BOM' ? styles.ratingActiveBom : ''}`}
                    onClick={() => { setRatingFilter('BOM'); setSelectedBody(null); setTablePage(1); }}
                    title="Índice de Transparência entre 70% e 84.9%"
                  >
                    <span className={styles.ratingDot} style={{ background: '#0284C7' }} />
                    Bom ({ratingCounts.BOM})
                  </button>
                  <button
                    type="button"
                    className={`${styles.ratingFilterBtn} ${ratingFilter === 'RUIM' ? styles.ratingActiveRuim : ''}`}
                    onClick={() => { setRatingFilter('RUIM'); setSelectedBody(null); setTablePage(1); }}
                    title="Índice de Transparência entre 55% e 69.9%"
                  >
                    <span className={styles.ratingDot} style={{ background: '#F59E0B' }} />
                    Regular ({ratingCounts.RUIM})
                  </button>
                  <button
                    type="button"
                    className={`${styles.ratingFilterBtn} ${ratingFilter === 'PESSIMO' ? styles.ratingActivePessimo : ''}`}
                    onClick={() => { setRatingFilter('PESSIMO'); setSelectedBody(null); setTablePage(1); }}
                    title="Índice de Transparência < 55%"
                  >
                    <span className={styles.ratingDot} style={{ background: '#EF4444' }} />
                    Crítico ({ratingCounts.PESSIMO})
                  </button>
                </div>

                {/* Dropdown de Seleção de Órgão Específico */}
                <div className={styles.filterArea}>
                  <Filter size={15} className={styles.filterIcon} />
                  <select
                    className={styles.selectBody}
                    value={selectedBody ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : e.target.value;
                      setSelectedBody(val);
                    }}
                  >
                    <option value="">Todos os Ministérios e Autarquias</option>
                    {treemapData?.children?.map((body) => (
                      <option key={body.name} value={body.name}>
                        {body.name} ({body.transparency_index_pct}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className={styles.treemapContainer}>
              {loading ? (
                <div className="skeleton" style={{ height: '350px', width: '100%' }} />
              ) : displayedBodies.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                  <ShieldAlert size={32} color="#94A3B8" style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0F172A' }}>Nenhum órgão encontrado nesta faixa de classificação.</p>
                  <p style={{ fontSize: '0.84rem' }}>Experimente selecionar "Todos" ou outro filtro de transparência.</p>
                </div>
              ) : (
                <div className={styles.treemapGrid}>
                  {displayedBodies.map((bodyNode, bIdx) => {
                    const badgeClass = getRatingBadgeClass(bodyNode.transparency_index_pct ?? 0);
                    const label = getRatingLabel(bodyNode.transparency_index_pct ?? 0);
                    const maxTopicVal = bodyNode.children?.[0]?.value || 1;

                    return (
                      <div
                        key={bIdx}
                        className={`${styles.bodyBox} ${selectedBody === bodyNode.name ? styles.bodyBoxActive : ''}`}
                        onClick={() => setSelectedBody(selectedBody === bodyNode.name ? null : bodyNode.name)}
                      >
                        <div className={styles.bodyBoxHeader}>
                          <span className={styles.bodyName} title={bodyNode.name}>{bodyNode.name}</span>
                          <span className={`${styles.pctBadge} ${badgeClass}`}>
                            {bodyNode.transparency_index_pct}% &bull; {label}
                          </span>
                        </div>

                        <div className={styles.topicBars}>
                          {bodyNode.children?.slice(0, 5).map((topic, tIdx) => {
                            const totalB = bodyNode.total_meetings ?? 1;
                            const pct = Math.round(((topic.value ?? 0) / totalB) * 100);
                            // Largura da barra proporcional ao principal interlocutor deste órgão (mínimo de 8% para ser sempre visível)
                            const barWidth = Math.max(8, Math.min(100, Math.round(((topic.value ?? 0) / maxTopicVal) * 100)));
                            const isOpaque = topic.name.includes('Opaco') || topic.name.includes('Cortesia');

                            return (
                              <div key={tIdx} className={styles.topicItem}>
                                <div className={styles.topicMeta}>
                                  <span className={styles.topicName} title={topic.name}>{topic.name}</span>
                                  <span className={styles.topicCount}>{topic.value?.toLocaleString('pt-BR')} ({pct}%)</span>
                                </div>
                                <div className={styles.progressTrack}>
                                  <div
                                    className={`${styles.progressBar} ${isOpaque ? styles.progressOpaque : styles.progressClear}`}
                                    style={{ width: `${barWidth}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tabela Transparência */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Ranking do Índice de Transparência nas Reuniões Externas</h3>
                <p className={styles.subText}>Avaliação de clareza do objeto tratado com agentes privados</p>
              </div>

              <div className={styles.searchBox}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Buscar Ministério ou Autarquia..."
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
                    setTablePage(1);
                  }}
                />
              </div>
            </div>

            {loading ? (
              <div className={styles.loadingBox}>
                <div className="skeleton" style={{ height: '40px', width: '100%' }} />
                <div className="skeleton" style={{ height: '40px', width: '100%' }} />
                <div className="skeleton" style={{ height: '40px', width: '100%' }} />
              </div>
            ) : (
              <>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.thCenter} style={{ width: '56px' }}>#</th>
                        <th>Ministério / Autarquia</th>
                        <th className={styles.thRight}>Reuniões Externas Auditadas</th>
                        <th style={{ minWidth: '180px' }}>Índice de Transparência</th>
                        <th className={styles.thRight}>Pautas Claras</th>
                        <th className={styles.thRight}>Pautas Opacas / Cortesia</th>
                        <th className={styles.thCenter}>Classificação de Transparência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedList.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748B' }}>
                            Nenhum órgão encontrado com os critérios de busca.
                          </td>
                        </tr>
                      ) : (
                        paginatedList.map((item, idx) => {
                          const globalRank = (tablePage - 1) * PAGE_SIZE + idx + 1;
                          const category = getRatingCategory(item.transparency_index_pct ?? 0);
                          
                          let rankClass = styles.rankBadge;
                          if (globalRank === 1) rankClass = `${styles.rankBadge} ${styles.rankTop1}`;
                          else if (globalRank === 2) rankClass = `${styles.rankBadge} ${styles.rankTop2}`;
                          else if (globalRank === 3) rankClass = `${styles.rankBadge} ${styles.rankTop3}`;

                          let barClass = styles.barGood;
                          let pillClass = styles.ratingGood;
                          if (category === 'EXCELENTE') {
                            barClass = styles.barExcelente;
                            pillClass = styles.ratingExcelente;
                          } else if (category === 'BOM') {
                            barClass = styles.barBom;
                            pillClass = styles.ratingBom;
                          } else if (category === 'RUIM') {
                            barClass = styles.barRegular;
                            pillClass = styles.ratingRegular;
                          } else {
                            barClass = styles.barCritico;
                            pillClass = styles.ratingCritico;
                          }

                          const label = getRatingLabel(item.transparency_index_pct ?? 0);

                          return (
                            <tr key={idx} className={styles.tr}>
                              <td className={styles.tdCenter}>
                                <span className={rankClass}>{globalRank}</span>
                              </td>
                              <td>
                                <div className={styles.bodyNameCell}>{item.public_body}</div>
                              </td>
                              <td className={`${styles.tdRight} font-mono`} style={{ fontWeight: 600, color: '#334155' }}>
                                {item.total_external_meetings.toLocaleString('pt-BR')}
                              </td>
                              <td>
                                <div className={styles.indexCell}>
                                  <div className={styles.indexLabelRow}>
                                    <span className={styles.indexValue}>{item.transparency_index_pct}%</span>
                                  </div>
                                  <div className={styles.miniTrack}>
                                    <div
                                      className={`${styles.miniBar} ${barClass}`}
                                      style={{ width: `${Math.min(100, Math.max(0, item.transparency_index_pct))}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className={`${styles.tdRight} font-mono`} style={{ color: '#15803D', fontWeight: 600 }}>
                                {item.clear_meetings.toLocaleString('pt-BR')}
                              </td>
                              <td className={`${styles.tdRight} font-mono`} style={{ color: '#B91C1C', fontWeight: 600 }}>
                                {item.opaque_meetings.toLocaleString('pt-BR')}
                              </td>
                              <td className={styles.tdCenter}>
                                <span className={`${styles.ratingPill} ${pillClass}`}>
                                  {label}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className={styles.tableFooter}>
                  <div>
                    Exibindo{' '}
                    <strong>
                      {filteredList.length === 0 ? 0 : (tablePage - 1) * PAGE_SIZE + 1}
                    </strong>{' '}
                    a{' '}
                    <strong>
                      {Math.min(tablePage * PAGE_SIZE, filteredList.length)}
                    </strong>{' '}
                    de <strong>{filteredList.length}</strong> órgãos auditados
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={tablePage <= 1}
                      onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={16} /> Anterior
                    </button>
                    <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#475569', margin: '0 4px' }}>
                      Página {tablePage} de {totalPages}
                    </span>
                    <button
                      type="button"
                      className={styles.pageBtn}
                      disabled={tablePage >= totalPages}
                      onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Banner Inicial Correlação Temporal DOU */}
          <div className={styles.headerBanner}>
            <div className={styles.bannerInfo}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <div className={styles.badgeLabel}>
                  <Clock size={14} /> Análise Causal &amp; Janela Temporal (Δt em Dias)
                </div>
                <img 
                  src="/logo_antessala.png" 
                  alt="Antessala — Monitorando Agenda. Rastreando Influências." 
                  style={{ height: '34px', width: 'auto' }} 
                />
              </div>
              <h2>Mapeamento de Dias Entre Reunião Privada &amp; Publicação no DOU</h2>
              <p>
                Mede o número exato de dias corridos (Δt = data publicação DOU - data visita) que transcorreram entre a visita de um representante privado a uma autoridade 
                e a publicação oficial de contratos, inexigibilidades, portarias normativas ou autorizações no <strong>Diário Oficial da União (DOU)</strong>.
              </p>
            </div>

            <div className={styles.mascotBadge}>
              <img src="/antunes_mala.png" alt="Robô Antunes" className={styles.mascotImg} />
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>Robô Antunes</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#00A859', textTransform: 'uppercase' }}>Auditoria DOU &times; e-Agendas</div>
              </div>
            </div>
          </div>

          {/* KPIs DOU */}
          <div className={styles.kpiGrid}>
            <CardKpi
              title="Média de Dias de Lag (Δt)"
              value={`${douStats?.avg_days_lag ?? 15.0} dias`}
              subtitle="Tempo médio até publicação oficial"
              variant="high"
              icon={<Clock size={20} />}
            />
            <CardKpi
              title="Atos DOU Correlacionados"
              value={douStats?.total_correlations_found.toLocaleString('pt-BR') ?? '3.000'}
              subtitle="Contratos, Inexigibilidades e Portarias"
              variant="default"
              icon={<FileText size={20} />}
            />
            <CardKpi
              title="Volume Monetário Correlacionado"
              value={`R$ ${((douStats?.total_monetary_value_correlated ?? 0) / 1e9).toFixed(1)} Bi`}
              subtitle="Contratos e Inexigibilidades DOU"
              variant="critical"
              icon={<DollarSign size={20} />}
            />
            <CardKpi
              title="Conversão Imediata (≤ 7 dias)"
              value={`${douStats?.lag_distribution['0-7 dias (Imediato / Urgente)'] ?? 720}`}
              subtitle="Publicações de extrema urgência"
              variant="low"
              icon={<Calendar size={20} />}
            />
          </div>

          {/* Histograma de Distribuição Temporal de Lag */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Distribuição da Janela Temporal de Conversão (Lag em Dias)</h3>
                <p className={styles.subText}>{douStats?.causality_insight}</p>
              </div>
            </div>

            <div className={styles.histogramBox}>
              {Object.entries(douStats?.lag_distribution ?? {}).map(([range, count], rIdx) => {
                const totalC = douStats?.total_correlations_found ?? 1;
                const pct = Math.round((count / totalC) * 100);

                return (
                  <div key={rIdx} className={styles.histItem}>
                    <div className={styles.histMeta}>
                      <span className={styles.histRange}><strong>{range}</strong></span>
                      <span className="font-mono">{count} atos DOU ({pct}%)</span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={`${styles.progressBar} ${rIdx === 0 ? styles.progressOpaque : styles.progressClear}`}
                        style={{ width: `${pct * 2.2}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabela de Linha do Tempo Causal (Audiência -> DOU) */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3>Linha do Tempo Causal: Audiência Presencial → Publicação de Ato Oficial no DOU</h3>
                <p className={styles.subText}>Exibindo atos oficiais ordenados por proximidade e valor contratual</p>
              </div>
            </div>

            {loading ? (
              <div className={styles.loadingBox}>
                <div className="skeleton" style={{ height: '40px', width: '100%' }} />
                <div className="skeleton" style={{ height: '40px', width: '100%' }} />
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Data da Visita</th>
                      <th>Visitante &amp; Autoridade</th>
                      <th>Órgão / Ministério</th>
                      <th>Data Publicação DOU</th>
                      <th>Dias Transcorridos (Δt)</th>
                      <th>Ato / Contrato Publicado</th>
                      <th>Valor Contratual</th>
                      <th>Grau de Confiança Causal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {douRecords.map((item, idx) => (
                      <tr key={idx} className={styles.tr}>
                        <td className="font-mono"><Calendar size={14} /> {item.visit_date}</td>
                        <td>
                          <div>
                            <strong>{item.visitor_name}</strong>
                            <div className={styles.subText}>Com: {item.authority_name}</div>
                          </div>
                        </td>
                        <td><span className={styles.bodyBadge}>{item.public_body}</span></td>
                        <td className="font-mono text-primary"><FileText size={14} /> {item.dou_publication_date}</td>
                        <td className="font-mono">
                          <span className={`${styles.lagBadge} ${item.days_elapsed_lag <= 7 ? styles.lagUrgent : styles.lagNormal}`}>
                            {item.days_elapsed_lag} dias decorridos
                          </span>
                        </td>
                        <td>
                          <div>
                            <strong>{item.dou_title_act}</strong>
                            <div className={styles.subText}>{item.dou_document_type}</div>
                          </div>
                        </td>
                        <td className="font-mono font-bold">
                          {item.dou_monetary_value > 0
                            ? `R$ ${item.dou_monetary_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                            : '-'}
                        </td>
                        <td>
                          <span className={styles.confidenceBadge}>
                            {(item.correlation_confidence_score * 100).toFixed(0)}% ({item.causality_assessment})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
