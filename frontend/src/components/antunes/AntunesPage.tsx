import React from 'react';
import { ShieldCheck, FileText, Search, Award, CheckCircle2, ArrowRight, UserCheck } from 'lucide-react';
import styles from './AntunesPage.module.css';

/** Vídeo de apresentação no YouTube (youtube.com/watch?v=M0sWB8w8hs8). */
const ANTUNES_VIDEO_ID = 'M0sWB8w8hs8';

interface AntunesPageProps {
  onNavigateTab: (tab: 'MINISTRIES' | 'LOBBYISTS' | 'ALERTS' | 'GRAPH' | 'TRANSPARENCY') => void;
}

export const AntunesPage: React.FC<AntunesPageProps> = ({ onNavigateTab }) => {
  return (
    <div className={styles.pageContainer}>
      {/* VÍDEO DE APRESENTAÇÃO — primeiro elemento da página, para que o
          autoplay aconteça dentro da área visível. Navegadores só permitem
          reprodução automática SEM SOM (política de autoplay de Chrome,
          Safari e Firefox); o visitante ativa o áudio pelo controle do player.
          youtube-nocookie evita cookies de rastreamento antes do play. */}
      <section className={styles.videoSection} aria-label="Vídeo de apresentação do Antunes">
        <div className={styles.videoFrame}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ANTUNES_VIDEO_ID}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`}
            title="Conheça o Antunes — o auditor da República"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <p className={styles.videoHint}>
          O vídeo começa sem som. Clique no ícone de volume do player para ouvir.
        </p>
      </section>

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
            <span>AUDITOR_ID: ANTUNES-001</span>
          </div>
        </div>
      </section>

      {/* SEÇÃO DA HISTÓRIA DE ORIGEM DO ANTUNES */}
      <section className={styles.philosophySection}>
        <h2 className={styles.sectionTitle}>
          A Origem de Antunes: Do Papel Carbonado ao Algoritmo Forense
        </h2>

        <div className={styles.cardsGrid}>
          <div className={styles.philosophyCard}>
            <div className={styles.cardIcon} style={{ background: '#ECFDF5', color: '#059669' }}>
              <Search size={24} />
            </div>
            <h3>Menos Achismo, Mais Dados</h3>
            <p>
              Antunes começou sua jornada nos corredores da Esplanada nos tempos em que os compromissos eram anotados em cadernos físicos. Ao evoluir para o universo digital, trouxe consigo o rigor implacável do verdadeiro auditor: <strong>não aceita desculpas, ilações ou opiniões</strong>. Para o Antunes, a única verdade é o dado público auditável extraído do e-Agendas e do Diário Oficial da União.
            </p>
          </div>

          <div className={styles.philosophyCard}>
            <div className={styles.cardIcon} style={{ background: '#EFF6FF', color: '#0284C7' }}>
              <ShieldCheck size={24} />
            </div>
            <h3>Independência Absoluta</h3>
            <p>
              Em seu tradicional terno azul e gravata verde, Antunes não possui filiação partidária, preferências ideológicas ou amizades de gabinete. Sua missão é 100% republicana: auditar com a mesma régua desde a Presidência da República até as secretarias executivas de todos os ministérios e autarquias federais.
            </p>
          </div>

          <div className={styles.philosophyCard}>
            <div className={styles.cardIcon} style={{ background: '#F5F3FF', color: '#7C3AED' }}>
              <FileText size={24} />
            </div>
            <h3>A Lupa de Auditoria Forense</h3>
            <p>
              Equipado com sua inseparável lupa pericial e sua maleta <em>ANTUNES - RIGOR</em>, ele realiza o cruzamento sistemático de milhões de minutos de reuniões com atos contratuais, dispensas de licitação e portarias publicadas no DOU. Se houve audiência prévia antes de uma grande concessão ou contrato, o Antunes identifica a proximidade temporal e mostra à sociedade.
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
