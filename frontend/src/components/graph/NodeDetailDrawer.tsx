import React from 'react';
import { X, User, Building2, Landmark, FileText, ExternalLink } from 'lucide-react';
import { GraphNodeData } from '../../types/graph.types';
import { BadgeSeverity } from '../common/BadgeSeverity';
import styles from './NodeDetailDrawer.module.css';

interface NodeDetailDrawerProps {
  nodeData: GraphNodeData | null;
  onClose: () => void;
  onOpenDossier: (personId: string) => void;
}

export const NodeDetailDrawer: React.FC<NodeDetailDrawerProps> = ({
  nodeData,
  onClose,
  onOpenDossier,
}) => {
  if (!nodeData) return null;

  const getIcon = () => {
    switch (nodeData.type) {
      case 'PERSON': return <User size={24} className={styles.iconPerson} />;
      case 'ORGANIZATION': return <Building2 size={24} className={styles.iconOrg} />;
      case 'PUBLIC_BODY': return <Landmark size={24} className={styles.iconBody} />;
      case 'DOU_ACT': return <FileText size={24} className={styles.iconDou} />;
    }
  };

  const getCleanPersonId = () => {
    if (nodeData.id.startsWith('p-')) return nodeData.id.replace('p-', '');
    return nodeData.id;
  };

  return (
    <div className={styles.drawer}>
      <div className={styles.drawerHeader}>
        <div className={styles.headerTitle}>
          {getIcon()}
          <div>
            <h3>{nodeData.label}</h3>
            <span className={styles.nodeTypeTag}>{nodeData.type}</span>
          </div>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className={styles.drawerBody}>
        {nodeData.type === 'PERSON' && (
          <div className={styles.section}>
            <h4>Atributos da Pessoa Física</h4>
            <div className={styles.infoRow}>
              <span>Status:</span>
              <strong>{nodeData.isLobbyist ? 'Articulador Multissetorial (Alta Entropia)' : 'Representante / Visitante'}</strong>
            </div>
            {nodeData.cpf && (
              <div className={styles.infoRow}>
                <span>CPF:</span>
                <strong className="font-mono">{nodeData.cpf}</strong>
              </div>
            )}
            {nodeData.iaiScore !== undefined && (
              <div className={styles.infoRow}>
                <span>Score IAI:</span>
                <BadgeSeverity
                  severity={
                    nodeData.iaiScore >= 75 ? 'CRITICAL' :
                    nodeData.iaiScore >= 50 ? 'HIGH' :
                    nodeData.iaiScore >= 25 ? 'MEDIUM' : 'LOW'
                  }
                  score={nodeData.iaiScore}
                />
              </div>
            )}

            <button
              className={styles.dossierBtn}
              onClick={() => onOpenDossier(getCleanPersonId())}
            >
              <ExternalLink size={14} />
              <span>Abrir Dossiê de Auditoria</span>
            </button>
          </div>
        )}

        {nodeData.type === 'ORGANIZATION' && (
          <div className={styles.section}>
            <h4>Dados da Organização (RFB)</h4>
            <div className={styles.infoRow}>
              <span>CNPJ:</span>
              <strong className="font-mono">{nodeData.cnpj}</strong>
            </div>
            <div className={styles.infoRow}>
              <span>Razão Social:</span>
              <strong>{nodeData.label}</strong>
            </div>
          </div>
        )}

        {nodeData.type === 'PUBLIC_BODY' && (
          <div className={styles.section}>
            <h4>Órgão Público Federal</h4>
            <div className={styles.infoRow}>
              <span>Identificação:</span>
              <strong>{nodeData.label}</strong>
            </div>
          </div>
        )}

        {nodeData.type === 'DOU_ACT' && (
          <div className={styles.section}>
            <h4>Ato Publicado no DOU</h4>
            <div className={styles.infoRow}>
              <span>Descrição:</span>
              <strong>{nodeData.label}</strong>
            </div>
            {nodeData.monetaryValue !== undefined && nodeData.monetaryValue > 0 && (
              <div className={styles.infoRow}>
                <span>Valor Monetário:</span>
                <strong className="font-mono text-low">
                  R$ {nodeData.monetaryValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
