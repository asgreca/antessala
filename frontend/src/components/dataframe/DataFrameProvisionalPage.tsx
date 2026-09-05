import React, { useState, useEffect } from 'react';
import { dataframeService } from '../../services/dataframeService';
import { DataFrameAnalyticsResponse, DataFrameStatsResponse } from '../../types/dataframe.types';
import { CardKpi } from '../common/CardKpi';
import { Table, Database, Search, Code, Bot, TrendingUp, Building2 } from 'lucide-react';
import styles from './DataFrameProvisionalPage.module.css';

export const DataFrameProvisionalPage: React.FC = () => {
  const [data, setData] = useState<DataFrameAnalyticsResponse | null>(null);
  const [stats, setStats] = useState<DataFrameStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showJson, setShowJson] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dfRes, statsRes] = await Promise.all([
        dataframeService.getDataFrame(search),
        dataframeService.getStats(),
      ]);
      setData(dfRes);
      setStats(statsRes);
    } catch (err) {
      console.error('Erro ao carregar DataFrame Python:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search]);

  return (
    <div className={styles.container}>
      <div className={styles.headerBanner}>
        <div className={styles.bannerInfo}>
          <div className={styles.pythonBadge}>Python / Pandas Analytics Engine</div>
          <h2>Auditoria de Dados Brutos no Backend (DuckDB + Pandas)</h2>
          <p>
            Manipulação de DataFrames, estatísticas descritivas e agrupamentos periciais 
            centralizados em <strong>Python (FastAPI + DuckDB + Pandas)</strong> sobre a base oficial do e-Agendas e DOU.
          </p>
        </div>

        <div className={styles.actionButtons}>
          <button
            className={`${styles.toggleBtn} ${showJson ? styles.activeToggle : ''}`}
            onClick={() => setShowJson(!showJson)}
          >
            <Code size={16} />
            <span>{showJson ? 'Ver Tabela Pandas' : 'Ver Metadados / JSON'}</span>
          </button>
        </div>
      </div>

      <div className={styles.kpiGrid}>
        <CardKpi
          title="Linhas no DataFrame"
          value={data?.shape.rows ? data.shape.rows.toLocaleString('pt-BR') : '-'}
          subtitle="Registros processados"
          variant="default"
          icon={<Table size={20} />}
        />
        <CardKpi
          title="Colunas Pandas"
          value={data?.shape.columns ?? '-'}
          subtitle="Atributos estruturados"
          variant="low"
          icon={<Database size={20} />}
        />
        <CardKpi
          title="Valor Total DOU"
          value={stats ? `R$ ${(stats.total_monetary_value_dou / 1e9).toFixed(2)} Bi` : '-'}
          subtitle="Atos de Inexigibilidade/Aditivos"
          variant="low"
          icon={<TrendingUp size={20} />}
        />
        <CardKpi
          title="Órgão Mais Visitado"
          value={stats?.body_counts ? Object.keys(stats.body_counts)[0] : '-'}
          subtitle="Registros no e-Agendas"
          variant="default"
          icon={<Building2 size={20} />}
        />
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filtrar DataFrame por nome, empresa, CNPJ, pauta ou órgão..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className={styles.colsInfo}>
            Pandas DataFrame Shape: [{data?.shape.rows} linhas × {data?.shape.columns} colunas]
          </span>
        </div>

        {loading ? (
          <div className={styles.loadingBox}>
            <div className="skeleton" style={{ height: '40px', width: '100%' }} />
            <div className="skeleton" style={{ height: '40px', width: '100%' }} />
            <div className="skeleton" style={{ height: '40px', width: '100%' }} />
          </div>
        ) : showJson ? (
          <pre className={styles.jsonBox}>
            {JSON.stringify({ shape: data?.shape, dtypes: data?.dtypes, records: data?.records }, null, 2)}
          </pre>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {data?.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.records.map((row: any, rIdx) => (
                  <tr key={rIdx} className={styles.tr}>
                    <td className="font-mono">{row.event_id ?? '-'}</td>
                    <td className="font-mono">{row.date_time ?? '-'}</td>
                    <td><strong>{row.visitor_name || row.lobbyist_name || 'Desconhecido'}</strong></td>
                    <td className="font-mono">{row.masked_cpf ?? row.cpf ?? 'não disponível'}</td>
                    <td>{row.role || '-'}</td>
                    <td>{row.company_name || row.entity_name || '-'}</td>
                    <td className="font-mono">{row.cnpj || '-'}</td>
                    <td><span className={styles.bodyBadge}>{row.public_body || '-'}</span></td>
                    <td className={styles.topicCell}>{row.declared_topic || row.main_topic || '-'}</td>
                    <td className={styles.llmCell}>
                      <Bot size={14} className={styles.botIcon} />
                      <span>{row.disambiguated_topic_llm || row.act_type || 'Auditoria Automatizada'}</span>
                    </td>
                    <td className="font-mono"><strong>{typeof row.entropy_ett === 'number' ? row.entropy_ett.toFixed(2) : (row.delta_days ?? '-')}</strong></td>
                    <td className="font-mono">{row.iai_score ?? row.risk_score ?? '-'}</td>
                    <td className="font-mono">{row.red_flags_count ?? row.correlations ?? 0}</td>
                    <td>{row.dou_act_correlated || row.act_type || '-'}</td>
                    <td className="font-mono">
                      {(row.dou_monetary_value || row.dou_value) > 0
                        ? `R$ ${Number(row.dou_monetary_value || row.dou_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
