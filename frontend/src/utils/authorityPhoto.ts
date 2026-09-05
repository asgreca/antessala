import photosData from '../data/authorityPhotos.json';

interface PhotoRecord {
  photoUrl: string | null;
  id: string;
  displayName: string;
}

const photoMap: Record<string, PhotoRecord> = photosData as Record<string, PhotoRecord>;

export function normalizeAuthorityName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function isMinisterOrPresident(role?: string, name?: string): { isMinister: boolean; isPresident: boolean } {
  const normRole = (role || '').toUpperCase();
  const normName = normalizeAuthorityName(name || '');

  const isPresident =
    normRole.includes('PRESIDENTE DA REPUBLICA') ||
    normRole.includes('PRESIDENTE DA REPÚBLICA') ||
    normName.includes('LUIZ INACIO LULA DA SILVA') ||
    normName === 'LULA';

  const isMinister =
    normRole.includes('MINISTRO') ||
    normRole.includes('MINISTRA') ||
    normRole.includes('SECRETARIO-EXECUTIVO') ||
    normRole.includes('SECRETÁRIO-EXECUTIVO') ||
    normRole.includes('SECRETARIA-EXECUTIVA') ||
    isPresident;

  return { isMinister, isPresident };
}

export function getAuthorityPhotoInfo(name: string, role?: string): {
  photoUrl: string | null;
  displayName: string;
  isMinister: boolean;
  isPresident: boolean;
} {
  const norm = normalizeAuthorityName(name);
  const { isMinister, isPresident } = isMinisterOrPresident(role, name);

  if (photoMap[norm] && photoMap[norm].photoUrl) {
    return {
      photoUrl: photoMap[norm].photoUrl,
      displayName: photoMap[norm].displayName,
      isMinister,
      isPresident,
    };
  }

  // Fallback por correspondência parcial (ex: "RUI COSTA DOS SANTOS" -> "RUI COSTA")
  for (const [key, record] of Object.entries(photoMap)) {
    if (record.photoUrl && (norm.includes(key) || key.includes(norm))) {
      return {
        photoUrl: record.photoUrl,
        displayName: record.displayName,
        isMinister: true,
        isPresident,
      };
    }
  }

  return {
    photoUrl: null,
    displayName: name,
    isMinister,
    isPresident,
  };
}

export function getAuthorityInitials(name: string): string {
  if (!name) return 'AP';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
