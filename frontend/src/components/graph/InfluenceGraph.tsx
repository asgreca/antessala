import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { GraphNetworkData, GraphNodeData } from '../../types/graph.types';
import { Search, X, RefreshCw } from 'lucide-react';
import { getAuthorityPhotoInfo } from '../../utils/authorityPhoto';
import styles from './InfluenceGraph.module.css';

interface Props {
  data: GraphNetworkData;
  onSelectNode?: (node: GraphNodeData) => void;
  height?: number | string;
  showFiltersBar?: boolean;
}

/** Categorias do grafo. A cor codifica o PAPEL do nó na rede de influência,
 *  não a severidade — vermelho fica reservado ao ato do DOU, que é a
 *  consequência documental. */
const CATEGORIES = [
  { key: 'PERSON', name: 'Ator privado', color: '#38BDF8' },
  { key: 'ORGANIZATION', name: 'Empresa representada', color: '#A78BFA' },
  { key: 'AUTHORITY', name: 'Autoridade pública', color: '#2DD4BF' },
  { key: 'PUBLIC_BODY', name: 'Órgão', color: '#FBBF24' },
  { key: 'DOU_ACT', name: 'Ato do DOU', color: '#EF4444' },
];

const CATEGORY_INDEX = Object.fromEntries(CATEGORIES.map((c, i) => [c.key, i]));

/** Paleta dos temas. Mesma taxonomia dos gráficos do dossiê, para que um
 *  cluster no grafo corresponda a uma fatia no treemap. */
const SECTOR_COLORS: Record<string, string> = {
  TELECOM: '#38BDF8', TRANSPORTE: '#818CF8', AVIACAO: '#22D3EE',
  ENERGIA: '#FBBF24', SAUDE: '#34D399', AMBIENTE: '#2DD4BF',
  TRIBUTARIO: '#F472B6', FINANCEIRO: '#A78BFA', AGRO: '#A3E635',
  INDUSTRIA: '#FB923C', TRABALHO: '#F87171', DIGITAL: '#C084FC',
  EDUCACAO: '#60A5FA', INFRA_URBANA: '#5EEAD4', INDEFINIDO: '#64748B',
};

/** Tamanho extra por faixa de cargo: ministro decide, analista instrui. */
const TIER_BOOST: Record<string, number> = {
  MINISTERIAL: 16, ALTA_DIRECAO: 9, DIRECAO: 5, GERENCIAL: 2, TECNICO: 0,
};

/** Símbolo SVG de estrela de 5 pontas como fallback visual quando autoridade ministerial não possuir foto oficial */
const STAR_PATH =
  'path://M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

/** Gera um símbolo SVG circular de alta definição com foto e anel ministerial dourado ou esmeralda */
export const createCircularAvatarSymbol = (photoUrl: string, isMinister: boolean): string => {
  const ring = isMinister ? '%23F59E0B' : '%2300A859';
  const stroke = isMinister ? '%23FEF3C7' : '%23DCFCE7';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><defs><clipPath id="c"><circle cx="40" cy="40" r="35"/></clipPath></defs><circle cx="40" cy="40" r="38" fill="${ring}" stroke="${stroke}" stroke-width="2.5"/><image href="${photoUrl}" x="5" y="5" width="70" height="70" clip-path="url(%23c)" preserveAspectRatio="xMidYMid slice"/></svg>`;
  return 'image://data:image/svg+xml;utf8,' + svg;
};

/** Detecta se o nó é Ministro(a) de Estado ou Presidente da República */
export const isMinisterOrPresident = (nodeData: GraphNodeData): boolean => {
  if (nodeData.isMinister) return true;
  if (nodeData.tier === 'MINISTERIAL') return true;
  const r = (nodeData.role || '').trim().toLowerCase();
  if (!r) return false;
  return (
    r.startsWith('ministr') ||
    r.startsWith('presidente da rep') ||
    r.startsWith('vice-presidente da rep')
  );
};

export const InfluenceGraph: React.FC<Props> = ({
  data,
  onSelectNode,
  height = 500,
  showFiltersBar = true,
}) => {
  const [colorBy, setColorBy] = useState<'role' | 'sector'>('role');
  const [themeFilter, setThemeFilter] = useState<string>('TODOS');
  const [organFilter, setOrganFilter] = useState<string>('TODOS');
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>('TODOS');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Contagem de nós por categoria para o seletor de Papéis
  const countByType = useMemo(() => {
    const c: Record<string, number> = {};
    data.nodes.forEach((n) => {
      const t = n.data.type || 'OUTRO';
      c[t] = (c[t] ?? 0) + 1;
    });
    return c;
  }, [data]);

  // Contagem específica de Ministros e Presidência da República
  const countMinisters = useMemo(() => {
    return data.nodes.filter((n) => isMinisterOrPresident(n.data)).length;
  }, [data]);

  // Extrai temas e órgãos presentes nesta rede especificamente considerando os outros filtros ativos (cascateamento intercambiável)
  const availableThemes = useMemo(() => {
    const s = new Set<string>();
    data.nodes.forEach((n) => {
      // Checa se o nó atende ao filtro de Órgão se houver um ativo
      if (organFilter !== 'TODOS') {
        const oFilterLow = organFilter.toLowerCase();
        const matchesOrgan =
          (n.data.organRoot && n.data.organRoot.toLowerCase().includes(oFilterLow)) ||
          (Array.isArray(n.data.organs) && n.data.organs.some((o: string) => o && o.toLowerCase().includes(oFilterLow)));
        if (!matchesOrgan) return;
      }
      if (n.data.type !== 'AUTHORITY' && n.data.type !== 'PUBLIC_BODY') {
        if (n.data.sectorLabel) s.add(n.data.sectorLabel);
        if (Array.isArray(n.data.sectors)) {
          n.data.sectors.forEach((sec: string) => sec && s.add(sec));
        }
      }
    });
    return Array.from(s).sort();
  }, [data, organFilter]);

  const availableOrgans = useMemo(() => {
    const o = new Set<string>();
    data.nodes.forEach((n) => {
      // Checa se o nó atende ao filtro de Tema se houver um ativo
      if (themeFilter !== 'TODOS') {
        const matchesTheme =
          n.data.sectorLabel === themeFilter ||
          (Array.isArray(n.data.sectors) && n.data.sectors.includes(themeFilter));
        if (!matchesTheme) return;
      }
      if (n.data.type !== 'AUTHORITY' && n.data.type !== 'PUBLIC_BODY') {
        if (n.data.organRoot) o.add(n.data.organRoot);
        if (Array.isArray(n.data.organs)) {
          n.data.organs.forEach((org: string) => org && o.add(org));
        }
      }
    });
    return Array.from(o).sort();
  }, [data, themeFilter]);

  // Aplica filtros de temas, ministérios, pessoas e papéis
  const { filteredNodes, filteredEdges } = useMemo(() => {
    // 1. Identifica os nós diretamente correspondentes ao critério de busca/filtro
    let matchedNodeIds = new Set<string>();

    const hasSearch = searchQuery.trim().length >= 2;
    const q = searchQuery.toLowerCase();

    data.nodes.forEach((n) => {
      let isMatch = true;

      // Filtro por tipo de nó
      if (nodeTypeFilter === 'MINISTER') {
        if (!isMinisterOrPresident(n.data)) isMatch = false;
      } else if (nodeTypeFilter !== 'TODOS') {
        if (n.data.type !== nodeTypeFilter) isMatch = false;
      }

      // Filtro por tema
      if (themeFilter !== 'TODOS') {
        if (
          n.data.sectorLabel !== themeFilter &&
          (!Array.isArray(n.data.sectors) || !n.data.sectors.includes(themeFilter))
        ) {
          isMatch = false;
        }
      }

      // Filtro por órgão: checa organRoot ou array de órgãos vinculados ao nó (sem comparar com a label do nó)
      if (organFilter !== 'TODOS') {
        const oFilterLow = organFilter.toLowerCase();
        const matchesOrgan =
          (n.data.organRoot && n.data.organRoot.toLowerCase().includes(oFilterLow)) ||
          (Array.isArray(n.data.organs) && n.data.organs.some((o: string) => o && o.toLowerCase().includes(oFilterLow)));
        if (!matchesOrgan) isMatch = false;
      }

      // Filtro por texto de busca
      if (hasSearch) {
        const matchesText =
          n.data.label.toLowerCase().includes(q) ||
          (n.data.role && n.data.role.toLowerCase().includes(q));
        if (!matchesText) isMatch = false;
      }

      if (isMatch) {
        matchedNodeIds.add(n.data.id);
      }
    });

    // 2. Se há filtros ativos, preservamos APENAS os nós que deram match + o nó principal (root/agente público)
    // + os nós intermediários que estão NO CAMINHO DE CONEXÃO entre eles. Nós desconectados são removidos.
    const isFilterActive =
      hasSearch ||
      themeFilter !== 'TODOS' ||
      organFilter !== 'TODOS' ||
      nodeTypeFilter !== 'TODOS';

    if (!isFilterActive) {
      return { filteredNodes: data.nodes, filteredEdges: data.edges };
    }

    if (matchedNodeIds.size === 0) {
      return { filteredNodes: [], filteredEdges: [] };
    }

    // Coleção de IDs de nós de autoridade/foco (nó central do Agente Público)
    const authorityNodes = data.nodes.filter((n) => n.data.isAuthority || n.data.isMinister || n.data.type === 'AUTHORITY');
    const focusNodeIds = new Set(
      (authorityNodes.length > 0 ? authorityNodes : data.nodes.filter((n) => n.data.isLobbyist || n.data.type === 'PERSON')).map((n) => n.data.id)
    );

    // Constrói mapa de adjacência de conexões
    const adjMap = new Map<string, Set<string>>();
    data.edges.forEach((e) => {
      const u = e.data.source;
      const v = e.data.target;
      if (!adjMap.has(u)) adjMap.set(u, new Set());
      if (!adjMap.has(v)) adjMap.set(v, new Set());
      adjMap.get(u)!.add(v);
      adjMap.get(v)!.add(u);
    });

    // Encontra apenas os nós que deram MATCH nos filtros e possuem um caminho válido até a Autoridade/Ator Foco
    const validPathNodeIds = new Set<string>();

    matchedNodeIds.forEach((matchedId) => {
      // Se o próprio nó filtrado for a Autoridade/Foco, só adiciona se tiver match explícito ou se houver outro nó que conecte a ela
      if (focusNodeIds.has(matchedId)) {
        validPathNodeIds.add(matchedId);
        return;
      }

      // BFS para encontrar caminho entre o nó que deu match e a Autoridade Foco
      const queue: string[][] = [[matchedId]];
      const visited = new Set<string>([matchedId]);
      let pathFound = false;

      while (queue.length > 0) {
        const path = queue.shift()!;
        const curr = path[path.length - 1];

        if (focusNodeIds.has(curr)) {
          // Caminho até a autoridade pública encontrado! Mantém todos os nós pertencentes a este caminho
          path.forEach((id) => validPathNodeIds.add(id));
          pathFound = true;

          // Preserva os nós do caminho de conexão e vizinhos que deram match ou são Atos do DOU/Órgãos publicadores diretos
          path.forEach((nodeId) => {
            const neighbors = adjMap.get(nodeId) || new Set();
            neighbors.forEach((nbrId) => {
              // Se o vizinho for uma pessoa (nó azul), mantém apenas se ela também der match nos filtros ativos ou fizer parte do caminho
              const nbrNode = data.nodes.find((n) => n.data.id === nbrId);
              if (nbrNode) {
                if (matchedNodeIds.has(nbrId) || nbrNode.data.type === 'PUBLIC_BODY' || nbrNode.data.type === 'DOU_ACT') {
                  validPathNodeIds.add(nbrId);
                }
              }
            });
          });

          break;
        }

        const neighbors = adjMap.get(curr) || new Set();
        for (const nxt of neighbors) {
          if (!visited.has(nxt)) {
            visited.add(nxt);
            queue.push([...path, nxt]);
          }
        }
      }
    });

    if (validPathNodeIds.size === 0) {
      return { filteredNodes: [], filteredEdges: [] };
    }

    // Garante que a autoridade/agente foco conectada aos caminhos filtrados permanece no grafo se houver conexões ativas
    focusNodeIds.forEach((fId) => {
      const neighbors = adjMap.get(fId) || new Set();
      let isConnectedToFiltered = false;
      for (const nxt of neighbors) {
        if (validPathNodeIds.has(nxt) && nxt !== fId) {
          isConnectedToFiltered = true;
          break;
        }
      }
      if (isConnectedToFiltered) {
        validPathNodeIds.add(fId);
      }
    });

    // Inclui todos os nós que deram match ou estão no caminho até a autoridade pública
    const nodes = data.nodes.filter((n) => validPathNodeIds.has(n.data.id));

    // Filtra estritamente as arestas que ligam nós presentes no filtro
    const activeNodeSet = new Set(nodes.map((n) => n.data.id));
    const edges = data.edges.filter((e) => {
      return activeNodeSet.has(e.data.source) && activeNodeSet.has(e.data.target);
    });

    return { filteredNodes: nodes, filteredEdges: edges };
  }, [data, nodeTypeFilter, themeFilter, organFilter, searchQuery]);

  const hasActiveFilters =
    themeFilter !== 'TODOS' ||
    organFilter !== 'TODOS' ||
    nodeTypeFilter !== 'TODOS' ||
    searchQuery.trim().length > 0;

  const resetFilters = () => {
    setThemeFilter('TODOS');
    setOrganFilter('TODOS');
    setNodeTypeFilter('TODOS');
    setSearchQuery('');
  };

  const option = useMemo(() => {
    const degree = new Map<string, number>();
    filteredEdges.forEach((e) => {
      const w = e.data.count ?? 1;
      degree.set(e.data.source, (degree.get(e.data.source) ?? 0) + w);
      degree.set(e.data.target, (degree.get(e.data.target) ?? 0) + w);
    });
    const maxDegree = Math.max(1, ...degree.values());

    const nodes = filteredNodes.map((n) => {
      const d = degree.get(n.data.id) ?? 0;
      const size = 10 + Math.sqrt(d / maxDegree) * 34;
      const isRoot = n.data.isLobbyist === true;
      const isMinister = isMinisterOrPresident(n.data);
      const isAuthority = n.data.type === 'AUTHORITY' || isMinister;
      const boost = isMinister ? 18 : (n.data.type === 'AUTHORITY' ? (TIER_BOOST[n.data.tier ?? ''] ?? 0) : 0);
      const sectorColor = n.data.sectorLabel ? SECTOR_COLORS[n.data.sector ?? 'INDEFINIDO'] : undefined;

      // Resolução de foto oficial da autoridade (quando aplicável)
      const photoInfo = isAuthority ? getAuthorityPhotoInfo(n.data.label, n.data.role) : null;
      const hasPhoto = Boolean(photoInfo?.photoUrl);

      const isSearchMatch =
        searchQuery.trim().length >= 2 &&
        (n.data.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (n.data.role && n.data.role.toLowerCase().includes(searchQuery.toLowerCase())));

      const nodeSize = isMinister
        ? Math.max(size + (hasPhoto ? 22 : 16), hasPhoto ? 48 : 38)
        : (isRoot ? Math.max(size, 34) : size) + boost;

      // Determina o símbolo visual do nó: Foto circular oficial > Estrela (se ministro sem foto) > Círculo padrão
      let nodeSymbol = 'circle';
      if (hasPhoto && photoInfo?.photoUrl) {
        nodeSymbol = createCircularAvatarSymbol(photoInfo.photoUrl, isMinister);
      } else if (isMinister) {
        nodeSymbol = STAR_PATH;
      }

      return {
        id: n.data.id,
        name: n.data.label,
        value: d,
        symbol: nodeSymbol,
        symbolSize: nodeSize,
        category: CATEGORY_INDEX[n.data.type] ?? 0,
        _isMinister: isMinister,
        _photoUrl: photoInfo?.photoUrl ?? null,
        _displayName: photoInfo?.displayName ?? n.data.label,
        _tierLabel: n.data.tierLabel,
        _role: n.data.role,
        _sectorLabel: n.data.sectorLabel,
        _granted: n.data.granted,
        _organRoot: n.data.organRoot,
        _deltaDays: n.data.deltaDays,
        _sectorColor: sectorColor,
        label: {
          show: isMinister || isRoot || size > 22 || isSearchMatch,
          fontWeight: isMinister || isSearchMatch ? 'bold' : 'normal',
          color: isMinister ? '#92400E' : '#1E293B',
        },
        itemStyle: {
          ...(isMinister
            ? {
                color: colorBy === 'sector' && sectorColor ? sectorColor : '#F59E0B',
                borderColor: '#FEF3C7',
                borderWidth: 2.5,
                shadowBlur: 14,
                shadowColor: 'rgba(245, 158, 11, 0.6)',
              }
            : {
                ...(colorBy === 'sector' && sectorColor ? { color: sectorColor } : {}),
              }),
          ...(isRoot ? { borderColor: '#F8FAFC', borderWidth: 2.5 } : {}),
          ...(isSearchMatch ? { borderColor: '#EF4444', borderWidth: 3 } : {}),
        },
        _type: n.data.type,
        _monetary: n.data.monetaryValue,
      };
    });

    const links = filteredEdges.map((e) => ({
      source: e.data.source,
      target: e.data.target,
      value: e.data.count ?? 1,
      lineStyle: {
        width: Math.min(1 + Math.log2((e.data.count ?? 1) + 1), 6),
        opacity: 0.35,
        curveness: 0.18,
      },
      label: { show: false, formatter: e.data.label },
    }));

    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif' },
      tooltip: {
        backgroundColor: '#FFFFFF',
        borderColor: '#CBD5E1',
        borderWidth: 1,
        textStyle: { color: '#0F172A', fontSize: 12 },
        extraCssText: 'box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border-radius: 8px;',
        formatter: (p: any) => {
          if (p.dataType === 'edge') {
            return `${p.data.value} interaç${p.data.value === 1 ? 'ão' : 'ões'}`;
          }
          const d = p.data;
          const tipo = CATEGORIES[d.category]?.name ?? '';
          const linhas = [`<strong>${p.name}</strong>`, tipo];

          if (d._photoUrl) {
            linhas.unshift(
              `<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                <img src="${d._photoUrl}" alt="${p.name}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:2px solid ${d._isMinister ? '#F59E0B' : '#00A859'};box-shadow:0 2px 6px rgba(0,0,0,0.15);" />
                <div>
                  <div style="font-weight:700;font-size:12px;color:#0F172A;">${d._displayName || p.name}</div>
                  <div style="font-size:10px;color:${d._isMinister ? '#B45309' : '#059669'};font-weight:600;">
                    ${d._isMinister ? '★ Autoridade Ministerial / 1º Escalão' : 'Autoridade Pública'}
                  </div>
                </div>
              </div>`
            );
          } else if (d._isMinister) {
            linhas.unshift(
              '<span style="display:inline-block;background:#FEF3C7;color:#92400E;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;margin-bottom:4px;border:1px solid #FDE68A">★ Ministro(a) de Estado / Presidência</span>'
            );
          }

          if (d._tierLabel) {
            linhas.push(`<span style="color:#0284C7">${d._tierLabel}</span>`);
            if (d._role) linhas.push(`<span style="color:#64748B">${d._role}</span>`);
          }
          if (d._sectorLabel) {
            linhas.push(`<span style="color:#0284C7">Tema: ${d._sectorLabel}</span>`);
          }
          if (d._granted) {
            linhas.push('<span style="color:#64748B">Concedido:</span>');
            linhas.push(`<span style="max-width:260px;display:inline-block;white-space:normal">${d._granted}</span>`);
          }
          if (d._organRoot) {
            linhas.push(`<span style="color:#64748B">Publicado por ${d._organRoot}</span>`);
          }
          if (d._deltaDays !== undefined && d._deltaDays !== null) {
            linhas.push(`<span style="color:#DC2626">${d._deltaDays} dias após a reunião</span>`);
          }
          if (d._monetary) {
            linhas.push(`R$ ${Number(d._monetary).toLocaleString('pt-BR')}`);
          }
          linhas.push(`<span style="color:#64748B">${p.value} conexõe(s)</span>`);
          return linhas.join('<br/>');
        },
      },
      legend: colorBy === 'role' ? [{
        data: CATEGORIES.map((c) => c.name),
        textStyle: { color: '#334155', fontSize: 11 },
        icon: 'circle', itemWidth: 9, itemHeight: 9,
        top: 6, left: 6, orient: 'horizontal',
      }] : [],
      animationDuration: 900,
      animationEasingUpdate: 'quinticInOut',
      series: [{
        type: 'graph',
        layout: 'force',
        data: nodes,
        links,
        categories: CATEGORIES.map((c) => ({
          name: c.name,
          itemStyle: { color: colorBy === 'role' ? c.color : '#94A3B8' },
        })),
        roam: true,
        draggable: true,
        legendHoverLink: false,
        label: {
          position: 'right',
          color: '#1E293B',
          fontSize: 11,
          formatter: (p: any) =>
            p.name.length > 28 ? `${p.name.slice(0, 27)}…` : p.name,
        },
        force: {
          // Repulsão alta e comprimento de aresta generoso: o grafo anterior
          // colapsava tudo no centro porque usava os padrões.
          repulsion: 320,
          edgeLength: [60, 180],
          gravity: 0.08,
          friction: 0.15,
          layoutAnimation: true,
        },
        lineStyle: { color: 'source', curveness: 0.18 },
        emphasis: {
          focus: 'adjacency',
          label: { show: true, fontSize: 11 },
          lineStyle: { width: 4, opacity: 0.9 },
        },
        blur: { itemStyle: { opacity: 0.15 }, lineStyle: { opacity: 0.05 } },
        scaleLimit: { min: 0.4, max: 6 },
      }],
    };
  }, [filteredNodes, filteredEdges, colorBy, searchQuery]);

  const onEvents = useMemo(
    () => ({
      click: (params: any) => {
        if (params.dataType === 'node' && onSelectNode) {
          const found = data.nodes.find((n) => n.data.id === params.data.id);
          if (found) {
            onSelectNode(found.data);
          }
        }
      },
    }),
    [onSelectNode, data]
  );

  if (!data.nodes.length) {
    return <p className={styles.empty}>Sem conexões registradas para este ator.</p>;
  }

  return (
    <div className={styles.wrapper}>
      {/* Barra de Filtros Internos do Grafo (Temas, Órgãos, Pessoas/Papéis e Busca) */}
      {showFiltersBar && (
        <div className={styles.filterToolbar}>
          {/* Busca Rápida de Nó */}
          <div className={styles.searchBox}>
            <Search size={14} color="#64748B" />
            <input
              type="text"
              placeholder="Buscar pessoa ou entidade no grafo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className={styles.clearBtn}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filtro por Tema */}
          {availableThemes.length > 0 && (
            <div className={styles.selectGroup}>
              <span className={styles.selectLabel}>Tema:</span>
              <select
                value={themeFilter}
                onChange={(e) => setThemeFilter(e.target.value)}
                className={styles.selectInput}
              >
                <option value="TODOS">Todos os Temas ({availableThemes.length})</option>
                {availableThemes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro por Órgão Presente no Grafo */}
          {availableOrgans.length > 0 && (
            <div className={styles.selectGroup}>
              <span className={styles.selectLabel}>Órgão:</span>
              <select
                value={organFilter}
                onChange={(e) => setOrganFilter(e.target.value)}
                className={styles.selectInput}
              >
                <option value="TODOS">Todos os Órgãos ({availableOrgans.length})</option>
                {availableOrgans.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Filtro por Tipo de Nó */}
          <div className={styles.selectGroup}>
            <span className={styles.selectLabel}>Papel:</span>
            <select
              value={nodeTypeFilter}
              onChange={(e) => setNodeTypeFilter(e.target.value)}
              className={styles.selectInput}
            >
              <option value="TODOS">Todos os Papéis ({data.nodes.length})</option>
              {countMinisters > 0 && (
                <option value="MINISTER">
                  ⭐ Apenas Ministros e Presidência ({countMinisters})
                </option>
              )}
              <option value="ORGANIZATION">
                🏢 Apenas Empresas Representadas ({countByType['ORGANIZATION'] || 0})
              </option>
              <option value="PUBLIC_BODY">
                🏛️ Apenas Órgãos Visitados ({countByType['PUBLIC_BODY'] || 0})
              </option>
              <option value="AUTHORITY">
                👤 Apenas Autoridades Públicas ({countByType['AUTHORITY'] || 0})
              </option>
              <option value="DOU_ACT">
                📄 Apenas Atos do DOU ({countByType['DOU_ACT'] || 0})
              </option>
            </select>
          </div>

          {/* Botão Resetar se filtros ativos */}
          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} className={styles.resetBtn} title="Limpar todos os filtros do grafo">
              <RefreshCw size={12} />
              <span>Limpar ({filteredNodes.length} nós)</span>
            </button>
          )}
        </div>
      )}

      {/* Alerta contextual quando empresas representadas estão ocultas pelo seletor de Papel */}
      {showFiltersBar && nodeTypeFilter === 'PUBLIC_BODY' && (
        <div style={{
          fontSize: '0.78rem',
          background: '#FEF3C7',
          color: '#92400E',
          padding: '6px 12px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          margin: '-6px 0 10px 0',
          border: '1px solid #FDE68A'
        }}>
          <span>
            ℹ️ Você está filtrando <strong>Apenas Órgãos</strong>. As <strong>Empresas Representadas</strong> (nós roxos) e <strong>Autoridades</strong> estão ocultas por este filtro.
          </span>
          <button
            type="button"
            onClick={() => setNodeTypeFilter('TODOS')}
            style={{
              background: '#D97706',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              whiteSpace: 'nowrap'
            }}
          >
            Exibir Empresas &amp; Todos os Nós
          </button>
        </div>
      )}

      <ReactECharts
        option={option}
        onEvents={onEvents}
        style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />

      {/* Controles de Colorir Por & Legenda */}
      <div className={styles.controls}>
        <span>Colorir por</span>
        <button
          className={colorBy === 'role' ? styles.toggleActive : styles.toggle}
          onClick={() => setColorBy('role')}
        >
          papel na rede
        </button>
        <button
          className={colorBy === 'sector' ? styles.toggleActive : styles.toggle}
          onClick={() => setColorBy('sector')}
        >
          tema
        </button>

        {colorBy === 'sector' && (
          <span className={styles.sectorLegend}>
            {Array.from(new Set(data.nodes.map((n) => n.data.sectorLabel).filter(Boolean)))
              .slice(0, 8)
              .map((label) => {
                const node = data.nodes.find((n) => n.data.sectorLabel === label);
                return (
                  <span key={label as string}>
                    <i style={{ background: SECTOR_COLORS[node?.data.sector ?? 'INDEFINIDO'] }} />
                    {label}
                  </span>
                );
              })}
          </span>
        )}

        {/* Indicador de Legenda de Ministro / Presidência */}
        <div className={styles.ministerBadgeLegend} title="Ministros de Estado e autoridades de 1º escalão com foto oficial identificada">
          <span className={styles.ministerStar}>👤</span>
          <span>Ministro(a) / 1º Escalão (Foto Oficial)</span>
        </div>
      </div>

      <p className={styles.hint}>
        Passe o cursor sobre um nó para isolar sua vizinhança. Arraste para mover, role para aproximar. O tamanho do nó
        reflete o número de conexões. Clique em qualquer autoridade ou empresa para inspecionar seus detalhes.
      </p>
    </div>
  );
};
