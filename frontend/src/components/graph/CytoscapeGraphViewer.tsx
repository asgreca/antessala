import React, { useEffect, useRef } from 'react';
import cytoscape, { Core } from 'cytoscape';
import { GraphNetworkData, GraphNodeData } from '../../types/graph.types';
import styles from './CytoscapeGraphViewer.module.css';

import { getAuthorityPhotoInfo } from '../../utils/authorityPhoto';

interface CytoscapeGraphViewerProps {
  data: GraphNetworkData;
  layoutName?: 'cose' | 'concentric' | 'circle' | 'grid';
  onSelectNode?: (nodeData: GraphNodeData) => void;
}

export const CytoscapeGraphViewer: React.FC<CytoscapeGraphViewerProps> = ({
  data,
  layoutName = 'cose',
  onSelectNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Converte dados do backend para formato do Cytoscape
    const elements: any[] = [
      ...data.nodes.map((n) => {
        const photoInfo = n.data.type === 'AUTHORITY' || n.data.isMinister
          ? getAuthorityPhotoInfo(n.data.label, n.data.role)
          : null;
        return {
          data: {
            ...n.data,
            weight: n.data.isLobbyist ? 4 : 2,
            photoUrl: photoInfo?.photoUrl || null,
          },
        };
      }),
      ...data.edges.map((e) => ({
        data: {
          ...e.data,
          weight: Math.min(Math.max((e.data.count || 1) * 1.5, 2), 6),
        },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'color': '#0F172A',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-size': '11px',
            'font-weight': 600,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.95,
            'text-background-padding': '4px',
            'text-background-shape': 'roundrectangle',
            'width': 36,
            'height': 36,
            'border-width': 2,
            'border-color': '#CBD5E1',
          },
        },
        {
          selector: 'node[type = "PERSON"]',
          style: {
            'background-color': '#0284C7',
            'border-color': '#0369A1',
            'border-width': 2,
          },
        },
        {
          selector: 'node[type = "PERSON"][?isLobbyist]',
          style: {
            'background-color': '#00A859',
            'border-color': '#008F4C',
            'border-width': 3,
            'width': 46,
            'height': 46,
          },
        },
        {
          selector: 'node[type = "AUTHORITY"]',
          style: {
            'background-color': '#D97706',
            'border-color': '#B45309',
            'border-width': 2,
            'shape': 'ellipse',
            'width': 46,
            'height': 46,
          },
        },
        {
          selector: 'node[photoUrl]',
          style: {
            'background-image': 'data(photoUrl)',
            'background-fit': 'cover',
            'border-color': '#00A859',
            'border-width': 3,
          },
        },
        {
          selector: 'node[type = "ORGANIZATION"]',
          style: {
            'background-color': '#7C3AED',
            'border-color': '#6D28D9',
            'border-width': 2,
            'shape': 'round-rectangle',
            'width': 38,
            'height': 38,
          },
        },
        {
          selector: 'node[type = "PUBLIC_BODY"]',
          style: {
            'background-color': '#0D9488',
            'border-color': '#0F766E',
            'border-width': 2,
            'shape': 'diamond',
            'width': 42,
            'height': 42,
          },
        },
        {
          selector: 'node[type = "DOU_ACT"]',
          style: {
            'background-color': '#DC2626',
            'border-color': '#B91C1C',
            'border-width': 2,
            'shape': 'pentagon',
            'width': 36,
            'height': 36,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 'data(weight)',
            'line-color': '#94A3B8',
            'opacity': 0.65,
            'target-arrow-color': '#64748B',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-size': '10px',
            'font-weight': 600,
            'color': '#475569',
            'text-background-color': '#FFFFFF',
            'text-background-opacity': 0.95,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#00A859',
            'border-opacity': 1,
            'underlay-color': '#00A859',
            'underlay-padding': 6,
            'underlay-opacity': 0.25,
          },
        },
      ],
      layout: {
        name: layoutName,
        animate: true,
        animationDuration: 800,
        fit: true,
        padding: 50,
      } as any,
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      if (onSelectNode) {
        onSelectNode(node.data() as GraphNodeData);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [data, onSelectNode]);

  useEffect(() => {
    if (!cyRef.current) return;
    const l = cyRef.current.layout({
      name: layoutName,
      animate: true,
      animationDuration: 600,
      fit: true,
      padding: 50,
    } as any);
    l.run();
  }, [layoutName]);

  return (
    <div className={styles.cyContainer} ref={containerRef}>
      <div style={{
        position: 'absolute', bottom: '12px', left: '16px', zIndex: 10,
        background: 'rgba(255, 255, 255, 0.92)', border: '1px solid #CBD5E1',
        borderRadius: '8px', padding: '6px 12px', display: 'flex', gap: '12px',
        fontSize: '0.74rem', color: '#475569', fontWeight: 600,
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00A859', display: 'inline-block' }} />
          Representante Principal
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#0284C7', display: 'inline-block' }} />
          Pessoa / Visitante
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
          Autoridade
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#7C3AED', display: 'inline-block' }} />
          Empresa
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', transform: 'rotate(45deg)', background: '#0D9488', display: 'inline-block' }} />
          Órgão Público
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '10px', height: '10px', background: '#DC2626', display: 'inline-block' }} />
          Ato do DOU
        </span>
      </div>
    </div>
  );
};
