import React, { useState, useEffect } from 'react';
import { Building2, ShieldAlert, Crown, User, Loader2, ArrowRight, ExternalLink, FileText, Users } from 'lucide-react';
import { CompanyLogo } from '../common/CompanyLogo';
import { FilterBar, FilterState, EMPTY_FILTERS, Facets } from '../filters/FilterBar';
import { InteractionsTable, InteractionRow } from './InteractionsTable';
import { getApiUrl } from '../../services/api';
import styles from './MinistryFichaPage.module.css';

interface MinistryFichaPageProps {
  onInspectPerson: (personId: string, authorityName?: string) => void;
}

/** Leitura automatizada do ato: o que foi concedido e se trata da matéria da pauta. */
interface ActReading {
  granted?: string;
  beneficiary?: string;
  object?: string;
  declaredValue?: string;
  legalBasis?: string;
  relation?: 'mesma_materia' | 'materia_conexa' | 'sem_relacao' | 'indeterminado';
  relationConfidence?: number;
  relationRationale?: string;
  overridden?: boolean;
  generatedBy?: string;
  disclaimer?: string;
}

/** Ato do DOU mais próximo das reuniões DESTE par autoridade↔lobista. */
interface NearestAct {
  deltaDays: number;
  meetingDate: string;
  publicationDate: string;
  actType: string;
  actTitle: string;
  issuingBody: string;
  entityName: string;
  monetaryValue: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  matchBasis: 'CNPJ' | 'CNPJ_RAIZ' | 'RAZAO_SOCIAL';
  isNoBid: boolean;
  douUrl: string;
  reading: ActReading | null;
}

interface DirectInteractionItem {
  authorityName: string;
  authorityRole: string;
  isMinister: boolean;
  lobbyistId: string;
  lobbyistName: string;
  company: string;
  totalMeetings: number;
  criticalAlertsCount: number;
  predominantTopic: string;
  douActsCount: number;
  nearestAct: NearestAct | null;
}

interface MinistryFichaData {
  public_body: string;
  totalMeetings: number;
  transparencyIndex: number;
  criticalAlertsCount: number;
  correlatedDouAmount: number;
  directInteractions: DirectInteractionItem[];
  nonComplianceAlerts: {
    title: string;
    authority: string;
    date: string;
    severity: string;
  }[];
}

/** Escala o valor à sua própria ordem de grandeza: "R$ 0.0 Tri/Bi" zerava
 *  qualquer montante abaixo de um bilhão. */
const formatBRL = (v: number): string => {
  if (!v) return 'R$ 0';
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
  return `R$ ${v.toFixed(2)}`;
};


/** Escala fixa da régua temporal: a janela de correlação inteira. Fixa, e não
 *  relativa ao maior valor da página, para que a mesma barra signifique o mesmo
 *  intervalo em qualquer órgão que o auditor abrir. */
const SPAN_SCALE_DAYS = 365;

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'var(--severity-critical)',
  HIGH: 'var(--severity-high)',
  MEDIUM: 'var(--severity-medium)',
  LOW: 'var(--severity-low)',
};

/** O vão entre a reunião e a publicação do ato, desenhado em escala.
 *  Barra curta = ato publicado logo depois do encontro. */
const TemporalSpan: React.FC<{ act: NearestAct }> = ({ act }) => {
  const ratio = Math.min(act.deltaDays / SPAN_SCALE_DAYS, 1);
  const width = `${Math.max(ratio * 100, 2)}%`;
  const tone = SEVERITY_COLOR[act.severity] ?? 'var(--severity-low)';

  return (
    <div
      className={styles.span}
      role="img"
      aria-label={`Reunião em ${act.meetingDate}, ato publicado em ${act.publicationDate}, ${act.deltaDays} dias depois`}
    >
      <div className={styles.spanRail}>
        <span className={styles.spanNodeStart} aria-hidden="true" />
        <span
          className={styles.spanBar}
          style={{ width, background: `linear-gradient(90deg, var(--span-start), ${tone})` }}
          aria-hidden="true"
        />
        <span
          className={styles.spanNodeEnd}
          style={{ background: tone, boxShadow: `0 0 0 3px color-mix(in srgb, ${tone} 22%, transparent)` }}
          aria-hidden="true"
        />
      </div>
      <div className={styles.spanLabels}>
        <span className={styles.spanDate}>{act.meetingDate}</span>
        <strong className={styles.spanDelta} style={{ color: tone }}>
          {act.deltaDays} dias
        </strong>
        <span className={styles.spanDate}>{act.publicationDate}</span>
      </div>
    </div>
  );
};

export const MinistryFichaPage: React.FC<MinistryFichaPageProps> = ({ onInspectPerson }) => {
  const [selectedMinistry, setSelectedMinistry] = useState<string>('Ministério da Saúde');
  // A lista vem da própria base: nomes digitados à mão não batiam com os
  // valores reais de public_body no e-Agendas e devolviam 404.
  const [ministriesList, setMinistriesList] = useState<string[]>([]);
  const [fichaData, setFichaData] = useState<MinistryFichaData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  // Triagem: o auditor quase sempre quer ver primeiro os pares que já têm ato
  // publicado depois do encontro.
  const [onlyWithAct, setOnlyWithAct] = useState<boolean>(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<InteractionRow[]>([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);


  useEffect(() => {
    fetch(getApiUrl('/api/v1/analytics/bodies?limit=120'))
      .then((r) => r.json())
      .then((rows: { public_body: string }[]) =>
        setMinistriesList(rows.map((r) => r.public_body)))
      .catch(() => setMinistriesList([]));
  }, []);

  // Uma consulta serve os dois papéis: traz as relações filtradas e as opções
  // ainda disponíveis em cada filtro, já calculadas sob os filtros ativos.
  useEffect(() => {
    const complete = (d: string) => !d || /^\d{2}\/\d{2}\/\d{4}$/.test(d);
    if (!complete(filters.dateFrom) || !complete(filters.dateTo)) return;

    const params = new URLSearchParams({ size: '40', min_meetings: '1' });
    if (filters.publicBody) params.set('public_body', filters.publicBody);
    if (filters.tier) params.set('tier', filters.tier);
    if (filters.search) params.set('search', filters.search);
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);

    let cancelled = false;
    setRowsLoading(true);
    fetch(getApiUrl(`/api/v1/analytics/interactions?${params}`))
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setRows(d.records ?? []);
        setRowsTotal(d.totalElements ?? 0);
        setFacets(d.facets ?? null);
      })
      .catch(() => { if (!cancelled) { setRows([]); setRowsTotal(0); } })
      .finally(() => { if (!cancelled) setRowsLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  // O órgão escolhido no filtro é o mesmo que abre a ficha detalhada.
  useEffect(() => {
    if (filters.publicBody) setSelectedMinistry(filters.publicBody);
  }, [filters.publicBody]);

  const fetchFicha = async (bodyName: string) => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/v1/analytics/ministry-ficha?public_body=${encodeURIComponent(bodyName)}`));
      if (res.ok) {
        const data = await res.json();
        setFichaData(data);
      }
    } catch (err) {
      console.error("Erro ao buscar ficha do órgão:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFicha(selectedMinistry);
  }, [selectedMinistry]);

  return (
    <div className={styles.container}>
      <div className={styles.headerBanner}>
        <div className={styles.bannerInfo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0', fontSize: '0.74rem', fontWeight: 800, padding: '4px 12px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Building2 size={13} /> Fiscalização de Audiências &bull; CGU
            </div>
            <img 
              src="/logo_antessala.png" 
              alt="Antessala — Monitorando Agenda. Rastreando Influências." 
              style={{ height: '34px', width: 'auto' }} 
            />
          </div>
          <h2>Quem visitou quem no Executivo federal</h2>
          <p>
            Encontros entre representantes privados e autoridades p&uacute;blicas,
            com o ato do Di&aacute;rio Oficial mais pr&oacute;ximo de cada par.
            Os filtros s&atilde;o integrados: escolher um deles reduz as op&ccedil;&otilde;es
            dos demais ao que existe naquele recorte.
          </p>
        </div>

        <div className={styles.headerMascotBadge}>
          <img src="/antunes_mascot.png" alt="Robô Antunes" className={styles.headerMascotImg} />
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>Robô Antunes</div>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#00A859', textTransform: 'uppercase' }}>Auditoria Contínua</div>
          </div>
        </div>
      </div>

      <FilterBar
        value={filters}
        facets={facets}
        loading={rowsLoading}
        totalLabel={`${rowsTotal.toLocaleString('pt-BR')} relações`}
        onChange={setFilters}
      />

      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <Users size={20} color="#38BDF8" />
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              Rela&ccedil;&otilde;es visitante externo &harr; autoridade
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              Ordenadas por n&uacute;mero de encontros. Clique no visitante para abrir a ficha.
            </span>
          </div>
        </div>
        <InteractionsTable
          rows={rows}
          total={rowsTotal}
          loading={rowsLoading}
          onInspectPerson={onInspectPerson}
        />
      </div>

      {!filters.publicBody ? (
        <div className={styles.pickBodyCard}>
          <img
            src="/antunes_mala.png"
            alt="Robô Antunes aguardando seleção de ministério"
            className={styles.pickBodyMascotImg}
          />
          <div className={styles.pickBodyContent}>
            <div className={styles.pickBodyBadge}>
              <img src="/logo_antessala.png" alt="Antessala" style={{ height: '26px', width: 'auto' }} />
              <span>Auditoria Ministerial Forense</span>
            </div>
            <h4 className={styles.pickBodyTitle}>Pronto para Periciar: Selecione um Ministério ou Órgão Federal</h4>
            <p className={styles.pickBodyDesc}>
              O <strong>Robô Antunes</strong> aguarda sua seleção no filtro acima para abrir a ficha detalhada do órgão, 
              desdobrando a matriz de interações de autoridades com visitantes externos e cruzando cada encontro com os atos publicados no Diário Oficial da União.
            </p>
          </div>
        </div>
      ) : loading || !fichaData ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '12px', color: 'var(--text-muted)' }}>
          <Loader2 size={24} className="animate-spin" />
          <span>Carregando auditoria de {selectedMinistry}...</span>
        </div>
      ) : (
        <>
          {/* KPI Cards Dinâmicos do Ministério Selecionado */}
          <div className={styles.kpiGrid}>
            <div className={`${styles.kpiCard} ${styles.kpiGreen}`}>
              <span className={styles.kpiVal}>{fichaData.totalMeetings.toLocaleString()}</span>
              <span className={styles.kpiLbl}>Audiências Auditadas no Órgão</span>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiBlue}`}>
              <span className={styles.kpiVal}>{fichaData.transparencyIndex}%</span>
              <span className={styles.kpiLbl}>Índice de Transparência Cidadã</span>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiOrange}`}>
              <span className={styles.kpiVal}>{fichaData.criticalAlertsCount}</span>
              <span className={styles.kpiLbl}>Alertas Críticos Identificados</span>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiGold}`}>
              <span className={styles.kpiVal}>{formatBRL(fichaData.correlatedDouAmount)}</span>
              <span className={styles.kpiLbl}>Atos DOU Correlacionados</span>
            </div>
          </div>

          {/* MATRIZ AUTORIDADE ↔ LOBISTA, COM A EVIDÊNCIA DO DOU NA PRÓPRIA LINHA */}
          <div className={`${styles.card} ${styles.matrixSection}`}>
            <div className={styles.cardTitle}>
              <Crown size={20} color="#EAB308" />
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Quem visitou quem, e o que saiu no Diário depois</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  Encontros entre representantes privados e autoridades de {fichaData.public_body}, com o ato do DOU mais próximo de cada par
                </span>
              </div>
            </div>

            <label className={styles.triageToggle}>
              <input
                type="checkbox"
                checked={onlyWithAct}
                onChange={(e) => setOnlyWithAct(e.target.checked)}
              />
              <span>Mostrar s&oacute; encontros seguidos de ato no DOU</span>
            </label>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.colPair}>Encontro</th>
                  <th>Representa</th>
                  <th className={styles.colSpan}>
                    Reuni&atilde;o &rarr; ato no DOU
                    <span className={styles.thHint}>escala 0&ndash;365 dias</span>
                  </th>
                  <th className={styles.colAction}>A&ccedil;&atilde;o</th>
                </tr>
              </thead>
              <tbody>
                {fichaData.directInteractions &&
                  fichaData.directInteractions
                    .filter((item) => !onlyWithAct || item.nearestAct)
                    .map((item, idx) => (
                  <tr key={idx} className={item.nearestAct ? styles.rowWithAct : styles.rowQuiet}>
                    <td>
                      <div className={styles.pair}>
                        <div className={styles.pairAuthority}>
                          <strong>{item.authorityName}</strong>
                          {item.isMinister && (
                            <span className={styles.ministerBadge}>
                              <Crown size={11} /> ministro de estado
                            </span>
                          )}
                          <span className={styles.pairRole}>{item.authorityRole}</span>
                        </div>
                        <button
                          type="button"
                          className={styles.pairLobbyist}
                          onClick={() => onInspectPerson(item.lobbyistId, item.authorityName)}
                        >
                          <span className={styles.pairConnector} aria-hidden="true" />
                          <User size={12} />
                          <span>{item.lobbyistName}</span>
                        </button>
                      </div>
                    </td>

                    <td>
                      <span className={styles.companyBadge}>
                        <CompanyLogo name={item.company} size={18} />
                        <span>{item.company}</span>
                      </span>
                      <span className={styles.subtle}>
                        {item.totalMeetings} encontros
                        {item.criticalAlertsCount > 0 &&
                          ` · ${item.criticalAlertsCount} de risco`}
                      </span>
                    </td>

                    <td>
                      {item.nearestAct ? (
                        <>
                          <TemporalSpan act={item.nearestAct} />
                          <div className={styles.actLine}>
                            <span className={styles.actType}>{item.nearestAct.actType}</span>
                            {item.nearestAct.isNoBid && (
                              <span className={styles.noBidTag}>sem licita&ccedil;&atilde;o</span>
                            )}
                          </div>
                          {item.nearestAct.reading?.granted && (
                            <span className={styles.granted}>
                              <FileText size={11} />
                              <span>{item.nearestAct.reading.granted}</span>
                            </span>
                          )}
                          <span className={styles.subtle}>
                            {item.nearestAct.issuingBody}
                            {item.nearestAct.monetaryValue > 0 &&
                              ` · ${formatBRL(item.nearestAct.monetaryValue)}`}
                            {' · '}
                            {item.nearestAct.matchBasis.startsWith('CNPJ')
                              ? 'v\u00ednculo por CNPJ'
                              : 'v\u00ednculo por raz\u00e3o social'}
                            {item.douActsCount > 1 && ` · +${item.douActsCount - 1} ato(s)`}
                          </span>
                        </>
                      ) : (
                        <div className={styles.spanEmpty}>
                          <span className={styles.spanRailEmpty} aria-hidden="true" />
                          <span className={styles.subtle}>
                            nenhum ato correlacionado na varredura atual
                          </span>
                        </div>
                      )}
                    </td>

                    <td>
                      <div className={styles.actions}>
                        {item.nearestAct?.douUrl && (
                          <a
                            className={styles.evidenceBtn}
                            href={item.nearestAct.douUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={12} />
                            <span>Ver ato</span>
                          </a>
                        )}
                        <button
                          className={styles.dossierBtn}
                          onClick={() => onInspectPerson(item.lobbyistId, item.authorityName)}
                        >
                          <span>Abrir ficha</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Relatório de Alertas de Não-Conformidade do Órgão */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>
              <ShieldAlert size={18} color="#DC2626" />
              <span>Matriz de Não-Conformidades e Anomalias Regulatórias Encontradas</span>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ocorrência / Não-Conformidade</th>
                  <th>Autoridade Envolvida</th>
                  <th>Data Registro</th>
                  <th>Gravidade</th>
                </tr>
              </thead>
              <tbody>
                {fichaData.nonComplianceAlerts.map((alt, idx) => (
                  <tr key={idx}>
                    <td><strong>{alt.title}</strong></td>
                    <td>{alt.authority}</td>
                    <td className="font-mono">{alt.date}</td>
                    <td>
                      <span className={styles.badgeOpaque}>{alt.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
