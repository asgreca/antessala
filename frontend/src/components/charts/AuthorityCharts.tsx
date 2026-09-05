import React from 'react';
import ReactECharts from 'echarts-for-react';
import {
  baseOption, axisLabel, axisLine, splitLine,
  SERIES_COLORS, RISK, OPAQUE, CLEAR, INK, MUTED,
} from './chartTheme';
import { AuthorityChartsData, AuthoritySlice } from '../../types/authority.types';
import styles from './LobbyistCharts.module.css';

interface Props {
  charts: AuthorityChartsData;
  meetingsTotal: number;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const Panel: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({
  title, hint, children,
}) => (
  <section className={styles.panel}>
    <header className={styles.panelHead}>
      <h4>{title}</h4>
      {hint && <span>{hint}</span>}
    </header>
    {children}
  </section>
);

export const AuthorityCharts: React.FC<Props> = ({ charts, meetingsTotal }) => {
  const months = charts.meetingsByMonth.map((m) => m.month);
  const acts = new Map(charts.douActsByMonth.map((a) => [a.month, a.value]));

  /** Reuniões por mês, separando pauta clara de pauta opaca, com os atos
   *  do DOU sobrepostos: revela correlação entre agendas e atos oficiais. */
  const timeline = {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'axis' as const },
    legend: {
      data: ['Pauta descritiva (clara)', 'Pauta opaca (genérica)', 'Atos no DOU'],
      textStyle: { color: MUTED, fontSize: 10 },
      top: 0, right: 0, icon: 'roundRect', itemWidth: 9, itemHeight: 9,
    },
    grid: { ...baseOption.grid, top: 34 },
    xAxis: { type: 'category', data: months, axisLabel, axisLine, axisTick: { show: false } },
    yAxis: [
      { type: 'value', axisLabel, splitLine, axisLine: { show: false } },
      { type: 'value', axisLabel, splitLine: { show: false }, axisLine: { show: false } },
    ],
    series: [
      {
        name: 'Pauta descritiva (clara)', type: 'bar', stack: 'reunioes',
        data: charts.meetingsByMonth.map((m) => m.total - m.opaque),
        itemStyle: { color: SERIES_COLORS[0] }, barMaxWidth: 22,
      },
      {
        name: 'Pauta opaca (genérica)', type: 'bar', stack: 'reunioes',
        data: charts.meetingsByMonth.map((m) => m.opaque),
        itemStyle: { color: OPAQUE }, barMaxWidth: 22,
      },
      {
        name: 'Atos no DOU', type: 'line', yAxisIndex: 1, symbol: 'circle', symbolSize: 7,
        data: months.map((m) => acts.get(m) ?? 0),
        lineStyle: { color: RISK, width: 2 }, itemStyle: { color: RISK },
      },
    ],
  };

  /** Objetividade da pauta: Art. 11, § 2º do Dec. 10.889/2021. */
  const objectivity = {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'item' as const,
               formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie', radius: ['56%', '80%'], center: ['50%', '52%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      label: {
        show: true, position: 'center',
        formatter: () => `${charts.objectivity.clearPct}%\nclaras`,
        color: INK, fontSize: 15, fontWeight: 700, lineHeight: 18,
      },
      labelLine: { show: false },
      data: [
        { value: charts.objectivity.clear, name: 'Pauta descritiva (conforme)',
          itemStyle: { color: CLEAR } },
        { value: charts.objectivity.opaque, name: 'Pauta genérica (opaca)',
          itemStyle: { color: OPAQUE } },
      ],
    }],
  };

  /** Treemap para comparação visual de grupos e volumes */
  const treemap = (data: AuthoritySlice[], total: number) => ({
    ...baseOption,
    tooltip: {
      ...baseOption.tooltip,
      formatter: (p: any) =>
        `<strong>${p.name}</strong><br/>${p.value.toLocaleString('pt-BR')} audiências`
        + (total ? ` · ${((p.value / total) * 100).toFixed(1)}%` : ''),
    },
    series: [{
      type: 'treemap',
      data: data.map((d, i) => ({
        name: d.name,
        value: d.value,
        itemStyle: {
          color: d.isOthers ? '#64748B' : SERIES_COLORS[i % SERIES_COLORS.length],
          borderColor: '#FFFFFF',
          borderWidth: 2,
          gapWidth: 2,
          borderRadius: 4,
        },
      })),
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      width: '100%',
      height: '100%',
      top: 2, left: 2, right: 2, bottom: 2,
      label: {
        show: true,
        formatter: (p: any) => {
          const pct = total ? ((p.value / total) * 100).toFixed(0) : '0';
          return `{name|${p.name}}\n{val|${p.value} · ${pct}%}`;
        },
        rich: {
          name: { fontSize: 11, fontWeight: 600, color: '#FFFFFF', lineHeight: 15 },
          val: { fontSize: 10, color: 'rgba(255, 255, 255, 0.92)', lineHeight: 13 },
        },
        overflow: 'breakAll',
      },
    }],
  });

  const meetingsSum = charts.meetingsByMonth.reduce((a, m) => a + m.total, 0) || meetingsTotal;
  const chartProps = { style: { height: 190, width: '100%' }, opts: { renderer: 'svg' as const } };

  return (
    <div className={styles.grid}>
      <Panel
        title="Histórico Mensal de Audiências Concedidas"
        hint={`${meetingsTotal} audiências no e-Agendas · Atos do DOU sobrepostos em vermelho`}
      >
        <ReactECharts option={timeline} style={{ height: 230, width: '100%' }}
                      opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel
        title="Conformidade da Pauta (Dec. 10.889/2021)"
        hint="Pauta genérica impede o controle social efetivo pelo cidadão"
      >
        <ReactECharts option={objectivity} {...chartProps} />
      </Panel>

      <Panel
        title="Maiores Empresas e Entidades Atendidas"
        hint={`${charts.totals?.entities ?? charts.byEntity.length} entidades distintas registradas`}
      >
        <ReactECharts option={treemap(charts.byEntity, meetingsSum)}
                      style={{ height: 230, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel
        title="Interlocutores mais Frequentes"
        hint={`${charts.totals?.lobbyists ?? charts.byLobbyist.length} representantes e lobistas distintos`}
      >
        <ReactECharts option={treemap(charts.byLobbyist, meetingsSum)}
                      style={{ height: 230, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel
        title="Setores Econômicos de Interesse"
        hint={`Distribuição por setor industrial/financeiro · ${
          charts.totals?.sectors ?? charts.bySector.length} setores identificados`}
      >
        <ReactECharts option={treemap(charts.bySector, meetingsSum)}
                      style={{ height: 210, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel
        title="Natureza das Pautas Despachadas"
        hint="Classificação temática derivada do teor das reuniões"
      >
        <ReactECharts option={treemap(charts.byNature, meetingsSum)}
                      style={{ height: 190, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>
    </div>
  );
};
