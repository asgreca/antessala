import React from 'react';
import { ShieldCheck, FileText, Search, Award, CheckCircle2, ArrowRight, UserCheck } from 'lucide-react';
import styles from './AntunesPage.module.css';

interface AntunesPageProps {
  onNavigateTab: (tab: 'MINISTRIES' | 'LOBBYISTS' | 'ALERTS' | 'GRAPH' | 'TRANSPARENCY') => void;
}

export const AntunesPage: React.FC<AntunesPageProps> = ({ onNavigateTab }) => {
  return (
    <div className={styles.pageContainer}>
      {/* HERO SECTION DO ANTUNES */}
      <section className={styles.heroSection}>
        <div className={styles.heroContent}>
          <div className={styles.badgeTag}>
            <ShieldCheck size={16} color="#00A859" />
            <span>O Auditor da República &bull; Inteligência Cívica</span>
          </div>

          <h1 className={styles.heroTitle}>
            Quem é o <span className={styles.highlightTitle}>Antunes</span>?
          </h1>

          <p className={styles.heroSubtitle}>
            O auditor de dados que não dorme, não tem amizades partidárias e dedica cada segundo a fiscalizar as agendas públicas de Brasília.
          </p>

          <blockquote className={styles.heroQuote}>
            &ldquo;Antunes não nasceu de uma linha de código moderna e superficial. Ele foi forjado no papel carbonado dos porões de Brasília e ganhou vida digital para garantir que nenhuma reunião passe sem transparência.&rdquo;
          </blockquote>

          <div className={styles.pillGrid}>
            <div className={styles.pillItem}>
              <CheckCircle2 size={16} color="#10B981" />
              <span>Terno Azul &amp; Gravata Verde</span>
            </div>
            <div className={styles.pillItem}>
              <CheckCircle2 size={16} color="#10B981" />
              <span>Lupa de Auditoria Forense</span>
            </div>
            <div className={styles.pillItem}>
              <CheckCircle2 size={16} color="#10B981" />
              <span>Maleta: ANTUNES - RIGOR</span>
            </div>
          </div>
        </div>

        <div className={styles.heroImageCard}>
          <img
            src="/antunes_mascot.png"
            alt="Antunes — O Auditor da República (Estilo Pixar 3D)"
            className={styles.antunesMainImg}
            onError={(e) => {
              // Fallback se a imagem não carregar
              (e.target as HTMLImageElement).src = '/antunes_mala.png';
            }}
          />
          <div className={styles.imageBadge}>
            <span>AUDITOR_ID: ANTUNES-CGU-001</span>
          </div>
        </div>
      </section>

      {/* SEÇÃO DA FILOSOFIA DE TRABALHO DO ANTUNES */}
      <section className={styles.philosophySection}>
        <h2 className={styles.sectionTitle}>
          A Filosofia de Trabalho de Antunes
        </h2>

        <div className={styles.cardsGrid}>
          <div className={styles.philosophyCard}>
            <div className={styles.cardIcon} style={{ background: '#ECFDF5', color: '#059669' }}>
              <Search size={24} />
            </div>
            <h3>- Achismo + Dados</h3>
            <p>
              Antunes não aceita especulações ou desculpas formais. Sua regra de ouro é simples: toda afirmação deve ser comprovada por registros oficiais do e-Agendas da CGU e do Diário Oficial da União.
            </p>
          </div>

          <div className={styles.philosophyCard}>
            <div className={styles.cardIcon} style={{ background: '#EFF6FF', color: '#0284C7' }}>
              <ShieldCheck size={24} />
            </div>
            <h3>Independência Absoluta</h3>
            <p>
              Antunes fiscaliza 100% das autoridades sem distinção de partido ou ideologia: da Presidência da República até as secretarias executivas de todos os 38 ministérios.
            </p>
          </div>

          <div className={styles.philosophyCard}>
            <div className={styles.cardIcon} style={{ background: '#F5F3FF', color: '#7C3AED' }}>
              <FileText size={24} />
            </div>
            <h3>Cruzamento de Evidências</h3>
            <p>
              Com sua lendária lupa de auditoria, Antunes compara o dia e horário de cada audiência com a publicação posterior de portarias, nomeações e decretos no DOU.
            </p>
          </div>
        </div>
      </section>

      {/* SEÇÃO DE CHAMADA DE AÇÃO */}
      <section className={styles.ctaSection}>
        <div className={styles.ctaContent}>
          <h2>Explore as Investigações do Antunes</h2>
          <p>Veja como o Antunes organiza e apresenta os dados de transparência pública para a sociedade.</p>
        </div>
        <div className={styles.ctaButtons}>
          <button className={styles.btnPrimary} onClick={() => onNavigateTab('LOBBYISTS')}>
            <span>Ver Ranking de Atores</span>
            <ArrowRight size={16} />
          </button>
          <button className={styles.btnSecondary} onClick={() => onNavigateTab('GRAPH')}>
            <span>Ver Grafo de Conexões</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
};
