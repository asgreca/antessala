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
          <h2>Aba Provisória: DataFrame Tratado no Backend (Python)</h2>
          <p>
            Toda a manipulação de DataFrames, pré-processamento de tabelas, estatísticas descritivas e chamadas a modelos de linguagem (LLM) 
            estão centralizadas no backend em <strong>Python (FastAPI + Pandas + NumPy)</strong>.
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
          value={data?.shape.rows ?? '-'}
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
          value={stats ? `R$ ${(stats.total_monetary_value_dou / 1e6).toFixed(1)}M` : '-'}
          subtitle="Atos de Inexigibilidade/Aditivos"
          variant="critical"
          icon={<TrendingUp size={20} />}
        />
        <CardKpi
          title="Órgão Mais Visitado"
          value={stats?.body_counts ? Object.keys(stats.body_counts)[0] : '-'}
          subtitle="Ministério da Saúde (MS)"
          variant="high"
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
                {data?.records.map((row, rIdx) => (
                  <tr key={rIdx} className={styles.tr}>
                    <td className="font-mono">{row.event_id}</td>
                    <td className="font-mono">{row.date_time}</td>
                    <td><strong>{row.visitor_name}</strong></td>
                    <td className="font-mono">{row.masked_cpf}</td>
                    <td>{row.role}</td>
                    <td>{row.company_name}</td>
                    <td className="font-mono">{row.cnpj}</td>
                    <td><span className={styles.bodyBadge}>{row.public_body}</span></td>
                    <td className={styles.topicCell}>{row.declared_topic}</td>
                    <td className={styles.llmCell}>
                      <Bot size={14} className={styles.botIcon} />
                      <span>{row.disambiguated_topic_llm}</span>
                    </td>
                    <td className="font-mono"><strong>{row.entropy_ett.toFixed(2)}</strong></td>
                    <td className="font-mono">{row.iai_score}</td>
                    <td className="font-mono">{row.red_flags_count}</td>
                    <td>{row.dou_act_correlated}</td>
                    <td className="font-mono">
                      {row.dou_monetary_value > 0
                        ? `R$ ${row.dou_monetary_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
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
