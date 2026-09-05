import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeft, Check, Sparkles, Landmark, FileSearch, ShieldCheck } from 'lucide-react';
import styles from './OnboardingModal.module.css';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    icon: <Landmark size={44} color="#10B981" />,
    title: '1. Rastreamento Contínuo do e-Agendas (CGU)',
    description:
      'O Antessala monitora mais de 1,2 milhão de compromissos oficiais das autoridades do Governo Federal. O sistema separa automaticamente encontros públicos de reuniões com agentes privados e avalia a clareza das pautas declaradas (Art. 11 do Decreto nº 10.889/2021).',
    highlight: '1.220.000+ compromissos auditados • 5.880+ autoridades',
  },
  {
    icon: <FileSearch size={44} color="#38BDF8" />,
    title: '2. Cruzamento Temporal com o Diário Oficial (DOU)',
    description:
      'Utilizando modelagem matemática (Índice IAI, ETT e Proximity Lift), o motor Antessala correlaciona encontros privados com publicações do DOU em uma janela de 60 dias — identificando contratos de alto valor, dispensas e inexigibilidades de licitação.',
    highlight: 'Janela Δt ≤ 60 dias • 71 correlações de alto risco mapeadas',
  },
  {
    icon: <ShieldCheck size={44} color="#F59E0B" />,
    title: '3. Dossiês Periciais & Controle Cívico (Fala.BR)',
    description:
      'Gere relatórios periciais instantâneos assinados pelo Robô Antunes, exporte evidências em dados abertos (CSV/JSON) ou encaminhe manifestações com 1 clique diretamente para a Ouvidoria da CGU através da plataforma Fala.BR.',
    highlight: 'Exportação aberta • Integração com Fala.BR • 100% Código Aberto',
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const stepData = STEPS[currentStep];

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Guia Rápido da Antessala"
      >
        {/* Cabeçalho */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.badge}>Guia do Cidadão &amp; Auditor</span>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
              Passo {currentStep + 1} de {STEPS.length}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar guia">
            <X size={18} />
          </button>
        </div>

        {/* Corpo do Passo */}
        <div className={styles.body}>
          <div className={styles.illustration}>{stepData.icon}</div>
          <h3 className={styles.stepTitle}>{stepData.title}</h3>
          <p className={styles.stepText}>{stepData.description}</p>
          <div className={styles.highlightBadge}>{stepData.highlight}</div>
        </div>

        {/* Rodapé com Navegação */}
        <div className={styles.footer}>
          {/* Indicadores de bolinha */}
          <div className={styles.dotsGroup}>
            {STEPS.map((_, idx) => (
              <span
                key={idx}
                className={`${styles.dot} ${idx === currentStep ? styles.dotActive : ''}`}
              />
            ))}
          </div>

          <div className={styles.navGroup}>
            {currentStep > 0 && (
              <button type="button" className={styles.secondaryBtn} onClick={handlePrev}>
                <ArrowLeft size={14} style={{ display: 'inline', marginRight: '4px' }} />
                Anterior
              </button>
            )}

            <button type="button" className={styles.primaryBtn} onClick={handleNext}>
              <span>{currentStep === STEPS.length - 1 ? 'Começar a Auditar' : 'Próximo'}</span>
              {currentStep === STEPS.length - 1 ? (
                <Check size={14} />
              ) : (
                <ArrowRight size={14} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
