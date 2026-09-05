import React from 'react';
import { SocietaryLink } from '../../types/dossier.types';
import { Building2, Percent, Briefcase } from 'lucide-react';
import { CompanyLogo } from '../common/CompanyLogo';
import styles from './DossierCards.module.css';

interface SocietaryLinksCardProps {
  links: SocietaryLink[];
}

export const SocietaryLinksCard: React.FC<SocietaryLinksCardProps> = ({ links }) => {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Building2 size={18} className={styles.headerIcon} />
        <h3>Vínculos Societários &amp; Representações Empresariais (QSA)</h3>
      </div>
      <div className={styles.cardBody}>
        {links.length === 0 ? (
          <p className={styles.empty}>Nenhum vínculo societário ou de representação registrado.</p>
        ) : (
          <div className={styles.grid}>
            {links.map((item, idx) => (
              <div key={idx} className={styles.itemBox}>
                <div className={styles.itemHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CompanyLogo name={item.corporateName} size={18} />
                    <span className={styles.companyName}>{item.corporateName}</span>
                  </div>
                  <span className={styles.linkTypeBadge}>{item.linkType}</span>
                </div>
                <div className={styles.itemMeta}>
                  <span className="font-mono">CNPJ: {item.cnpj}</span>
                  {item.qualification && (
                    <span>
                      <Briefcase size={12} /> {item.qualification}
                    </span>
                  )}
                  {item.capitalPercentage > 0 && (
                    <span>
                      <Percent size={12} /> {item.capitalPercentage}% do Capital Social
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
