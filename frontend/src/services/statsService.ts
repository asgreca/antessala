import { useEffect, useState } from 'react';
import { getApiUrl } from './api';

/** Totais da base publicada. Os números da tela eram escritos no código e
 *  ficavam errados a cada atualização mensal; agora vêm da API. */
export interface PlatformStats {
  participacoes: number;
  reunioes: number;
  autoridades: number;
  orgaos: number;
  ministerios: number;
  representantes: number;
  entidades: number;
  atosDou: number;
  correlacoes: number;
  correlacoesAltoRisco: number;
  correlacoesPorGravidade: { critica: number; alta: number; media: number; baixa: number };
  sancoes: { ceis: { total: number; vigentes: number }; cnep: { total: number; vigentes: number } };
  periodo: { inicio: string | null; fim: string | null };
}

let pedido: Promise<PlatformStats | null> | null = null;

/** Uma única requisição por carregamento de página, compartilhada entre telas. */
export function loadPlatformStats(): Promise<PlatformStats | null> {
  if (!pedido) {
    pedido = fetch(getApiUrl('/api/v1/stats/overview'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((s) => {
        if (!s) pedido = null; // permite nova tentativa depois de uma falha
        return s;
      });
  }
  return pedido;
}

export function usePlatformStats(): PlatformStats | null {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  useEffect(() => {
    let ativo = true;
    loadPlatformStats().then((s) => {
      if (ativo) setStats(s);
    });
    return () => {
      ativo = false;
    };
  }, []);
  return stats;
}

/** 891974 -> "891.974". Sem dado, "—" — nunca um número inventado. */
export const fmtInt = (n?: number | null): string =>
  typeof n === 'number' ? n.toLocaleString('pt-BR') : '—';

/** 891974 -> "892 mil"; 1250000 -> "1,3 mi". */
export const fmtCompact = (n?: number | null): string => {
  if (typeof n !== 'number') return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} mil`;
  return n.toLocaleString('pt-BR');
};
