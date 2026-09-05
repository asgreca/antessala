import React from 'react';
import { Home, Building2, Landmark, Users, ShieldAlert, Share2, BarChart3, Fingerprint, BookOpen } from 'lucide-react';
import styles from './NavigationTabs.module.css';

export type MainTabType = 'HOME' | 'ANTUNES' | 'MINISTRIES' | 'AUTHORITIES' | 'LOBBYISTS' | 'ALERTS' | 'GRAPH' | 'TRANSPARENCY' | 'METHODOLOGY' | 'AUTHOR';

interface NavigationTabsProps {
  activeTab: MainTabType;
  onTabChange: (tab: MainTabType) => void;
  activeAlertsCount?: number;
}

export const NavigationTabs: React.FC<NavigationTabsProps> = ({
  activeTab,
  onTabChange,
  activeAlertsCount = 0,
}) => {
  return (
    <nav className={styles.navBar} aria-label="Navegação Principal da Antessala">
      <div className={styles.container} role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'HOME'}
          className={`${styles.tabBtn} ${activeTab === 'HOME' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('HOME')}
          title="Apresentação Oficial do Projeto Antessala"
        >
          <Home size={16} aria-hidden="true" />
          <span>Início</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'ANTUNES'}
          className={`${styles.tabBtn} ${activeTab === 'ANTUNES' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('ANTUNES')}
          title="Biografia e Filosofia do Auditor Antunes"
        >
          <Fingerprint size={16} aria-hidden="true" />
          <span>Quem é o Antunes</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'MINISTRIES'}
          className={`${styles.tabBtn} ${activeTab === 'MINISTRIES' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('MINISTRIES')}
          title="Fichas dos Ministérios, Órgãos e Autarquias Federais"
        >
          <Building2 size={16} aria-hidden="true" />
          <span>Ministérios<span className={styles.tabExtra}> &amp; Órgãos</span></span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'AUTHORITIES'}
          className={`${styles.tabBtn} ${activeTab === 'AUTHORITIES' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('AUTHORITIES')}
          title="Dossiê das Autoridades Públicas e Gabinetes Federais"
        >
          <Landmark size={16} aria-hidden="true" />
          <span>Autoridades<span className={styles.tabExtra}> Públicas</span></span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'LOBBYISTS'}
          className={`${styles.tabBtn} ${activeTab === 'LOBBYISTS' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('LOBBYISTS')}
          title="Ranking de Representantes e Entropia de Trânsito"
        >
          <Users size={16} aria-hidden="true" />
          <span>Representantes<span className={styles.tabExtra}> &amp; Atores</span></span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'ALERTS'}
          className={`${styles.tabBtn} ${activeTab === 'ALERTS' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('ALERTS')}
          title="Central de Alertas e Anomalias de Auditoria"
        >
          <ShieldAlert size={16} aria-hidden="true" />
          <span>Alertas</span>
          {activeAlertsCount > 0 && (
            <span className={styles.badge} aria-label={`${activeAlertsCount} alertas críticos e altos`}>
              {activeAlertsCount.toLocaleString('pt-BR')}
            </span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'GRAPH'}
          className={`${styles.tabBtn} ${activeTab === 'GRAPH' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('GRAPH')}
          title="Visualizador Interativo de Grafos e Redes de Influência"
        >
          <Share2 size={16} aria-hidden="true" />
          <span>Redes<span className={styles.tabExtra}> &amp; Relações</span></span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'TRANSPARENCY'}
          className={`${styles.tabBtn} ${activeTab === 'TRANSPARENCY' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('TRANSPARENCY')}
          title="Hub de Transparência e Análise Causal"
        >
          <BarChart3 size={16} aria-hidden="true" />
          <span>Transparência<span className={styles.tabExtra}> &amp; Dados</span></span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'METHODOLOGY'}
          className={`${styles.tabBtn} ${activeTab === 'METHODOLOGY' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('METHODOLOGY')}
          title="Metodologia Científica, Formulação Matemática e Marco Legal do SARIL"
        >
          <BookOpen size={16} aria-hidden="true" />
          <span>Metodologia<span className={styles.tabExtra}> &amp; Algoritmos</span></span>
        </button>

        {/* Aba Discreta: Perfil do Autor & Manifesto */}
        <button
          role="tab"
          aria-selected={activeTab === 'AUTHOR'}
          className={`${styles.tabBtn} ${styles.authorTab} ${activeTab === 'AUTHOR' ? styles.activeTab : ''}`}
          onClick={() => onTabChange('AUTHOR')}
          title="Aislan Greca — Sobre o Autor, Competências & Manifesto Técnico"
        >
          <Fingerprint size={15} aria-hidden="true" />
          <span>Autor</span>
        </button>
      </div>
    </nav>
  );
};
