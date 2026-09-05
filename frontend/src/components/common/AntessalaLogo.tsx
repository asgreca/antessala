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
  // Se for a versão grande (para Hero ou destaques)
  if (useFullBrandWithSlogan || size === 'lg') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        <img
          src="/logo_antessala.png"
          alt="Antessala — Monitorando Agenda. Rastreando Influências. Quem circula, a gente mostra."
          style={{
            maxHeight: size === 'lg' ? '220px' : '140px',
            maxWidth: size === 'lg' ? '540px' : '380px',
            width: '100%',
            objectFit: 'contain',
            display: 'block',
            margin: '0 auto',
          }}
        />
      </div>
    );
  }

  // Versão padrão institucional com a marca completa oficial para Header e salas
  const imgHeight = size === 'sm' ? 42 : 54;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
      <img
        src="/logo_antessala.png"
        alt="Antessala — Monitorando Agenda. Rastreando Influências. Quem circula, a gente mostra."
        style={{
          height: `${imgHeight}px`,
          width: 'auto',
          objectFit: 'contain',
          display: 'block',
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
