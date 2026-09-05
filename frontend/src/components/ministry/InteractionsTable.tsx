import React from 'react';
import { User, Crown, Building2, ArrowRight, FileText } from 'lucide-react';
import { CompanyLogo } from '../common/CompanyLogo';
import styles from './InteractionsTable.module.css';

export interface InteractionRow {
  visitorId: string;
  visitorName: string;
  authorityName: string;
  authorityRole: string;
  authorityTier: string;
  authorityTierLabel: string;
  isMinister: boolean;
  publicBody: string;
  meetings: number;
  firstMeeting: string;
  lastMeeting: string;
  mainEntity: string;
  distinctEntities: number;
  opaqueMeetings: number;
  opaquePct: number;
  mainTopic: string;
  douActsForEntity: number;
}

interface Props {
  rows: InteractionRow[];
  total: number;
  loading: boolean;
  onInspectPerson: (personId: string, authorityName?: string) => void;
}

/** aaaa-mm-dd -> dd/mm/aaaa */
const br = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
    : iso;

export const InteractionsTable: React.FC<Props> = ({
  rows, total, loading, onInspectPerson,
}) => {
  if (loading) {
    return (
      <div className={styles.skeletonBox}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className={styles.empty}>
        Nenhuma relação encontrada com esses filtros. Remova um deles para ampliar
        a busca.
      </p>
    );
  }

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Visitante externo</th>
            <th>Autoridade que recebeu</th>
            <th>Órgão</th>
            <th>Encontros</th>
            <th>Período</th>
            <th>Pauta predominante</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.visitorId}-${r.authorityName}-${i}`}>
              <td>
                <button
                  className={styles.visitor}
                  onClick={() => onInspectPerson(r.visitorId, r.authorityName)}
                >
                  <User size={13} />
                  <span>{r.visitorName}</span>
                </button>
                {r.mainEntity && (
                  <span className={styles.entity} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                    <CompanyLogo name={r.mainEntity} size={14} />
                    <span>{r.mainEntity}</span>
                    {r.distinctEntities > 1 && ` +${r.distinctEntities - 1}`}
                  </span>
                )}
              </td>
              <td>
                <strong className={styles.authority}>{r.authorityName}</strong>
                <span className={styles.tier} title={r.authorityRole}>
                  {r.isMinister && <Crown size={11} color="#D97706" style={{ marginRight: 3, verticalAlign: 'middle' }} />}
                  {r.authorityRole ? (r.isMinister ? r.authorityRole : r.authorityRole.length > 40 ? `${r.authorityRole.slice(0, 39)}…` : r.authorityRole) : r.authorityTierLabel}
                </span>
              </td>
              <td className={styles.body}>{r.publicBody}</td>
              <td>
                <strong className={styles.count}>{r.meetings}</strong>
                {r.opaqueMeetings > 0 && (
                  <span className={styles.opaque}>
                    {r.opaquePct}% com pauta opaca
                  </span>
                )}
              </td>
              <td className={styles.dates}>
                {br(r.firstMeeting)}
                <span> a {br(r.lastMeeting)}</span>
              </td>
              <td className={styles.topic}>{r.mainTopic || '—'}</td>
              <td>
                {r.douActsForEntity > 0 && (
                  <span className={styles.douTag}>
                    <FileText size={10} /> {r.douActsForEntity} ato(s)
                  </span>
                )}
                <button
                  className={styles.dossierBtn}
                  onClick={() => onInspectPerson(r.visitorId, r.authorityName)}
                >
                  <span>Abrir ficha</span>
                  <ArrowRight size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && (
        <p className={styles.more}>
          Exibindo {rows.length.toLocaleString('pt-BR')} de{' '}
          {total.toLocaleString('pt-BR')} relações. Estreite os filtros para
          chegar ao caso de interesse.
        </p>
      )}
    </>
  );
};
