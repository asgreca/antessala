import React from 'react';
import { 
  Building2, Users, ShieldAlert, Share2, 
  Search, Eye, Database, FileCheck2, ArrowRight, ShieldCheck 
} from 'lucide-react';
import { AntessalaLogo } from '../common/AntessalaLogo';
import styles from './HomePage.module.css';

interface HomePageProps {
  onNavigateTab: (tab: 'MINISTRIES' | 'LOBBYISTS' | 'ALERTS' | 'GRAPH' | 'TRANSPARENCY') => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigateTab }) => {
  return (
    <div className={styles.homeContainer}>
      {/* HERO SECTION COM LOGOMARCA DO ANTESSALA CENTRALIZADA EM GRANDE DESTAQUE E O ROBÔ ANTUNES */}
      <section className={styles.heroSection}>
        {/* LOGOMARCA DA ANTESSALA: CENTRALIZADA E EM DESTAQUE MÁXIMO */}
        <div className={styles.brandCenterpiece}>
          <img
            src="/logo_antessala.png"
            alt="Antessala — Monitorando Agenda. Rastreando Influências."
            className={styles.brandCenterpieceLogo}
          />
        </div>

        <div className={styles.heroBody}>
          <div className={styles.heroContent}>
            <div className={styles.badgeTag}>
              <ShieldCheck size={16} />
              Monitorando Agendas &middot; Rastreando Influências
            </div>

            <h1 className={styles.heroTitle}>
              Projeto Antessala
              <span className={styles.heroTitleHighlight}>Inteligência Cívica &amp; Controle Social</span>
            </h1>

            <p className={styles.heroQuote}>
              &ldquo;Transformando dados abertos do e-Agendas da CGU e do Diário Oficial da União em transparência real para a sociedade brasileira.&rdquo;
            </p>

            <p className={styles.heroDescription}>
              O <strong>Projeto Antessala</strong> cruza mais de 800 mil registros de audiências públicas oficiais de autoridades federais com os atos, portarias e decretos publicados no <strong>Diário Oficial da União</strong>, aplicando inteligência de dados, redes topológicas e métricas exclusivas como o <strong>IAI (Índice de Acesso e Influência)</strong> e o <strong>ETT (Coeficiente de Entropia Térmica de Transparência)</strong>.
            </p>
          </div>
        </div>
      </section>

      {/* AÇÕES RÁPIDAS DE NAVEGAÇÃO */}
      <section className={styles.quickActionsBar}>
        <div className={styles.actionCard} onClick={() => onNavigateTab('MINISTRIES')}>
          <div className={styles.actionIcon}>
            <Building2 size={22} />
          </div>
          <div className={styles.actionTitle}>Ministérios &amp; Órgãos</div>
          <div className={styles.actionDesc}>
            Consulte as fichas dos 38 ministérios supervisores, régua temporal de atos e matriz de encontros.
          </div>
        </div>

        <div className={styles.actionCard} onClick={() => onNavigateTab('LOBBYISTS')}>
          <div className={styles.actionIcon}>
            <Users size={22} />
          </div>
          <div className={styles.actionTitle}>Representantes &amp; Atores</div>
          <div className={styles.actionDesc}>
            Ranking de interlocutores externos por Entropia Temática de Trânsito (ETT), empresas e doadores.
          </div>
        </div>

        <div className={styles.actionCard} onClick={() => onNavigateTab('ALERTS')}>
          <div className={styles.actionIcon} style={{ background: '#FEF2F2', color: '#DC2626' }}>
            <ShieldAlert size={22} />
          </div>
          <div className={styles.actionTitle}>Central de Alertas</div>
          <div className={styles.actionDesc}>
            Triagem de auditoria de anomalias temporais entre reuniões e atos oficiais do DOU.
          </div>
        </div>

        <div className={styles.actionCard} onClick={() => onNavigateTab('GRAPH')}>
          <div className={styles.actionIcon} style={{ background: '#EFF6FF', color: '#0284C7' }}>
            <Share2 size={22} />
          </div>
          <div className={styles.actionTitle}>Redes &amp; Relações</div>
          <div className={styles.actionDesc}>
            Visualização topológica de grafos conectando autoridades públicas, visitantes e entidades privadas.
          </div>
        </div>
      </section>

      {/* BIOGRAFIA DETALHADA DO ROBÔ ANTUNES */}
      <section className={styles.bioGrid}>
        <div className={styles.bioCard}>
          <h2 className={styles.bioCardTitle}>
            <Eye size={24} color="#00A859" />
            A Origem
          </h2>
          <p className={styles.bioCardText}>
            Imagine um auditor da velha guarda, daqueles que usavam suspensórios, revisavam balanços com uma lupa 
            e não deixavam passar uma nota de rodapé sem explicação. Ele estava lá quando o concreto da Esplanada 
            ainda estava secando, observando, década após década, como as artimanhas do poder se escondem atrás 
            de normas técnicas, regimentos internos e uma burocracia que serve para cegar, e não para esclarecer.
          </p>
          <p className={styles.bioCardText}>
            Após uma vida inteira dedicada à fiscalização implacável nos corredores dos Três Poderes, Antunes se aposentou. 
            Mas o espírito de auditor nunca descansa. Com tempo de sobra e uma memória digital que cruza dados com a 
            velocidade de um raio, ele percebeu que a verdadeira antessala das decisões não estava nos discursos públicos, 
            mas nos encontros reservados registrados nas <strong>e-Agendas da CGU</strong> e nos atos publicados dias 
            ou meses depois nas páginas miúdas do <strong>Diário Oficial da União</strong>. Assim nasceu o projeto <strong>Antessala</strong>.
          </p>
        </div>

        <div className={styles.bioCard}>
          <h2 className={styles.bioCardTitle}>
            <Search size={24} color="#0284C7" />
            O Vigilante
          </h2>
          <p className={styles.bioCardText}>
            Enquanto a imprensa muitas vezes se perde em manchetes sensacionalistas e ruídos partidários, tratando 
            dados complexos como se fossem apenas torcida organizada, Antunes mergulha nos registros oficiais. Ele entra 
            no sistema da Controladoria-Geral da União, disseca cada audiência ministerial realizada e remove a cortina 
            de fumaça que separa quem visitou quem de quem foi efetivamente contratado pelo Estado.
          </p>
          <p className={styles.bioCardText}>
            Para Antunes, a transparência pública é sagrada, e a influência oculta é um crime contra a República. Ele é o 
            burocrata que conhece todos os atalhos: a reunião com pauta vaga (&ldquo;assuntos institucionais&rdquo;), 
            a troca de assessores antes de uma licitação e a coincidência temporal entre um aperto de mãos na Esplanada 
            e um milhão empenhado no DOU. Ele toca na ferida sem hesitação, separando o legítimo direito de petição 
            do favorecimento indevido.
          </p>
        </div>
      </section>

      {/* SEÇÃO ESPECIAL: O AUDITOR EM AÇÃO — A PASTA DO RIGOR */}
      <section className={styles.rigorSection}>
        <div className={styles.rigorImageContainer}>
          <img
            src="/antunes_mala.png"
            alt="Robô Antunes com a pasta do Rigor e a lupa de auditoria"
            className={styles.antunesMalaImg}
          />
        </div>
        <div className={styles.rigorContent}>
          <div className={styles.rigorBadge}>
            <FileCheck2 size={16} /> Metodologia de Evidência Documental
          </div>
          <h2 className={styles.rigorTitle}>
            A Pasta do Rigor e a Lupa Metodológica
          </h2>
          <p className={styles.rigorText}>
            Com sua inseparável pasta <strong>&ldquo;ANTUNES - RIGOR&rdquo;</strong> e sua lupa pericial de auditoria, 
            o Robô Antunes examina minuciosamente cada termo de audiência no <strong>e-Agendas da CGU</strong> e cada 
            contrato, dispensa de licitação e portaria no <strong>Diário Oficial da União (DOU)</strong>.
          </p>
          <p className={styles.rigorText}>
            Aqui não há espaço para juízos morais ou retórica partidária. O robô opera com rigor estritamente documental: 
            calcula a correlação temporal (&Delta;t), a Entropia Temática de Trânsito (ETT) e o Índice de Aderência 
            Institucional (IAI), entregando à sociedade um raio-X matemático e imparcial dos bastidores do poder.
          </p>
          <div className={styles.rigorHighlights}>
            <div className={styles.rigorPill}>
              <strong>+1,22 Mi</strong> reuniões auditadas
            </div>
            <div className={styles.rigorPill}>
              <strong>38</strong> Ministérios monitorados
            </div>
            <div className={styles.rigorPill}>
              <strong>100%</strong> registros públicos auditáveis
            </div>
          </div>
        </div>
      </section>

      {/* ATRIBUTOS PERICIAIS (3 CARDS) */}
      <section className={styles.attributesSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Atributos Periciais de Auditoria</h2>
          <p className={styles.sectionSubtitle}>
            Pilares metodológicos que orientam o processamento automatizado do Robô Antunes.
          </p>
        </div>

        <div className={styles.attributesGrid}>
          <div className={styles.attributeCard}>
            <span className={styles.attrLabel}>Rigor Absoluto</span>
            <h3 className={styles.attrTitle}>Zero Tolerância</h3>
            <p className={styles.attrDesc}>
              Tolerância nula para opacidade, reuniões sem registro fidedigno ou pautas genéricas que tentem 
              mascarar interesses econômicos diretos.
            </p>
          </div>

          <div className={styles.attributeCard}>
            <span className={styles.attrLabel}>Fonte Oficial CGU &amp; DOU</span>
            <h3 className={styles.attrTitle}>Evidência Primária</h3>
            <p className={styles.attrDesc}>
              A única verdade que importa é a publicada nos diários e agendas do Estado: dados reais do e-Agendas 
              da CGU e publicações oficiais da Imprensa Nacional.
            </p>
          </div>

          <div className={styles.attributeCard}>
            <span className={styles.attrLabel}>Estilo Arquitetônico</span>
            <h3 className={styles.attrTitle}>Cruzamento Forense</h3>
            <p className={styles.attrDesc}>
              Precisão matemática e correlação temporal (&Delta;t) entre a data do encontro presencial na 
              Esplanada e a publicação do ato administrativo de benefício.
            </p>
          </div>
        </div>
      </section>

      {/* O LIMITE DO AUDITOR */}
      <section className={styles.limitSection}>
        <h2 className={styles.sectionTitle} style={{ fontSize: '1.4rem' }}>
          O Limite do Auditor
        </h2>
        <blockquote className={styles.limitQuote}>
          &ldquo;Apesar de sua natureza implacável, Antunes conhece bem os limites de sua função. Como todo bom auditor, 
          ele não é o juiz, nem o carrasco. Seu trabalho é o diagnóstico. Ele aponta a reunião, documenta o ato 
          publicado, desmascara a inconsistência temporal e entrega a prova documental. A partir daí, o poder e o 
          controle voltam para onde sempre deveriam estar: <strong>nas mãos do cidadão e dos órgãos competentes da República</strong>.&rdquo;
        </blockquote>
      </section>
    </div>
  );
};
