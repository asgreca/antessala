import React from 'react';
import { Network, Layers } from 'lucide-react';
import styles from './GraphControls.module.css';

interface GraphControlsProps {
  layoutName: 'cose' | 'concentric' | 'circle' | 'grid';
  onLayoutChange: (layout: 'cose' | 'concentric' | 'circle' | 'grid') => void;
  depth: number;
  onDepthChange: (depth: number) => void;
}

export const GraphControls: React.FC<GraphControlsProps> = ({
  layoutName,
  onLayoutChange,
  depth,
  onDepthChange,
}) => {
  return (
    <div className={styles.controlsBar}>
      <div className={styles.group}>
        <Network size={16} />
        <span>Algoritmo de Layout:</span>
        <select
          className={styles.select}
          value={layoutName}
          onChange={(e) => onLayoutChange(e.target.value as any)}
        >
          <option value="cose">Force-Directed (CoSE)</option>
          <option value="concentric">Concêntrico</option>
          <option value="circle">Circular</option>
          <option value="grid">Grade</option>
        </select>
      </div>

      <div className={styles.group}>
        <Layers size={16} />
        <span>Profundidade de Rede:</span>
        <select
          className={styles.select}
          value={depth}
          onChange={(e) => onDepthChange(parseInt(e.target.value))}
        >
          <option value={1}>1º Grau (Conexões Diretas)</option>
          <option value={2}>2º Grau (Empresas &amp; Órgãos)</option>
          <option value={3}>3º Grau (Rede Estendida DOU/TSE)</option>
        </select>
      </div>
    </div>
  );
};
