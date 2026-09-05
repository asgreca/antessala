import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Terminal, 
  Cpu, 
  BarChart2, 
  FileSearch, 
  Share2, 
  Database, 
  Layers,
  Sparkles,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';
import styles from './AuthorProfilePage.module.css';

interface AuthorProfilePageProps {
  onNavigateTab?: (tab: any) => void;
}

export const AuthorProfilePage: React.FC<AuthorProfilePageProps> = ({ onNavigateTab }) => {
  const [imgSrc, setImgSrc] = useState<string>('/author/aislan-greca-1.jpg?v=20260904');

  const handleImgError = () => {
    // Fallback caso ocorra erro no carregamento local
    if (!imgSrc.includes('aislan-greca-1.jpg')) {
      setImgSrc('/author/aislan-greca-1.jpg');
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Bloco de Apresentação e Identidade Forense */}
      <section className={styles.profileHero} aria-labelledby="author-title">
        {/* Coluna da Foto & Ficha Técnica */}
        <div className={styles.photoCol}>
          <div className={styles.photoWrapper}>
            <img
              src={imgSrc}
              alt="Aislan Greca — Relações Públicas, Jornalista e Cientista de Dados. Criador do Projeto Antessala"
              className={styles.authorImg}
              onError={handleImgError}
              loading="eager"
            />
            <div className={styles.photoOverlay}>
              <span className={styles.photoIdBadge}>SUJEITO_ID: AG-1979-SP</span>
              <ShieldCheck size={16} color="#00A859" />
            </div>
          </div>

          {/* Ficha Forense de Metadados */}
          <div className={styles.forensicMetaCard}>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>SUJEITO_ID</span>
              <span className={styles.metaValue}>AG-1979-SP</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>LOCALIZAÇÃO</span>
              <span className={styles.metaValue}>BRASIL</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>STATUS</span>
              <span className={styles.statusVerified}>
                <span className={styles.verifiedPulse} />
                VERIFICADO_ANTUNES
              </span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>ATUAÇÃO</span>
              <span className={styles.metaValue}>CIÊNCIA DE DADOS &amp; IA</span>
            </div>
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>CONCURSO CGU</span>
              <span className={styles.metaValue} style={{ color: '#38bdf8' }}>EDITAL Nº 46/2026</span>
            </div>
          </div>
        </div>

        {/* Coluna de Conteúdo e Manifesto */}
        <div className={styles.contentCol}>
          <div className={styles.authorHeader}>
            <h1 id="author-title" className={styles.authorName}>
              AISLAN GRECA<span className={styles.authorNameDot}>.</span>
            </h1>

            <div className={styles.skillsPillRow}>
              <span className={`${styles.skillPill} ${styles.emerald}`}>
                <FileSearch size={12} /> Jornalismo
              </span>
              <span className={`${styles.skillPill} ${styles.cyan}`}>
                <Share2 size={12} /> Relações Públicas
              </span>
              <span className={`${styles.skillPill} ${styles.violet}`}>
                <BarChart2 size={12} /> Data Science
              </span>
              <span className={`${styles.skillPill} ${styles.amber}`}>
                <Cpu size={12} /> IA Forense
              </span>
            </div>

            {/* Redes Sociais Oficiais */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <a
                href="https://www.linkedin.com/in/aislan-greca-comunicacao/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  background: 'rgba(10, 102, 194, 0.15)',
                  border: '1px solid rgba(10, 102, 194, 0.4)',
                  borderRadius: '6px',
                  color: '#38BDF8',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <ExternalLink size={14} />
                <span>LinkedIn</span>
              </a>

              <a
                href="https://x.com/aislan_1979"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#E2E8F0',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <ExternalLink size={14} />
                <span>X / Twitter (@aislan_1979)</span>
              </a>

              <a
                href="https://www.instagram.com/dados_na_mesa_br/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  background: 'rgba(225, 48, 108, 0.15)',
                  border: '1px solid rgba(225, 48, 108, 0.4)',
                  borderRadius: '6px',
                  color: '#F472B6',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <ExternalLink size={14} />
                <span>Instagram (@dados_na_mesa_br)</span>
              </a>
            </div>
          </div>

          {/* Manifesto Técnico Oficial */}
          <div className={styles.manifestoCard}>
            <div className={styles.manifestoTag}>
              <Terminal size={14} />
              <span>Manifesto Técnico</span>
            </div>
            <blockquote className={styles.manifestoText}>
              &ldquo;A democracia brasileira, em sua grandiosidade monumental, muitas vezes esconde frestas por onde a desinformação se infiltra. O rigor de Brasília não deve estar apenas no concreto de seus palácios, mas na transparência absoluta de seus algoritmos.&rdquo;
            </blockquote>
          </div>

          {/* Breve Declaração de Propósito */}
          <p className={styles.heroIntroText}>
            Meu nome é <strong>Aislan Greca</strong> e, por muito tempo, busquei entender o Brasil através das palavras e dos números. Sou Relações Públicas e Jornalista, mas foi com a minha formação em Ciência de Dados e Inteligência Forense que encontrei a lupa necessária para enxergar o que as narrativas superficiais e os relatórios burocráticos muitas vezes tendem a esconder.
          </p>
          <p className={styles.heroIntroText}>
            Eu via números sendo apresentados como verdades absolutas por canais e relatórios que, muitas vezes, não possuem o ferramental computacional ou estatístico para auditar a veracidade, a completude e a cadência temporal dos registros. Essa lacuna crônica de fiscalização cívica é o berço histórico da opacidade.
          </p>
        </div>
      </section>

      {/* Seções Narrativas & Pilares de Democratização de Dados */}
      <div className={styles.narrativeSection}>
        {/* Bloco 1: A Luta contra a Inércia e a Necessidade da Automação */}
        <section className={styles.narrativeBlock}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIconWrapper}>
              <Layers size={20} />
            </div>
            <h2 className={styles.sectionTitle}>A Fiscalização Automatizada: Superando a Inércia Burocrática</h2>
          </div>

          <p className={styles.bodyText}>
            Na fiscalização cívica tradicional, cidadãos, pesquisadores e repórteres enviam sucessivos pedidos de esclarecimento ou apontamentos técnicos de inconsistências documentais. Durante meses, a inércia e o silêncio burocrático costumam ser a única resposta. Quando o retorno finalmente chega, frequentemente vem travestido na alegação de que o <em>&ldquo;volume de trabalho excessivo&rdquo;</em> inviabiliza o processamento individualizado e pericial das demandas.
          </p>

          <div className={styles.highlightQuote}>
            &ldquo;Quando pedidos e denúncias técnicas de irregularidades esbarram na justificativa do &lsquo;volume de trabalho&rsquo;, fica evidente: a máquina burocrática vence o cidadão pelo cansaço. É por isso que a fiscalização e a auditoria não podem depender de esforço manual esporádico. A fiscalização precisa ser automatizada, contínua e aberta ou será silenciada.&rdquo;
          </div>

          <p className={styles.bodyText}>
            A <strong>Antessala</strong> foi concebida sob essa premissa: transformar a auditoria de relações institucionais em um pipeline computacional autônomo, rigoroso e auditável, eliminando a barreira do volume através de inteligência de dados de alta performance.
          </p>
        </section>

        {/* Bloco 2: O Foco na Democratização e Visualização de Dados da CGU */}
        <section className={styles.narrativeBlock}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIconWrapper} style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.25)', background: 'rgba(6, 182, 212, 0.1)' }}>
              <Database size={20} />
            </div>
            <h2 className={styles.sectionTitle}>Democratização Radical e Visualização de Dados da CGU</h2>
          </div>

          <p className={styles.bodyText}>
            A Controladoria-Geral da União (CGU) desempenha um papel fundamental ao publicar dados abertos e manter o sistema <strong>e-Agendas</strong> (Decreto nº 10.889/2021). Contudo, a simples disponibilização de arquivos CSV com mais de 800 mil linhas não é sinônimo de transparência real. O dado aberto só gera impacto social quando é <strong>legível, contextualizado e investigável</strong> por qualquer cidadão, sem necessidade de conhecimento prévio em programação.
          </p>

          <p className={styles.bodyText}>
            O projeto Antessala une as bases da CGU com o Diário Oficial da União (DOU) e cadastros de integridade (CEIS/CNEP), construindo uma interface de visualização de dados de classe mundial:
          </p>

          <div className={styles.skillsGrid}>
            <div className={styles.skillCard}>
              <div className={styles.skillCardHeader}>
                <BarChart2 size={16} color="#10b981" />
                <span>Auditoria de Pautas &amp; Opacidade</span>
              </div>
              <p className={styles.skillCardDesc}>
                Aplicação do Art. 11 do Decreto 10.889/2021 para identificar pautas genéricas e omissões temáticas em compromissos ministeriais, permitindo cobrança ativa de transparência.
              </p>
            </div>

            <div className={styles.skillCard}>
              <div className={styles.skillCardHeader}>
                <Share2 size={16} color="#06b6d4" />
                <span>Entropia de Trânsito &amp; Redes (ETT)</span>
              </div>
              <p className={styles.skillCardDesc}>
                Métricas matemáticas baseadas na Teoria da Informação de Shannon para medir a dispersão transversal de representantes entre ministérios e agências reguladoras.
              </p>
            </div>

            <div className={styles.skillCard}>
              <div className={styles.skillCardHeader}>
                <FileSearch size={16} color="#a78bfa" />
                <span>Cruzamento Temporal com o DOU</span>
              </div>
              <p className={styles.skillCardDesc}>
                Detecção determinística de contratos, dispensas de licitação e outorgas celebradas com entidades privadas em janelas críticas de proximidade com audiências públicas.
              </p>
            </div>

            <div className={styles.skillCard}>
              <div className={styles.skillCardHeader}>
                <Cpu size={16} color="#fbbf24" />
                <span>IA com Travas Determinísticas</span>
              </div>
              <p className={styles.skillCardDesc}>
                Inteligência artificial auditável e processada em nuvem, sem alucinações: o modelo sumariza e correlaciona termos objetivos, mas a métrica é 100% reproduzível.
              </p>
            </div>
          </div>
        </section>

        {/* Bloco 3: Competências Integradas */}
        <section className={styles.narrativeBlock}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIconWrapper} style={{ color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.25)', background: 'rgba(139, 92, 246, 0.1)' }}>
              <Sparkles size={20} />
            </div>
            <h2 className={styles.sectionTitle}>Competências Integradas: A Confluência Metodológica</h2>
          </div>

          <p className={styles.bodyText}>
            A arquitetura da Antessala não nasceu de uma disciplina isolada, mas da fusão deliberada de quatro áreas de conhecimento:
          </p>

          <ul className={styles.competenciesList}>
            <li className={styles.competencyItem}>
              <CheckCircle2 size={20} className={styles.competencyIconEmerald} />
              <div className={styles.competencyContent}>
                <strong>Jornalismo de Dados:</strong> O compromisso irrestrito com o interesse público, a contextualização dos fatos e a verificação cívica, garantindo que achados complexos sejam comunicados com clareza a toda a sociedade.
              </div>
            </li>
            <li className={styles.competencyItem}>
              <CheckCircle2 size={20} className={styles.competencyIconCyan} />
              <div className={styles.competencyContent}>
                <strong>Relações Públicas &amp; Institucionais:</strong> A compreensão analítica de como grupos de interesse, federações e empresas se articulam legitimamente com o Estado, delimitando o que é diálogo democrático e o que demanda escrutínio cívico.
              </div>
            </li>
            <li className={styles.competencyItem}>
              <CheckCircle2 size={20} className={styles.competencyIconViolet} />
              <div className={styles.competencyContent}>
                <strong>Ciência de Dados (Data Science):</strong> O uso de DuckDB colunar de alto desempenho, modelagem incremental, normalização de razões sociais e CNPJs, e cálculo estatístico de desvios padrão na cadência de atos.
              </div>
            </li>
            <li className={styles.competencyItem}>
              <CheckCircle2 size={20} className={styles.competencyIconAmber} />
              <div className={styles.competencyContent}>
                <strong>Inteligência Artificial Forense:</strong> Classificação automatizada de grandes volumes de texto governamental com LLMs em nuvem (DeepSeek) e guardrails rígidos para assegurar contraditório e reprodutibilidade científica.
              </div>
            </li>
          </ul>
        </section>
      </div>

      {/* Rodapé Institucional com Link Cívico */}
      <footer className={styles.dossierFooter}>
        <div className={styles.cguBadgeNotice}>
          <ShieldCheck size={16} />
          <span>Projeto desenvolvido no escopo do 2º Concurso de Reúso de Dados Abertos da CGU (Edital nº 46/2026)</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span>Código Aberto (MIT License)</span>
          <span>·</span>
          <span>Transparência Cívica e Controle Social</span>
        </div>
      </footer>
    </div>
  );
};
