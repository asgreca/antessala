import React, { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { 
  getCompanyLogoUrl, 
  getCompanyLogoFallbackUrl, 
  getCompanyInitials, 
  getEntityPalette,
  detectEntityCategory 
} from '../../utils/companyLogo';
import styles from './CompanyLogo.module.css';

export interface CompanyLogoProps {
  name: string;
  domain?: string;
  size?: number;
  className?: string;
  showFallbackInitials?: boolean;
  title?: string;
}

export const CompanyLogo: React.FC<CompanyLogoProps> = ({
  name,
  domain,
  size = 18,
  className = '',
  showFallbackInitials = true,
  title,
}) => {
  const [sourceIndex, setSourceIndex] = useState<number>(0);
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const primaryUrl = React.useMemo(() => getCompanyLogoUrl(domain || name), [name, domain]);
  const fallbackUrl = React.useMemo(() => getCompanyLogoFallbackUrl(domain || name), [name, domain]);

  const sources = React.useMemo(() => {
    const list: string[] = [];
    if (primaryUrl) list.push(primaryUrl);
    if (fallbackUrl && fallbackUrl !== primaryUrl) list.push(fallbackUrl);
    return list;
  }, [primaryUrl, fallbackUrl]);

  useEffect(() => {
    setSourceIndex(0);
    if (sources.length === 0) {
      setLoadState('error');
    } else {
      setLoadState('loading');
    }
  }, [sources]);

  const handleImgError = () => {
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex(sourceIndex + 1);
      setLoadState('loading');
    } else {
      setLoadState('error');
    }
  };

  const initials = React.useMemo(() => getCompanyInitials(name), [name]);
  const palette = React.useMemo(() => getEntityPalette(name), [name]);
  const category = React.useMemo(() => detectEntityCategory(name), [name]);
  const displayTitle = title || `${name} (${category})`;

  const styleObj: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
  };

  const fontSize = Math.max(8, Math.round(size * 0.46));
  const currentImgSrc = sources[sourceIndex];

  return (
    <span
      className={`${styles.logoWrapper} ${className}`}
      style={styleObj}
      title={displayTitle}
      aria-label={displayTitle}
    >
      {currentImgSrc && loadState !== 'error' && (
        <img
          src={currentImgSrc}
          alt={name}
          className={styles.logoImg}
          loading="lazy"
          onLoad={() => setLoadState('loaded')}
          onError={handleImgError}
          style={{ display: loadState === 'loaded' ? 'block' : 'none' }}
        />
      )}

      {loadState === 'loading' && (
        <span 
          className={`${styles.fallbackBadge} ${styles.shimmer}`} 
          style={{ 
            fontSize: `${fontSize}px`,
            background: palette.bg,
            color: palette.text,
            border: `1px solid ${palette.border}`
          }}
        >
          {initials}
        </span>
      )}

      {loadState === 'error' && (
        <>
          {showFallbackInitials ? (
            <span 
              className={styles.fallbackBadge} 
              style={{ 
                fontSize: `${fontSize}px`,
                background: palette.bg,
                color: palette.text,
                border: `1px solid ${palette.border}`,
                fontWeight: 700
              }}
            >
              {initials}
            </span>
          ) : (
            <span className={styles.fallbackIcon}>
              <Building2 size={Math.round(size * 0.7)} />
            </span>
          )}
        </>
      )}
    </span>
  );
};

export default CompanyLogo;
