import React from 'react';

interface AntessalaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  useFullBrandWithSlogan?: boolean;
}

export const AntessalaLogo: React.FC<AntessalaLogoProps> = ({
  size = 'md',
  showSubtitle = true,
  useFullBrandWithSlogan = false,
}) => {
  // Se for a versão grande (para Hero ou destaques de página)
  if (useFullBrandWithSlogan || size === 'lg') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <img
          src="/antessala_logo_sem_slogan.png"
          alt="Antessala — Plataforma de Inteligência Cívica"
          style={{
            height: size === 'lg' ? '110px' : '85px',
            width: 'auto',
            objectFit: 'contain',
            display: 'block',
            filter: 'drop-shadow(0 4px 12px rgba(15, 23, 42, 0.08))',
          }}
        />
      </div>
    );
  }

  // Versão padrão institucional limpa para Header e Banners
  const imgHeight = size === 'sm' ? 52 : 72;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <img
        src="/antessala_logo_sem_slogan.png"
        alt="Antessala — Plataforma de Inteligência Cívica"
        style={{
          height: `${imgHeight}px`,
          width: 'auto',
          objectFit: 'contain',
          display: 'block',
          filter: 'drop-shadow(0 2px 6px rgba(15, 23, 42, 0.08))',
        }}
      />
      {showSubtitle && size !== 'sm' && (
        <span
          style={{
            fontSize: '0.72rem',
            color: '#64748B',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            borderLeft: '1.5px solid #CBD5E1',
            paddingLeft: '12px',
            lineHeight: 1.3,
          }}
        >
          Serviço Cívico &middot; e-Agendas &times; DOU
        </span>
      )}
    </div>
  );
};
