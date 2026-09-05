/** Tema Institucional Claro dos gráficos da Antessala (CGU)
 *
 *  Mantém eixos, grade e tooltip nítidos sobre fundo branco com alta legibilidade.
 */
export const INK = '#0F172A';
export const MUTED = '#64748B';
export const GRID = '#E2E8F0';

export const SERIES_COLORS = [
  '#00A859', // Verde Institucional CGU
  '#0284C7', // Azul Auditoria
  '#7C3AED', // Púrpura Inteligência
  '#EA580C', // Laranja Acesso
  '#0D9488', // Teal
  '#4F46E5', // Índigo
  '#D97706', // Âmbar
  '#2563EB', // Azul Royal
];

export const RISK = '#DC2626';
export const OPAQUE = '#D97706';
export const CLEAR = '#00A859';

export const baseOption = {
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: MUTED },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    padding: [10, 14],
    textStyle: { color: INK, fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' },
    extraCssText: 'box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border-radius: 8px;',
    confine: true,
  },
  grid: { left: 10, right: 14, top: 26, bottom: 10, containLabel: true },
};

export const axisLabel = {
  color: MUTED,
  fontSize: 10,
  fontFamily: 'JetBrains Mono, Inter, monospace',
};

export const axisLine = {
  lineStyle: { color: '#CBD5E1' },
};

export const splitLine = {
  lineStyle: { color: GRID, type: 'dashed' as const },
};
