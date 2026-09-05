import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  ShieldCheck, 
  Calculator, 
  Scale, 
  Database, 
  Binary, 
  Sparkles, 
  Clock, 
  AlertTriangle, 
  FileText, 
  Layers, 
  Sliders, 
  ExternalLink,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  Cpu,
  Award
} from 'lucide-react';
import styles from './MethodologyPage.module.css';

interface MethodologyPageProps {
  onNavigateTab?: (tab: any) => void;
}

// Definição idêntica à de backend_python/saril/metrics.py
interface IAIComponentDef {
  key: string;
  label: string;
  weight: number;
  denominator: number;
  explanation: string;
}

const IAI_COMPONENTS: IAIComponentDef[] = [
  {
    key: 'meetings',
    label: 'Volume de Acesso (Reuniões)',
    weight: 12.0,
    denominator: 50.0,
    explanation: 'Número de reuniões registradas. Satura em 50: frequência conta, mas frequência rotineira por si só não caracteriza ilicitude.'
  },
  {
    key: 'bodies',
    label: 'Alcance Institucional (Órgãos)',
    weight: 10.0,
    denominator: 10.0,
    explanation: 'Órgãos federais distintos visitados. Satura em 10 pastas governamentais.'
  },
  {
    key: 'authorities',
    label: 'Capilaridade de Autoridades',
    weight: 8.0,
    denominator: 15.0,
    explanation: 'Quantas autoridades públicas distintas receberam o interlocutor. Satura em 15 autoridades.'
  },
  {
    key: 'entropy',
    label: 'Trânsito Transversal (Entropia ETT)',
    weight: 10.0,
    denominator: 4.0,
    explanation: 'Entropia de Shannon da dispersão entre órgãos. Mede o "trânsito coringa" multissetorial pela Esplanada.'
  },
  {
    key: 'correlations',
    label: 'Evidência Documental no DOU',
    weight: 30.0,
    denominator: 8.0,
    explanation: 'Atos oficiais que outorgam benefícios (contratos, dispensas, convênios, parcerias) publicados após reuniões. Maior peso do índice.'
  },
  {
    key: 'critical',
    label: 'Correlações de Alerta Crítico',
    weight: 20.0,
    denominator: 3.0,
    explanation: 'Atos publicados em proximidade temporal excepcional (Δt reduzido com alto Proximity Lift descontada a cadência basal).'
  },
  {
    key: 'value',
    label: 'Expressão Financeira Correlacionada',
    weight: 10.0,
    denominator: 9.0,
    explanation: 'Escala logarítmica (log10 sobre 9) do montante financeiro dos atos. Contrato vultoso agrava, mas não distorce o índice sozinho.'
  }
];

export const MethodologyPage: React.FC<MethodologyPageProps> = ({ onNavigateTab }) => {
  const [activeSection, setActiveSection] = useState<string>('manifesto');

  // Estado do Simulador Interativo do IAI
  const [simMeetings, setSimMeetings] = useState<number>(18);
  const [simBodies, setSimBodies] = useState<number>(4);
  const [simAuthorities, setSimAuthorities] = useState<number>(7);
  const [simEntropy, setSimEntropy] = useState<number>(1.8);
  const [simCorrelations, setSimCorrelations] = useState<number>(2);
  const [simCritical, setSimCritical] = useState<number>(1);
  const [simValueExp, setSimValueExp] = useState<number>(6.5); // log10(R$ 3.162.000)

  // Cálculo reativo do simulador
  const simulationResult = useMemo(() => {
    const rawValues: Record<string, number> = {
      meetings: simMeetings,
      bodies: simBodies,
      authorities: simAuthorities,
      entropy: simEntropy,
      correlations: simCorrelations,
      critical: simCritical,
      value: simValueExp
    };

    let totalScore = 0;
    const components = IAI_COMPONENTS.map((comp) => {
      const observed = rawValues[comp.key] || 0;
      const ratio = Math.min(observed / comp.denominator, 1.0);
      const points = Math.round(comp.weight * ratio * 10) / 10;
      totalScore += points;

      return {
        ...comp,
        observed,
        points,
        percentage: Math.round(ratio * 100)
      };
    });

    const finalScore = Math.min(Math.round(totalScore * 10) / 10, 100.0);

    let severityClass = styles.badgeLow;
    let severityLabel = 'Baixa Complexidade';
    if (finalScore >= 75) {
      severityClass = styles.badgeCritical;
      severityLabel = 'Risco Crítico de Auditoria';
    } else if (finalScore >= 50) {
      severityClass = styles.badgeHigh;
      severityLabel = 'Alto Trânsito e Consequência';
    } else if (finalScore >= 30) {
      severityClass = styles.badgeMedium;
      severityLabel = 'Atenção e Monitoramento';
    }

    return {
      finalScore,
      severityClass,
      severityLabel,
      components
    };
  }, [simMeetings, simBodies, simAuthorities, simEntropy, simCorrelations, simCritical, simValueExp]);

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className={styles.pageContainer}>
      {/* Hero Section */}
      <header className={styles.hero}>
        <div style={{ marginBottom: '14px' }}>
          <img
            src="/logo_antessala.png"
            alt="Antessala Logo"
            style={{ height: '46px', width: 'auto', display: 'block' }}
          />
        </div>
        <div className={styles.heroTopRow}>
          <div className={styles.badgeGroup}>
            <span className={styles.heroBadge}>
              <Scale size={13} /> Metodologia Científica &amp; Probatória
            </span>
            <span className={styles.cguBadge}>
              <Award size={13} /> Edital CGU nº 46/2026 &bull; Reúso de Dados Abertos
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.82rem', color: '#94A3B8' }}>Versão do Motor Analítico: <strong>SARIL 2.4</strong></span>
          </div>
        </div>

        <h1 className={styles.heroTitle}>
          Metodologia, Formulação Matemática &amp; Marco Legal
        </h1>
        <p className={styles.heroSubtitle}>
          O <strong>Antessala (SARIL)</strong> não utiliza caixas-pretas ou scores arbitrários. Cada métrica, alerta de auditoria 
          e correlação temporal presta contas de sua origem a partir de cruzamentos estritos entre dados oficiais do <strong>e-Agendas (CGU)</strong>, 
          do <strong>Diário Oficial da União (Imprensa Nacional)</strong> e cadastros de idoneidade (CEIS/CNEP).
        </p>
      </header>

      {/* Navegador Rápido de Seções */}
      <nav className={styles.sectionNav} aria-label="Seções Metodológicas">
        <button 
          className={`${styles.navPill} ${activeSection === 'manifesto' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('manifesto')}
        >
          <Scale size={14} /> Manifesto Legal &amp; Princípios
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'fontes' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('fontes')}
        >
          <Database size={14} /> Fontes de Dados Abertos
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'iai' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('iai')}
        >
          <Calculator size={14} /> Índice IAI (0-100)
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'simulador' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('simulador')}
        >
          <Sliders size={14} /> Simulador Interativo
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'ett' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('ett')}
        >
          <Binary size={14} /> Entropia ETT (Shannon)
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'lift' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('lift')}
        >
          <TrendingUp size={14} /> Lift Temporal de Proximidade
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'severidade' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('severidade')}
        >
          <AlertTriangle size={14} /> Matriz de Anomalias &amp; DOU
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'entidades' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('entidades')}
        >
          <Layers size={14} /> Unificação Canônica de PJs
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'opacidade' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('opacidade')}
        >
          <FileText size={14} /> Detecção de Pautas Opacas
        </button>
        <button 
          className={`${styles.navPill} ${activeSection === 'edital46' ? styles.navPillActive : ''}`}
          onClick={() => scrollTo('edital46')}
        >
          <Award size={14} /> Edital CGU nº 46/2026
        </button>
      </nav>

      {/* 1. Manifesto Legal e Princípios */}
      <section id="manifesto" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Scale size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>1. Manifesto Legal e Princípios de Integridade Cívica</h2>
            <p className={styles.sectionDesc}>
              Pilares constitucionais, neutralidade política e presunção da boa-fé na fiscalização pública.
            </p>
          </div>
        </div>

        <div className={styles.cardGrid}>
          <div className={styles.methodCard}>
            <h4><ShieldCheck size={18} color="#00A859" /> Transparência Ativa Radical</h4>
            <p>
              Em obediência ao <strong>Art. 5º, XXXIII e Art. 37 da Constituição Federal de 1988</strong> e à 
              <strong> Lei de Acesso à Informação (Lei nº 12.527/2011)</strong>, o acesso a agendas públicas e decisões 
              do Estado é direito inalienável da sociedade. A publicidade é o preceito geral; o sigilo, a exceção restrita.
            </p>
          </div>

          <div className={styles.methodCard}>
            <h4><CheckCircle2 size={18} color="#0284C7" /> Legitimidade das Relações Governamentais</h4>
            <p>
              O diálogo entre a sociedade civil organizada, setores produtivos, sindicatos, associações e a Administração Pública 
              é salvaguardado pelo direito de petição (CF/88, Art. 5º, XXXIV). O Antessala <strong>não criminaliza o lobby legítimo</strong>: 
              sua missão é iluminar assimetrias de acesso e garantir que todas as vozes sejam ouvidas com igual transparência.
            </p>
          </div>

          <div className={styles.methodCard}>
            <h4><AlertTriangle size={18} color="#D97706" /> Caráter Probatório e Sem Juízo de Culpa</h4>
            <p>
              Os apontamentos do sistema constituem <strong>anomalias estatísticas e correlações temporais fáticas</strong> destinadas 
              ao controle social, jornalismo investigativo e apoio a auditorias institucionais (CGU, TCU e MPF). Não consubstanciam, 
              por si só, juízo de condenação penal ou administrativa.
            </p>
          </div>
        </div>

        <div className={styles.calloutNotice}>
          <p>
            <strong>Regra Fundamental do Sistema:</strong> Um índice de auditoria que não presta contas do próprio cálculo 
            não sustenta contraditório. Toda pontuação na plataforma exibe a fórmula matemática, as variáveis de entrada e o link 
            direto para conferência no Diário Oficial da União.
          </p>
        </div>
      </section>

      {/* 2. Fontes de Dados Abertos */}
      <section id="fontes" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Database size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>2. Fontes de Dados Oficiais Auditadas</h2>
            <p className={styles.sectionDesc}>
              Origem primária, frequência de ingestão e proveniência estrita dos datasets governamentais.
            </p>
          </div>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Conjunto de Dados</th>
                <th>Órgão Custodiante</th>
                <th>Base Legal</th>
                <th>Formato &amp; Frequência</th>
                <th>Utilização no SARIL</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>e-Agendas Federal</strong></td>
                <td>Controladoria-Geral da União (CGU)</td>
                <td>Lei 12.813/2013 e Dec. 10.889/2021</td>
                <td>CSV / CKAN API (Diária)</td>
                <td>Extração de audiências, agentes públicos, pessoas físicas visitantes, entidades representadas e pautas declaradas.</td>
              </tr>
              <tr>
                <td><strong>Diário Oficial da União (DOU)</strong></td>
                <td>Imprensa Nacional (IN / Presidência)</td>
                <td>Decreto nº 9.215/2017 e LAI</td>
                <td>HTML Estruturado / JSON (Diária)</td>
                <td>Monitoramento de contratos, dispensas de licitação, convênios, parcerias (MROSC) e atos normativos das Seções 1 e 3.</td>
              </tr>
              <tr>
                <td><strong>CEIS &amp; CNEP</strong></td>
                <td>Controladoria-Geral da União (CGU)</td>
                <td>Lei 12.846/2013 e Lei 14.133/2021</td>
                <td>CSV Aberto (Semanal)</td>
                <td>Cruzamento de sanções e inidoneidades ativas contra entidades e sócios que mantêm interlocução com ministérios.</td>
              </tr>
              <tr>
                <td><strong>PNCP (Contratações Públicas)</strong></td>
                <td>Ministério da Gestão e Inovação (MGI)</td>
                <td>Lei nº 14.133/2021</td>
                <td>API REST Aberta (Contínua)</td>
                <td>Validação de valores homologados, termos aditivos e objetos contratuais correlacionados.</td>
              </tr>
              <tr>
                <td><strong>Retratos Oficiais de Autoridades</strong></td>
                <td>Presidência da República / Wikimedia</td>
                <td>Domínio Público Governamental</td>
                <td>API Aberta (Automática)</td>
                <td>Identificação visual de Ministros de Estado, Presidente e Secretários de Governo em substituição a ícones neutros.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Índice IAI e Formulação Matemática */}
      <section id="iai" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Calculator size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>3. O Índice de Acesso Institucional (IAI: 0 a 100)</h2>
            <p className={styles.sectionDesc}>
              A formulação matemática multicritério que quantifica a intensidade, transversalidade e consequência documental do acesso privado.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#475569' }}>
          O <strong>IAI (Índice de Acesso Institucional)</strong> foi desenhado com base em um princípio basilar de auditoria pública: 
          <em> ter muitas reuniões com o governo não é crime nem indício de ilicitude</em>. Por esse motivo, o mero volume de reuniões 
          tem peso pequeno (máximo de 12 pontos). <strong>50% do peso do IAI decorre da prova documental no Diário Oficial da União</strong> 
          (atos de benefício outorgados e correlações críticas).
        </p>

        <div className={styles.formulaBox}>
          <div className={styles.formulaHeader}>
            <span className={styles.formulaTitle}>Equação Geral do Índice IAI</span>
            <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>saril/metrics.py &bull; Função iai_breakdown()</span>
          </div>
          <div className={styles.formulaCode}>
            IAI = min( ∑ [ Peso_i × min( ValorObservado_i / Denominador_i , 1.0 ) ] , 100.0 )
          </div>
          <p className={styles.formulaExplanation}>
            Onde cada um dos 7 componentes é saturado individualmente no seu denominador de referência, impedindo que uma única variável 
            extrema distorça a métrica global.
          </p>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Componente</th>
                <th>Dimensão de Auditoria</th>
                <th>Peso Máx.</th>
                <th>Denominador</th>
                <th>Racionalidade Probatória</th>
              </tr>
            </thead>
            <tbody>
              {IAI_COMPONENTS.map((comp) => (
                <tr key={comp.key}>
                  <td><strong>{comp.label}</strong></td>
                  <td><code>{comp.key}</code></td>
                  <td><strong style={{ color: '#00A859' }}>{comp.weight} pts</strong></td>
                  <td><code>{comp.denominator}</code></td>
                  <td>{comp.explanation}</td>
                </tr>
              ))}
              <tr style={{ background: '#F8FAFC', fontWeight: 800 }}>
                <td colSpan={2}>PONTUAÇÃO TOTAL MÁXIMA</td>
                <td style={{ color: '#00A859' }}>100.0 pts</td>
                <td colSpan={2}>Escala padronizada de 0,0 a 100,0 pontos auditáveis</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Simulador Interativo de IAI */}
      <section id="simulador" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Sliders size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>4. Simulador Interativo do Cálculo do IAI</h2>
            <p className={styles.sectionDesc}>
              Ajuste as variáveis reais de um interlocutor ou entidade e veja o algoritmo operar em tempo real com decomposição exata de pontos.
            </p>
          </div>
        </div>

        <div className={styles.simulatorContainer}>
          <div className={styles.simulatorTop}>
            <div className={styles.simulatorTitleGroup}>
              <h3><Cpu size={20} color="#10B981" /> Motor Algorítmico em Execução ao Vivo</h3>
              <p>Valores recalculados instantaneamente com as fórmulas oficiais de produção do backend.</p>
            </div>

            <div className={styles.scorePreviewCard}>
              <div className={styles.scoreValueBox}>
                <span className={styles.scoreNumber}>{simulationResult.finalScore}</span>
                <span className={styles.scoreMax}>de 100 pontos</span>
              </div>
              <div>
                <span className={`${styles.scoreBadge} ${simulationResult.severityClass}`}>
                  {simulationResult.severityLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Controles */}
          <div className={styles.controlsGrid}>
            <div className={styles.controlItem}>
              <div className={styles.controlLabelRow}>
                <span>Reuniões com Autoridades:</span>
                <span className={styles.controlValueBadge}>{simMeetings}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="80" 
                value={simMeetings} 
                onChange={(e) => setSimMeetings(Number(e.target.value))}
                className={styles.controlSlider}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Satura com 50 reuniões (máx. 12 pts)</span>
            </div>

            <div className={styles.controlItem}>
              <div className={styles.controlLabelRow}>
                <span>Órgãos Federais Distintos:</span>
                <span className={styles.controlValueBadge}>{simBodies}</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="15" 
                value={simBodies} 
                onChange={(e) => setSimBodies(Number(e.target.value))}
                className={styles.controlSlider}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Satura com 10 órgãos (máx. 10 pts)</span>
            </div>

            <div className={styles.controlItem}>
              <div className={styles.controlLabelRow}>
                <span>Autoridades Distintas:</span>
                <span className={styles.controlValueBadge}>{simAuthorities}</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="25" 
                value={simAuthorities} 
                onChange={(e) => setSimAuthorities(Number(e.target.value))}
                className={styles.controlSlider}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Satura com 15 autoridades (máx. 8 pts)</span>
            </div>

            <div className={styles.controlItem}>
              <div className={styles.controlLabelRow}>
                <span>Entropia ETT (Shannon):</span>
                <span className={styles.controlValueBadge}>{simEntropy.toFixed(2)}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="4" 
                step="0.1" 
                value={simEntropy} 
                onChange={(e) => setSimEntropy(Number(e.target.value))}
                className={styles.controlSlider}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Trânsito transversal; satura em 4.0 (máx. 10 pts)</span>
            </div>

            <div className={styles.controlItem}>
              <div className={styles.controlLabelRow}>
                <span>Atos no DOU Correlacionados:</span>
                <span className={styles.controlValueBadge}>{simCorrelations}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="12" 
                value={simCorrelations} 
                onChange={(e) => setSimCorrelations(Number(e.target.value))}
                className={styles.controlSlider}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Contratos/dispensas/convênios (máx. 30 pts)</span>
            </div>

            <div className={styles.controlItem}>
              <div className={styles.controlLabelRow}>
                <span>Correlações Críticas (Δt &le; 15d):</span>
                <span className={styles.controlValueBadge}>{simCritical}</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="4" 
                value={simCritical} 
                onChange={(e) => setSimCritical(Number(e.target.value))}
                className={styles.controlSlider}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Atos em proximidade anômala (máx. 20 pts)</span>
            </div>

            <div className={styles.controlItem}>
              <div className={styles.controlLabelRow}>
                <span>Expressão Financeira (log10):</span>
                <span className={styles.controlValueBadge}>
                  {simValueExp === 0 ? 'R$ 0' : `~R$ ${(Math.pow(10, simValueExp) / 1e6).toFixed(1)} mi`}
                </span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="9" 
                step="0.5" 
                value={simValueExp} 
                onChange={(e) => setSimValueExp(Number(e.target.value))}
                className={styles.controlSlider}
              />
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Escala log10 de R$ 1 até R$ 1 bi (máx. 10 pts)</span>
            </div>
          </div>

          {/* Breakdown em Barras */}
          <div className={styles.breakdownSection}>
            <h4 className={styles.breakdownTitle}>Decomposição dos 100 Pontos:</h4>
            <div className={styles.componentsList}>
              {simulationResult.components.map((comp) => (
                <div key={comp.key} className={styles.componentRow}>
                  <div className={styles.componentTop}>
                    <span className={styles.componentLabel}>{comp.label}</span>
                    <span className={styles.componentPoints}>
                      +{comp.points.toFixed(1)} / {comp.weight.toFixed(1)} pts
                    </span>
                  </div>
                  <div className={styles.progressBarTrack}>
                    <div 
                      className={styles.progressBarFill} 
                      style={{ width: `${comp.percentage}%` }}
                    />
                  </div>
                  <p className={styles.componentExplain}>{comp.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Entropia de Trânsito ETT */}
      <section id="ett" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Binary size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>5. Exposição a Trânsito e Tratados (ETT — Entropia de Shannon)</h2>
            <p className={styles.sectionDesc}>
              A identificação estatística do &ldquo;trânsito coringa&rdquo; e da transversalidade de atores na Esplanada dos Ministérios.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#475569' }}>
          Um interlocutor técnico de um laboratório farmacêutico costuma se reunir quase exclusivamente com a ANVISA e o Ministério da Saúde. 
          Sua distribuição é altamente concentrada (baixa entropia). Por outro lado, determinados articuladores transitam com fluidez 
          pelo Ministério da Fazenda, Casa Civil, Ministério de Minas e Energia e Ministério dos Transportes: esse padrão de 
          <strong> trânsito transversal</strong> é medido rigorosamente pela <strong>Entropia da Teoria da Informação de Claude Shannon</strong>.
        </p>

        <div className={styles.formulaBox}>
          <div className={styles.formulaHeader}>
            <span className={styles.formulaTitle}>Fórmula da Entropia de Trânsito (ETT)</span>
            <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>saril/metrics.py &bull; Função shannon_entropy()</span>
          </div>
          <div className={styles.formulaCode}>
            H(X) = - ∑ [ p_i × log2( p_i ) ]
          </div>
          <p className={styles.formulaExplanation}>
            Onde <code>p_i = reuniões_órgão_i / total_reuniões</code>. Se 100% das audiências ocorrerem em 1 único órgão, <code>H(X) = 0,0</code>. 
            Se o interlocutor circular com volume balanceado por 8 ou mais ministérios distintos, <code>H(X) &ge; 3,0</code>.
          </p>
        </div>

        <div className={styles.cardGrid}>
          <div className={styles.methodCard}>
            <h4>ETT &lt; 1.0 &bull; Especialista Focal</h4>
            <p>Atuação restrita ao escopo regulatório de uma pasta específica. Comum em engenheiros, técnicos regulatórios e peritos setoriais.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>1.0 &le; ETT &lt; 2.5 &bull; Articulação Setorial</h4>
            <p>Trânsito coordenado entre a pasta finalística e órgãos de regulação ou fazenda. Comum em diretores institucionais de grandes indústrias.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>ETT &ge; 2.5 &bull; Trânsito Coringa / Multissetorial</h4>
            <p>Capacidade de interlocução transversal por múltiplos ministérios de peso político e orçamentário. Alta influência sistêmica.</p>
          </div>
        </div>
      </section>

      {/* 6. Proximity Lift */}
      <section id="lift" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <TrendingUp size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>6. O Conceito de Proximity Lift: Descontando a Cadência Basal</h2>
            <p className={styles.sectionDesc}>
              A solução estatística para impedir falsos positivos em entidades com rotinas massivas de reunião.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#475569' }}>
          O erro metodológico mais comum em investigações de dados abertos é assumir que qualquer reunião próxima a um ato oficial é suspeita. 
          Uma empresa com <strong>2.400 reuniões por ano</strong> se reúne, em média, a cada <strong>0,15 dia</strong>. Encontrar uma reunião 
          na véspera de um contrato é uma <em>certeza matemática banal</em>, e não um indício de nexo causal.
        </p>
        <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#475569' }}>
          Já uma entidade ou ONG que realiza apenas <strong>3 reuniões no ano</strong> tem um intervalo esperado de aproximadamente <strong>120 dias</strong>. 
          Se essa entidade comparece a um gabinete e, 15 dias depois, é contemplada com um convênio ou dispensa, essa proximidade é 
          <strong> estatisticamente excepcional</strong>.
        </p>

        <div className={styles.formulaBox}>
          <div className={styles.formulaHeader}>
            <span className={styles.formulaTitle}>Fórmula do Proximity Lift</span>
            <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>saril/correlation.py &bull; Função proximity_lift()</span>
          </div>
          <div className={styles.formulaCode}>
            Proximity Lift = [ JanelaDias / ReuniõesAnteriores ] / ( Δt + 1 )
          </div>
          <p className={styles.formulaExplanation}>
            Retorna a razão entre o <em>intervalo esperado entre reuniões</em> e o <em>intervalo observado até o ato oficial (Δt)</em>. 
            Se <code>Lift &gt; 1,0</code>, a reunião ocorreu muito mais perto do ato do que a rotina normal explicaria. Se <code>Lift &lt; 1,0</code>, 
            a proximidade decorre apenas do alto volume diário da entidade.
          </p>
        </div>

        <div className={styles.calloutWarning}>
          <p>
            <strong>Regra Proporcional de Rebaixamento (Downgrade):</strong> Quando o <code>Lift &lt; 1,0</code>, o algoritmo do SARIL 
            rebaixa em até dois degraus a severidade do alerta (ex.: de Alta para Baixa). Isso protege a auditoria contra falsos positivos 
            e concentra o escrutínio cívico onde há real excepcionalidade temporal.
          </p>
        </div>
      </section>

      {/* 7. Matriz de Severidade */}
      <section id="severidade" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>7. Matriz de Severidade das Anomalias de Auditoria</h2>
            <p className={styles.sectionDesc}>
              Janelas temporais de correlação e fatores objetivos de agravo e atenuação.
            </p>
          </div>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Severidade</th>
                <th>Janela Temporal Base (Δt)</th>
                <th>Fatores Agravantes</th>
                <th>Ações de Controle Social</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className={`${styles.scoreBadge} ${styles.badgeCritical}`}>CRÍTICO</span></td>
                <td>Reunião ocorrida a &le; 15 dias do ato oficial do DOU</td>
                <td>
                  Contratação sem licitação (dispensa/inexigibilidade: <strong>+20 pts</strong>), 
                  coincidência exata de órgão (<strong>+10 pts</strong>), 
                  valor &ge; R$ 50 milhões (<strong>+25 pts</strong>), 
                  Lift &ge; 2.0x.
                </td>
                <td>Prioridade 1 para auditoria governamental e relatório de inteligência cívica para Ouvidoria Fala.BR/CGU.</td>
              </tr>
              <tr>
                <td><span className={`${styles.scoreBadge} ${styles.badgeHigh}`}>ALTO</span></td>
                <td>Reunião ocorrida entre 16 e 30 dias do ato</td>
                <td>Contrato &ge; R$ 1 milhão (<strong>+15 pts</strong>), autoridade de nível ministerial/alta direção.</td>
                <td>Inclusão em dossiê investigativo e monitoramento contínuo de aditivos contratuais no PNCP.</td>
              </tr>
              <tr>
                <td><span className={`${styles.scoreBadge} ${styles.badgeMedium}`}>MÉDIO</span></td>
                <td>Reunião ocorrida entre 31 e 60 dias do ato</td>
                <td>Atos normativos, outorgas e resoluções com múltiplos atores setoriais em debate.</td>
                <td>Análise de captura regulatória e equilíbrio na representação de interesses divergentes.</td>
              </tr>
              <tr>
                <td><span className={`${styles.scoreBadge} ${styles.badgeLow}`}>BAIXO</span></td>
                <td>Reunião entre 61 e 90 dias do ato ou Lift &lt; 0.5x</td>
                <td>Reuniões rotineiras em que a cadência normal da entidade já justifica a proximidade.</td>
                <td>Monitoramento passivo sem indício de anomalia causal imediata.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 8. Unificação Canônica de PJs */}
      <section id="entidades" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Layers size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>8. Normalização e Unificação Canônica de Pessoas Jurídicas</h2>
            <p className={styles.sectionDesc}>
              Tratamento universal de empresas, associações, sindicatos, federações, ONGs e institutos.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#475569' }}>
          No sistema e-Agendas, a mesma entidade frequentemente aparece registrada sob dezenas de formas divergentes 
          (ex.: &ldquo;ANBIMA&rdquo;, &ldquo;ANBIMA - ASSOCIAÇÃO BRASILEIRA...&rdquo;, com e sem pontuação). O Antessala desenvolveu um motor de 
          <strong> 1.141 regras determinísticas de desduplicação</strong> conjugado com unificação pela <strong>raiz de 8 dígitos do CNPJ da Receita Federal</strong>, 
          garantindo que filiais e matrizes sejam consolidadas na mesma pessoa jurídica de referência.
        </p>

        <div className={styles.cardGrid}>
          <div className={styles.methodCard}>
            <h4>🟣 Associações Setoriais &amp; Confederações</h4>
            <p>CNIs, CNAs, Febrabans e entidades setoriais monitoradas em acordos de cooperação, audiências e consultas públicas com o governo.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>🟢 ONGs &amp; Sociedade Civil Organizada</h4>
            <p>Fundações e organizações sociais fiscalizadas em termos de fomento, colaboração e parcerias reguladas pela Lei nº 13.019/2014 (MROSC).</p>
          </div>
          <div className={styles.methodCard}>
            <h4>🟡 Sindicatos &amp; Centrais de Trabalhadores</h4>
            <p>Entidades sindicais monitoradas em mesas de negociação, dissídios, portarias trabalhistas e conselhos tripartite da União.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>🟦 Empresas Privadas &amp; Sociedades Anônimas</h4>
            <p>Empresas comerciais e multinacionais fiscalizadas em contratações públicas, termos aditivos, outorgas regulatórias e dispensas de licitação.</p>
          </div>
        </div>
      </section>

      {/* 9. Auditoria de Pautas Opacas */}
      <section id="opacidade" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <FileText size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>9. Auditoria de Pautas Opacas &amp; Leitura nas Entrelinhas</h2>
            <p className={styles.sectionDesc}>
              Cumprimento do Art. 11, § 2º do Decreto nº 10.889/2021 e tradução de pautas herméticas para o cidadão.
            </p>
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: '#475569' }}>
          O <strong>Decreto Federal nº 10.889/2021</strong> determina expressamente em seu Artigo 11, § 2º:
          <em> &ldquo;A pauta da reunião deve descrever com clareza o objeto de interesse público e os assuntos a serem tratados&rdquo;</em>.
        </p>

        <div className={styles.calloutNotice}>
          <p>
            <strong>Classificação de Opacidade no SARIL:</strong> Quando uma audiência é cadastrada com pautas genéricas como 
            <em> &ldquo;Visita de cortesia&rdquo;</em>, <em> &ldquo;Reunião com representantes&rdquo;</em>, <em> &ldquo;Assuntos gerais&rdquo;</em> 
            ou simplesmente repete o nome do visitante, o sistema marca a audiência como <strong>PAUTA OPACA</strong> e cruza 
            com as atribuições oficiais do cargo da autoridade pública (ex.: Coordenador-Geral de Fiscalização ou Diretor de Concessões), 
            evidenciando ao cidadão o que verdadeiramente estava em negociação nos bastidores.
          </p>
        </div>
      </section>

      {/* 10. Edital CGU nº 46/2026 */}
      <section id="edital46" className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon}>
            <Award size={22} />
          </div>
          <div>
            <h2 className={styles.sectionTitle}>10. Conformidade com o Edital CGU nº 46/2026</h2>
            <p className={styles.sectionDesc}>
              Submissão ao 2º Concurso de Reúso de Dados Abertos da Controladoria-Geral da União.
            </p>
          </div>
        </div>

        <div className={styles.cardGrid}>
          <div className={styles.methodCard}>
            <h4>1. Benefício Social &amp; Econômico (Peso 2)</h4>
            <p>Empodera o controle social e o jornalismo investigativo com canais de denúncia direta à Ouvidoria da CGU (Fala.BR) e relatórios abertos.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>2. Relevância &amp; Impacto (Peso 2)</h4>
            <p>Mais de 1,2 milhão de participações auditadas, 5.800+ autoridades monitoradas e identificação de dezenas de correlações probatórias com o DOU.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>3. Inovação &amp; Originalidade (Peso 1)</h4>
            <p>Algoritmos autorais (IAI, ETT de Shannon, Proximity Lift), arquitetura de dados DuckDB de alto desempenho e orquestrador Robô Antunes.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>4. Apresentação &amp; Usabilidade (Peso 1)</h4>
            <p>Interface de alta densidade no padrão Palantir/Linear, retratos oficiais de ministros, gráficos ECharts e acessibilidade total.</p>
          </div>
          <div className={styles.methodCard}>
            <h4>5. Replicabilidade &amp; Código Aberto (Peso 1)</h4>
            <p>Licença livre <strong>MIT License</strong>, documentação completa de APIs (Swagger/OpenAPI) e facilidade de deploy em qualquer município ou estado.</p>
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('AUTHOR')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#00A859',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.86rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <span>Ver Manifesto do Autor &bull; Aislan Greca</span>
          </button>
          <a
            href="https://github.com/antessala/antessala"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#F1F5F9',
              color: '#0F172A',
              fontWeight: 700,
              fontSize: '0.86rem',
              border: '1px solid #CBD5E1',
              textDecoration: 'none'
            }}
          >
            <ExternalLink size={14} />
            <span>Repositório GitHub (Licença MIT)</span>
          </a>
        </div>
      </section>

      {/* Rodapé Metodológico Legal */}
      <footer className={styles.legalDisclaimer}>
        <strong>Aviso de Neutralidade e Responsabilidade Cívica:</strong> O Antessala é uma ferramenta cívica e apartidária de 
        transparência pública e controle social baseada estritamente no ordenamento jurídico brasileiro (CF/88, Lei 12.527/2011, 
        Lei 12.813/2013, Decreto 10.889/2021 e Lei 13.019/2014). Todos os dados processados são públicos e foram obtidos de fontes 
        governamentais oficiais. A plataforma não emite juízos de culpabilidade e estimula o cidadão e a imprensa a verificarem os 
        documentos originais indicados em cada caso.
      </footer>
    </div>
  );
};

export default MethodologyPage;
