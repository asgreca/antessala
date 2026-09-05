import React from 'react';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import styles from './Footer.module.css';

interface FooterProps {
  onNavigateTab?: (tab: any) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigateTab }) => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          {/* Logo discreta sem slogan e descrição */}
          <div className={styles.brandCol}>
            <div className={styles.brandLogoRow}>
              <img
                src="/logo_antessala.png"
                alt="Antessala — Monitorando Agenda. Rastreando Influências."
                className={styles.logoImg}
              />
            </div>
            <p className={styles.brandDesc}>
              Plataforma contínua de inteligência e auditoria de relações governamentais. 
              Cruza registros das audiências públicas do Poder Executivo Federal com atos e dispensas 
              publicadas no Diário Oficial da União.
            </p>
          </div>

          {/* Destaque do Robô Antunes */}
          <div className={styles.antunesCol}>
            <img
              src="/antunes_mascot.png"
              alt="Robô Antunes"
              className={styles.antunesAvatar}
            />
            <div className={styles.antunesText}>
              <span className={styles.antunesTitle}>Robô Antunes</span>
              <span className={styles.antunesRole}>Auditor da República</span>
              <p className={styles.antunesMotto}>
                &ldquo;Zero tolerância para opacidade. O rigor documental a serviço do controle social.&rdquo;
              </p>
            </div>
          </div>

          {/* Links e Fontes Oficiais */}
          <div className={styles.linksCol}>
            <span className={styles.linksTitle}>Fontes Oficiais Auditadas</span>
            <ul className={styles.linksList}>
              <li>
                <a
                  href="https://eagendas.cgu.gov.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkItem}
                >
                  CGU &middot; Sistema e-Agendas <ExternalLink size={12} style={{ display: 'inline', marginLeft: 4 }} />
                </a>
              </li>
              <li>
                <a
                  href="https://www.in.gov.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkItem}
                >
                  Imprensa Nacional &middot; Diário Oficial (DOU) <ExternalLink size={12} style={{ display: 'inline', marginLeft: 4 }} />
                </a>
              </li>
              <li>
                <a
                  href="https://portaldatransparencia.gov.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.linkItem}
                >
                  Portal da Transparência <ExternalLink size={12} style={{ display: 'inline', marginLeft: 4 }} />
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigateTab && onNavigateTab('METHODOLOGY')}
                  className={styles.linkItem}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                  title="Conheça a Metodologia Científica, Fórmulas e Algoritmos do Antessala"
                >
                  Metodologia &amp; Algoritmos do Antessala &rarr;
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.bottomRow}>
          <div className={styles.legalNotice}>
            <strong>Antessala</strong> &mdash; Desenvolvido por{' '}
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('AUTHOR')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#10b981',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: '3px',
              }}
              title="Ver perfil e manifesto técnico de Aislan Greca"
            >
              Aislan Greca
            </button>{' '}
            (Cientista de Dados) e o <strong>Robô Antunes</strong>. Contato: <a href="mailto:robodoaislan@greca.dev.br" className={styles.contactLink}>robodoaislan@greca.dev.br</a>
          </div>
          <div>
            Controle Social de Agendas &bull; 100% Auditável
          </div>
        </div>
      </div>
    </footer>
  );
};
