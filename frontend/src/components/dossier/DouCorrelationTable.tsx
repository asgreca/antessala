import React from 'react';
import { DouCorrelationItem } from '../../types/dossier.types';
import { FileText, Clock, TrendingUp, ExternalLink, ShieldAlert, BadgeCheck } from 'lucide-react';
import styles from './DossierCards.module.css';

interface DouCorrelationTableProps {
  correlations: DouCorrelationItem[];
}

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export const DouCorrelationTable: React.FC<DouCorrelationTableProps> = ({ correlations }) => {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <FileText size={18} className={styles.headerIconDou} />
        <h3>Atos do DOU publicados após audiências (Imprensa Nacional)</h3>
      </div>
      <div className={styles.cardBody}>
        {correlations.length === 0 ? (
          <p className={styles.empty}>
            Nenhum ato do DOU correlacionado às audiências deste ator na varredura atual.
          </p>
        ) : (
          <>
            <p className={styles.tableNote}>
              O intervalo (Δt) mede os dias entre a reunião registrada no e-Agendas e a
              publicação do ato. Correlação temporal é indício para apuração, não prova de
              causalidade.
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ato do DOU</th>
                  <th>Publicação</th>
                  <th>Órgão emissor</th>
                  <th>Intervalo (Δt)</th>
                  <th>Base do vínculo</th>
                  <th>Valor</th>
                  <th>Prova</th>
                </tr>
              </thead>
              <tbody>
                {correlations.map((c) => (
                  <tr key={c.id ?? c.actId}>
                    <td>
                      <div className={styles.actCell}>
                        <span className={styles.actType}>
                          {c.actType}
                          {c.isNoBid && (
                            <span className={styles.noBidTag} title="Contratação sem concorrência plena">
                              <ShieldAlert size={11} /> sem licitação
                            </span>
                          )}
                        </span>
                        <span className={styles.actSummary}>{c.summary}</span>
                        {c.contractedName && (
                          <span className={styles.contractedName}>
                            Contratada no ato: {c.contractedName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="font-mono">{c.publicationDate}</td>
                    <td>{c.issuingBody}</td>
                    <td>
                      <span className={styles.deltaBadge}>
                        <Clock size={12} /> {c.timeDeltaDays} dias após
                      </span>
                    </td>
                    <td>
                      {c.matchBasis === 'CNPJ' ? (
                        <span className={styles.basisStrong} title="Vínculo confirmado por CNPJ">
                          <BadgeCheck size={12} /> CNPJ
                        </span>
                      ) : (
                        <span
                          className={styles.scoreBadge}
                          title="Vínculo por semelhança de razão social — requer conferência"
                        >
                          <TrendingUp size={12} /> razão social {(c.semanticScore * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                    <td className="font-mono">
                      {c.monetaryValue > 0 ? formatCurrency(c.monetaryValue) : '—'}
                    </td>
                    <td>
                      {c.douUrl ? (
                        <a
                          className={styles.evidenceLink}
                          href={c.douUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink size={12} /> ver no DOU
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};
