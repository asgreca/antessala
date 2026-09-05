import React, { useState, useEffect } from 'react';
import { GlobalSearchBar } from '../search/GlobalSearchBar';
import { SearchResultItem } from '../../types/search.types';
import { DossierDetail } from '../../types/dossier.types';
import { dossierService } from '../../services/dossierService';
import { BadgeSeverity } from '../common/BadgeSeverity';
import { SocietaryLinksCard } from '../dossier/SocietaryLinksCard';
import { PoliticalLinksCard } from '../dossier/PoliticalLinksCard';
import { TimelineAudienceView } from '../dossier/TimelineAudienceView';
import { DouCorrelationTable } from '../dossier/DouCorrelationTable';
import { AiJustificationSection } from '../dossier/AiJustificationSection';
import { User, ShieldAlert, Share2, AlertCircle } from 'lucide-react';
import styles from './SearchDossierPage.module.css';

interface SearchDossierPageProps {
  initialPersonId?: string;
  onOpenGraphView: (personId: string) => void;
}

export const SearchDossierPage: React.FC<SearchDossierPageProps> = ({
  initialPersonId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  onOpenGraphView,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(initialPersonId);
  const [dossier, setDossier] = useState<DossierDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialPersonId) {
      setSelectedPersonId(initialPersonId);
    }
  }, [initialPersonId]);

  useEffect(() => {
    if (!selectedPersonId) return;

    const loadDossier = async () => {
      setLoading(true);
      try {
        const res = await dossierService.getDossier(selectedPersonId);
        setDossier(res);
      } catch (err) {
        console.error('Erro ao carregar dossiê:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDossier();
  }, [selectedPersonId]);

  const handleSelectEntity = (item: SearchResultItem) => {
    setNotice(null);
    if (item.entityType === 'PERSON') {
      setSelectedPersonId(item.id);
    } else {
      setNotice(`A entidade "${item.name}" é uma ${item.entityType}. Para visualizar a Ficha Unificada de Auditoria, selecione um representante (Pessoa Física).`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchHeaderBox}>
        <h2 className={styles.pageTitle}>Busca Global Unificada &amp; Dossiê de Inteligência</h2>
        <p className={styles.pageSubtitle}>
          Pesquise qualquer representante, CPF, empresa ou órgão público com autocomplete responsivo abaixo de 50ms.
        </p>
        <div className={styles.searchBarWrapper}>
          <GlobalSearchBar onSelectEntity={handleSelectEntity} />
        </div>
        {notice && (
          <div style={{ marginTop: '12px', padding: '10px 16px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-sm)', color: '#FBBF24', fontSize: '0.85rem' }}>
            {notice}
          </div>
        )}
      </div>

      {loading ? (
        <div className={styles.skeletonContainer}>
          <div className="skeleton" style={{ height: '120px', width: '100%' }} />
          <div className="skeleton" style={{ height: '200px', width: '100%' }} />
          <div className="skeleton" style={{ height: '300px', width: '100%' }} />
        </div>
      ) : dossier ? (
        <div className={styles.dossierWrapper}>
          {/* Header do Dossiê */}
          <div className={styles.dossierHeaderCard}>
            <div className={styles.headerLeft}>
              <div className={styles.avatarBox}>
                <User size={32} />
              </div>
              <div>
                <h3 className={styles.personName}>{dossier.person.name}</h3>
                <div className={styles.personMeta}>
                  <span className="font-mono">CPF: {dossier.person.maskedCpf}</span>
                  {dossier.person.isExServant && <span className={styles.exTag}>Ex-Servidor Público</span>}
                  {dossier.person.isTseDonor && <span className={styles.donorTag}>Doador TSE</span>}
                </div>
              </div>
            </div>

            <div className={styles.headerRight}>
              <div className={styles.scoreContainer}>
                <span className={styles.scoreLabel}>Índice IAI</span>
                <BadgeSeverity
                  severity={
                    dossier.person.iaiScore >= 75 ? 'CRITICAL' :
                    dossier.person.iaiScore >= 50 ? 'HIGH' :
                    dossier.person.iaiScore >= 25 ? 'MEDIUM' : 'LOW'
                  }
                  score={dossier.person.iaiScore}
                />
              </div>

              <button
                className={styles.graphViewBtn}
                onClick={() => onOpenGraphView(dossier.person.id)}
              >
                <Share2 size={16} />
                <span>Explorar Grafo de Redes</span>
              </button>
            </div>
          </div>

          {/* Grid de Seções do Dossiê */}
          <AiJustificationSection summary={dossier.aiSummary} />

          <div className={styles.twoColsGrid}>
            <SocietaryLinksCard links={dossier.societaryLinks} />
            <PoliticalLinksCard links={dossier.politicalLinks} />
          </div>

          <TimelineAudienceView timeline={dossier.audienceTimeline} />

          <DouCorrelationTable correlations={dossier.douCorrelations} />
        </div>
      ) : (
        <div className={styles.emptyPrompt}>
          <AlertCircle size={32} />
          <p>Utilize a barra de busca acima ou selecione um representante para visualizar seu Dossiê Completo.</p>
        </div>
      )}
    </div>
  );
};
