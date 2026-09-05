import React from 'react';
import { AudienceTimelineItem } from '../../types/dossier.types';
import { Calendar, UserCheck, AlertTriangle, CheckCircle } from 'lucide-react';
import styles from './DossierCards.module.css';

interface TimelineAudienceViewProps {
  timeline: AudienceTimelineItem[];
}

export const TimelineAudienceView: React.FC<TimelineAudienceViewProps> = ({ timeline }) => {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Calendar size={18} className={styles.headerIcon} />
        <h3>Linha do Tempo de Audiências Públicas (e-Agendas CGU)</h3>
      </div>
      <div className={styles.cardBody}>
        {timeline.length === 0 ? (
          <p className={styles.empty}>Nenhuma audiência registrada no sistema e-Agendas.</p>
        ) : (
          <div className={styles.timelineList}>
            {timeline.map((event) => (
              <div key={event.id} className={styles.timelineItem}>
                <div className={styles.timelineDot} />
                <div className={styles.timelineContent}>
                  <div className={styles.timelineTop}>
                    <span className={styles.timelineDate}>
                      {new Date(event.dateTime).toLocaleString('pt-BR')}
                    </span>
                    <span className={styles.organTag}>{event.publicBodyName}</span>
                    {event.isOpaque ? (
                      <span className={styles.opaqueBadge}>
                        <AlertTriangle size={12} /> Pauta Opaca
                      </span>
                    ) : (
                      <span className={styles.clearBadge}>
                        <CheckCircle size={12} /> Pauta Clara
                      </span>
                    )}
                  </div>

                  <div className={styles.pautaBox}>
                    <p><strong>Pauta Declarada:</strong> "{event.declaredTopic}"</p>
                    {event.disambiguatedTopic && (
                      <p className={styles.disambiguatedText}>
                        <strong>Tema Inferido por IA:</strong> {event.disambiguatedTopic}
                      </p>
                    )}
                  </div>

                  <div className={styles.authorityRow}>
                    <UserCheck size={14} />
                    <span>Autoridade Visitada: {event.authorityName}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
