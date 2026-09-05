import React from 'react';
import { Loader2, Shield } from 'lucide-react';

interface PageLoadingFallbackProps {
  message?: string;
}

export const PageLoadingFallback: React.FC<PageLoadingFallbackProps> = ({
  message = 'Carregando módulo analítico da Antessala...',
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: '48px 24px',
        gap: '16px',
        color: 'var(--text-secondary)',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Shield size={36} color="var(--primary)" style={{ opacity: 0.25 }} />
        <Loader2
          size={44}
          color="var(--primary)"
          style={{ position: 'absolute', animation: 'spin 1s linear infinite' }}
        />
      </div>
      <span style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
        {message}
      </span>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Sincronizando com a base do e-Agendas e Diário Oficial da União...
      </span>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
