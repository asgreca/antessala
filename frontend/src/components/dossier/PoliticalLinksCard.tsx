import React from 'react';
import { PoliticalLink } from '../../types/dossier.types';
import { DollarSign, Award, Calendar } from 'lucide-react';
import styles from './DossierCards.module.css';

interface PoliticalLinksCardProps {
  links: PoliticalLink[];
}

export const PoliticalLinksCard: React.FC<PoliticalLinksCardProps> = ({ links }) => {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <DollarSign size={18} className={styles.headerIconPolitical} />
        <h3>Vínculos Políticos &amp; Doações de Campanha (TSE)</h3>
      </div>
      <div className={styles.cardBody}>
        {links.length === 0 ? (
          <p className={styles.empty}>Nenhuma doação registrada nos dados abertos do TSE.</p>
        ) : (
          <div className={styles.grid}>
            {links.map((item, idx) => (
              <div key={idx} className={`${styles.itemBox} ${styles.politicalItem}`}>
                <div className={styles.itemHeader}>
                  <span className={styles.companyName}>Candidato: {item.candidateName}</span>
                  <span className={styles.politicalBadge}>Doação Eleitoral</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>
                    <Calendar size={12} /> Eleições {item.electionYear}
                  </span>
                  <span>
                    <Award size={12} /> Cargo: {item.disputedRole}
                  </span>
                  <span className={styles.amountText}>
                    R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
