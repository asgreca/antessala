import React, { useState, useEffect } from 'react';
import { InfluenceGraph } from './InfluenceGraph';
import { NodeDetailDrawer } from './NodeDetailDrawer';
import { GraphNetworkData, GraphNodeData } from '../../types/graph.types';
import { graphService } from '../../services/graphService';
import { getApiUrl } from '../../services/api';
import { Share2, RefreshCw, Sparkles, Loader2, Filter, X, Building2, Calendar, User } from 'lucide-react';
import styles from './GraphExplorerPage.module.css';

interface GraphExplorerPageProps {
  personId?: string;
  onOpenDossier: (personId: string) => void;
}

export const GraphExplorerPage: React.FC<GraphExplorerPageProps> = ({
  personId,
  onOpenDossier,
}) => {
  const [currentPersonId, setCurrentPersonId] = useState<string | null>(personId || null);
  const [graphData, setGraphData] = useState<GraphNetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState<number>(2);
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null);

  // Filtros Interativos e Intercambiáveis
  const [ministries, setMinistries] = useState<string[]>([]);
  const [selectedMinistry, setSelectedMinistry] = useState<string>('TODOS');
  const [actorsList, setActorsList] = useState<{ id: string; name: string; meetingsCount?: number }[]>([]);
  const [selectedActor, setSelectedActor] = useState<string>(personId || '');
  const [actorVisitedBodies, setActorVisitedBodies] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<string>('');
  const [filtersLoading, setFiltersLoading] = useState<boolean>(false);

  // Estado do Relatório de Rede por LLM (Robô Antunes / DeepSeek)
  const [llmReport, setLlmReport] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState<boolean>(false);
  const [showLlmModal, setShowLlmModal] = useState<boolean>(false);

  // Carrega opções iniciais de órgãos e atores intercambiáveis
  useEffect(() => {
    setFiltersLoading(true);
    graphService.getFilterOptions(selectedMinistry, personId || undefined)
      .then((data) => {
        if (data.ministries && data.ministries.length > 0) {
          setMinistries(data.ministries);
        }
        if (data.actors && data.actors.length > 0) {
          setActorsList(data.actors);
          if (!selectedActor) {
            const initialId = personId || data.actors[0].id;
            setSelectedActor(initialId);
            setCurrentPersonId(initialId);
          }
        }
        if (data.actorMinistries) {
          setActorVisitedBodies(data.actorMinistries);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar opções de filtros:', err);
      })
      .finally(() => {
        setFiltersLoading(false);
      });
  }, []);

  // Quando o usuário seleciona um Ministério: filtra os atores exclusivamente para os deste ministério
  const handleMinistryChange = async (newMinistry: string) => {
    setSelectedMinistry(newMinistry);
    setFiltersLoading(true);
    try {
      const data = await graphService.getFilterOptions(newMinistry, selectedActor || undefined);
      if (data.actors && data.actors.length > 0) {
        setActorsList(data.actors);
        
        // Verifica se o ator atualmente selecionado pertence ao novo ministério
        const existsInNewMinistry = data.actors.some((a) => a.id === selectedActor);
        if (!existsInNewMinistry) {
          // Muda automaticamente para o primeiro ator registrado neste órgão
          const nextActor = data.actors[0];
          setSelectedActor(nextActor.id);
          setCurrentPersonId(nextActor.id);
        }
      } else {
        setActorsList([]);
      }
    } catch (err) {
      console.error('Erro ao atualizar atores do ministério:', err);
    } finally {
      setFiltersLoading(false);
    }
  };

  // Quando o usuário seleciona um Ator: busca os ministérios frequentados por ele
  const handleActorChange = async (newActorId: string) => {
    setSelectedActor(newActorId);
    setCurrentPersonId(newActorId);
    try {
      const data = await graphService.getFilterOptions(undefined, newActorId);
      if (data.actorMinistries && data.actorMinistries.length > 0) {
        setActorVisitedBodies(data.actorMinistries);
        
        // Se o ministério atualmente selecionado não tiver sido visitado por este ator,
        // ajustamos para "TODOS" para garantir que o grafo dele seja exibido perfeitamente
        if (selectedMinistry !== 'TODOS' && !data.actorMinistries.includes(selectedMinistry)) {
          setSelectedMinistry('TODOS');
        }
      }
    } catch (err) {
      console.error('Erro ao buscar órgãos visitados pelo ator:', err);
    }
  };

  const loadGraph = async () => {
    const targetId = selectedActor || currentPersonId;
    if (!targetId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await graphService.getSubgraph(targetId, depth, selectedMinistry);
      setGraphData(res);
    } catch (err: any) {
      console.error('Erro ao carregar grafo:', err);
      setError('Falha ao carregar conexões de rede para o ator.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedActor || currentPersonId) {
      loadGraph();
    }
  }, [selectedActor, depth, selectedMinistry]);

  const handleGenerateGraphReport = async () => {
    setLlmLoading(true);
    setShowLlmModal(true);
    try {
      const activeActorName = actorsList.find((a) => a.id === (selectedActor || currentPersonId))?.name || 'Ator em Análise';
      const res = await fetch(getApiUrl('/api/v1/graph/generate-report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodesCount: graphData?.nodes.length || 0,
          edgesCount: graphData?.edges.length || 0,
          publicBody: selectedMinistry !== 'TODOS' ? selectedMinistry : 'Esplanada dos Ministérios (Geral)',
          dateFilter: dateFilter || 'Período Completo (2023-2026)',
          actorName: activeActorName,
        }),
      });
      const data = await res.json();
      setLlmReport(data.report || 'Relatório concluído.');
    } catch (e: any) {
      setLlmReport('Erro ao comunicar com o modelo LLM do Robô Antunes.');
    } finally {
      setLlmLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Cabeçalho */}
      <div className={styles.headerBar}>
        <div className={styles.headerInfo}>
          <div className={styles.iconBadge}>
            <Share2 size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '2px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Visualizador Interativo de Grafos e Redes de Influência</h2>
              <img 
                src="/logo_antessala.png" 
                alt="Antessala — Monitorando Agenda. Rastreando Influências." 
                style={{ height: '34px', width: 'auto' }} 
              />
            </div>
            <span className={styles.subtext}>
              Exploração estruturada via Cytoscape.js &bull; Interações de autoridades públicas, representantes e atos do DOU.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className={styles.reloadBtn} onClick={loadGraph} title="Recarregar Rede">
            <RefreshCw size={16} />
            <span>Recarregar</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros Interativos Intercambiáveis e Botão LLM */}
      <div className={styles.filterBar}>
        {/* Filtro 1: Ministério / Órgão */}
        <div className={styles.filterGroup}>
          <Building2 size={16} color="#00A859" />
          <span>Ministério / Órgão:</span>
          <select
            className={styles.filterSelect}
            value={selectedMinistry}
            onChange={(e) => handleMinistryChange(e.target.value)}
            disabled={filtersLoading}
          >
            <option value="TODOS">Todos os Órgãos Federais</option>
            {actorVisitedBodies.length > 0 && selectedMinistry === 'TODOS' ? (
              <>
                <optgroup label="Órgãos Frequentados pelo Ator Selecionado">
                  {actorVisitedBodies.map((m, idx) => (
                    <option key={`act-${idx}`} value={m}>
                      ★ {m}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Demais Ministérios e Autarquias">
                  {ministries
                    .filter((m) => !actorVisitedBodies.includes(m))
                    .map((m, idx) => (
                      <option key={`all-${idx}`} value={m}>
                        {m}
                      </option>
                    ))}
                </optgroup>
              </>
            ) : (
              ministries.map((m, idx) => (
                <option key={idx} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Filtro 2: Ator / Representante (Filtrado Dinamicamente pelo Ministério) */}
        <div className={styles.filterGroup}>
          <User size={16} color="#0284C7" />
          <span>
            {selectedMinistry !== 'TODOS' ? 'Pessoas deste Órgão:' : 'Ator / Representante:'}
          </span>
          {filtersLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#64748B' }}>
              <Loader2 size={14} className="spin" />
              <span>Buscando pessoas...</span>
            </div>
          ) : (
            <select
              className={styles.filterSelect}
              value={selectedActor || currentPersonId || ''}
              onChange={(e) => handleActorChange(e.target.value)}
              disabled={actorsList.length === 0}
            >
              {actorsList.length === 0 ? (
                <option value="">Nenhum representante registrado</option>
              ) : (
                actorsList.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.name} {act.meetingsCount ? `(${act.meetingsCount} ${act.meetingsCount === 1 ? 'reunião' : 'reuniões'})` : ''}
                  </option>
                ))
              )}
            </select>
          )}

          {selectedMinistry !== 'TODOS' && actorsList.length > 0 && (
            <span className={styles.countBadge} title="Interlocutores com reuniões registradas neste órgão">
              {actorsList.length} pessoas
            </span>
          )}
        </div>

        {/* Filtro 3: Período */}
        <div className={styles.filterGroup}>
          <Calendar size={15} color="#64748B" />
          <span>Período:</span>
          <input
            type="text"
            placeholder="Ex: 2024 ou 01/2024"
            className={styles.filterInput}
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ width: '120px' }}
          />
        </div>

        <div className={styles.filterGroup}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>Profundidade da Rede:</span>
          <select
            className={styles.filterSelect}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            style={{ width: '160px' }}
          >
            <option value={1}>1º Grau (Apenas Encontros Diretos)</option>
            <option value={2}>2º Grau (Empresas, Órgãos & Atos DOU)</option>
            <option value={3}>3º Grau (Rede Multissetorial Completa)</option>
          </select>
        </div>

        {/* Botão de Interpretação da Rede via LLM */}
        <button
          type="button"
          className={styles.llmReportBtn}
          onClick={handleGenerateGraphReport}
          disabled={llmLoading}
        >
          <img 
            src="/antunes_mala.png" 
            alt="Robô Antunes" 
            style={{ width: '22px', height: '22px', objectFit: 'contain' }} 
          />
          {llmLoading ? (
            <>
              <Loader2 size={15} className="spin" />
              <span>Interpretando Rede...</span>
            </>
          ) : (
            <>
              <Sparkles size={15} />
              <span>Interpretar Rede com Antunes</span>
            </>
          )}
        </button>
      </div>

      {/* Visualizador de Grafo Seguindo o Modelo Visual da Ficha */}
      <div className={styles.viewerWrapper}>
        {error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '14px', padding: '40px', background: '#FFFFFF', borderRadius: '12px', textAlign: 'center' }}>
            <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>{error}</span>
            <button
              type="button"
              style={{ padding: '8px 18px', background: '#00A859', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
              onClick={loadGraph}
            >
              Tentar Novamente
            </button>
          </div>
        ) : loading || !graphData ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748B', gap: '10px' }}>
            <RefreshCw size={24} className="spin" />
            <span>Mapeando conexões da rede com o modelo visual da ficha...</span>
          </div>
        ) : (
          <InfluenceGraph
            data={graphData}
            height={640}
            showFiltersBar={true}
            onSelectNode={(node) => setSelectedNode(node)}
          />
        )}

        {/* Modal Flutuante com Relatório da Rede do Robô Antunes */}
        {showLlmModal && (
          <div className={styles.llmReportModal}>
            <div className={styles.llmReportHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '0.9rem', color: '#00A859' }}>
                <img 
                  src="/antunes_mala.png" 
                  alt="Robô Antunes" 
                  style={{ width: '26px', height: '26px', objectFit: 'contain' }} 
                />
                <Sparkles size={16} />
                <span>Parecer Pericial de Rede &mdash; Robô Antunes</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLlmModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className={styles.llmReportBody}>
              {llmLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '24px 0', justifyContent: 'center', color: '#64748B' }}>
                  <img 
                    src="/antunes_mala.png" 
                    alt="Antunes analisando rede" 
                    style={{ width: '56px', height: '56px', objectFit: 'contain' }} 
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Loader2 size={18} className="spin" color="#00A859" />
                    <span>O Robô Antunes está processando os caminhos da rede...</span>
                  </div>
                </div>
              ) : (
                llmReport
              )}
            </div>
          </div>
        )}

        {/* Drawer Lateral de Inspeção do Nó */}
        <NodeDetailDrawer
          nodeData={selectedNode}
          onClose={() => setSelectedNode(null)}
          onOpenDossier={(id) => onOpenDossier(id)}
        />
      </div>
    </div>
  );
};
