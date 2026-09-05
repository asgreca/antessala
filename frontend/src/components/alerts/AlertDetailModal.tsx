import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle, Clock, AlertTriangle, FileText } from 'lucide-react';
import { AlertListItem, AlertStatus } from '../../types/alert.types';
import { BadgeSeverity } from '../common/BadgeSeverity';
import styles from './AlertDetailModal.module.css';

interface AlertDetailModalProps {
  alert: AlertListItem | null;
  onClose: () => void;
  onUpdateStatus: (alertId: number, status: AlertStatus, justification: string) => Promise<void>;
  onInspectPerson: (personId: string) => void;
}

export const AlertDetailModal: React.FC<AlertDetailModalProps> = ({
  alert,
  onClose,
  onUpdateStatus,
  onInspectPerson,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<AlertStatus>('IN_REVIEW');
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!alert) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onUpdateStatus(alert.id, selectedStatus, justification);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <ShieldAlert size={22} className={styles.modalIcon} />
            <div>
              <h3>{alert.title}</h3>
              <span className={styles.alertId}>Alerta ID #{alert.id} &bull; Criado em {new Date(alert.createdAt).toLocaleString('pt-BR')}</span>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.badgeRow}>
            <BadgeSeverity severity={alert.severity} score={alert.iaiScore} />
            <span className={styles.statusBadge}>Status Atual: {alert.status}</span>
            <span className={styles.bodyTag}>Órgão: {alert.publicBodyAcronym}</span>
          </div>

          <div className={styles.section}>
            <h4>Descrição Técnica do Alerta</h4>
            <p className={styles.descriptionText}>{alert.description}</p>
          </div>

          <div className={styles.gridTwoCols}>
            <div className={styles.section}>
              <h4>Visitante / Representante</h4>
              <p className={styles.infoValue}>{alert.visitorName}</p>
              {alert.visitorId && (
                <button
                  className={styles.dossierLinkBtn}
                  onClick={() => onInspectPerson(alert.visitorId)}
                >
                  <FileText size={14} />
                  <span>Abrir Dossiê do Aposentado/Visitante</span>
                </button>
              )}
            </div>

            <div className={styles.section}>
              <h4>Empresa Representada (QSA)</h4>
              <p className={styles.infoValue}>{alert.organizationName}</p>
            </div>
          </div>

          <div className={styles.section}>
            <h4>Red Flags Acionadas ({alert.redFlags.length})</h4>
            <div className={styles.redFlagsContainer}>
              {alert.redFlags.map((flag, idx) => (
                <div key={idx} className={styles.redFlagItem}>
                  <AlertTriangle size={14} className={styles.redFlagIcon} />
                  <span>{flag}</span>
                </div>
              ))}
            </div>
          </div>

          {alert.justification && (
            <div className={styles.section}>
              <h4>Parecer Anterior de Auditoria</h4>
              <p className={styles.justificationBox}>{alert.justification}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.actionForm}>
            <h4>Atualizar Tratamento de Auditoria</h4>
            <div className={styles.statusOptions}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="status"
                  value="IN_REVIEW"
                  checked={selectedStatus === 'IN_REVIEW'}
                  onChange={() => setSelectedStatus('IN_REVIEW')}
                />
                <Clock size={16} />
                <span>Em Análise</span>
              </label>

              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="status"
                  value="ACTION_TAKEN"
                  checked={selectedStatus === 'ACTION_TAKEN'}
                  onChange={() => setSelectedStatus('ACTION_TAKEN')}
                />
                <CheckCircle size={16} />
                <span>Encaminhado para Auditoria Presencial</span>
              </label>

              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  name="status"
                  value="DISMISSED"
                  checked={selectedStatus === 'DISMISSED'}
                  onChange={() => setSelectedStatus('DISMISSED')}
                />
                <X size={16} />
                <span>Arquivado / Sem Anomalia</span>
              </label>
            </div>

            <textarea
              className={styles.textarea}
              placeholder="Digite a justificativa técnica para alteração do status..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              required
            />

            <div className={styles.footer}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className={styles.saveBtn} disabled={isSubmitting}>
                {isSubmitting ? 'Salvando...' : 'Salvar Tratamento'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
