import React, { useState } from 'react';
import { Landmark, Award } from 'lucide-react';
import { getAuthorityPhotoInfo, getAuthorityInitials } from '../../utils/authorityPhoto';
import styles from './AuthorityAvatar.module.css';

export interface AuthorityAvatarProps {
  name: string;
  role?: string;
  size?: number;
  className?: string;
  showBadge?: boolean;
  title?: string;
}

export const AuthorityAvatar: React.FC<AuthorityAvatarProps> = ({
  name,
  role,
  size = 38,
  className = '',
  showBadge = true,
  title,
}) => {
  const [hasError, setHasError] = useState(false);

  const { photoUrl, displayName, isMinister, isPresident } = React.useMemo(() => {
    return getAuthorityPhotoInfo(name, role);
  }, [name, role]);

  const initials = React.useMemo(() => getAuthorityInitials(name), [name]);
  const displayTitle = title || `${displayName}${role ? ` — ${role}` : ''}`;

  const ringClass = isPresident
    ? styles.ringPresident
    : isMinister
    ? styles.ringMinister
    : styles.ringDefault;

  const initialsClass = isPresident
    ? styles.initialsPresident
    : isMinister
    ? styles.initialsMinister
    : styles.initialsFallback;

  const fontSize = Math.max(10, Math.round(size * 0.38));
  const badgeSize = Math.max(12, Math.round(size * 0.36));

  return (
    <div
      className={`${styles.avatarWrapper} ${ringClass} ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      title={displayTitle}
      aria-label={displayTitle}
    >
      {photoUrl && !hasError ? (
        <img
          src={photoUrl}
          alt={displayName}
          className={styles.avatarImg}
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className={initialsClass} style={{ fontSize: `${fontSize}px` }}>
          {initials}
        </div>
      )}

      {showBadge && (isMinister || isPresident) && size >= 32 && (
        <div
          className={`${styles.tierBadge} ${isPresident ? styles.tierBadgePresident : ''}`}
          style={{ width: `${badgeSize}px`, height: `${badgeSize}px` }}
          title={isPresident ? 'Presidente da República' : 'Ministro de Estado / 1º Escalão'}
        >
          {isPresident ? <Award size={Math.round(badgeSize * 0.7)} /> : <Landmark size={Math.round(badgeSize * 0.7)} />}
        </div>
      )}
    </div>
  );
};

export default AuthorityAvatar;
