import React from 'react';
import ReactECharts from 'echarts-for-react';
import {
  baseOption, axisLabel, axisLine, splitLine,
  SERIES_COLORS, RISK, OPAQUE, CLEAR, INK, MUTED,
} from './chartTheme';
import styles from './LobbyistCharts.module.css';

export interface Slice {
  name: string;
  value: number;
  /** true no agregado da cauda; recebe cor neutra para não competir com os reais. */
  isOthers?: boolean;
}

export interface PersonCharts {
  meetingsByMonth: { month: string; total: number; opaque: number }[];
  byBody: Slice[];
  byEntity: Slice[];
  bySector: Slice[];
  byNature: Slice[];
  byAuthorityTier: { tier: string; label: string; value: number }[];
  objectivity: { clear: number; opaque: number; clearPct: number };
  douActsByMonth: { month: string; value: number }[];
  totals?: { bodies: number; entities: number; sectors: number };
}

interface Props {
  charts: PersonCharts;
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

export const LobbyistCharts: React.FC<Props> = ({ charts, meetingsTotal }) => {
  const months = charts.meetingsByMonth.map((m) => m.month);
  const acts = new Map(charts.douActsByMonth.map((a) => [a.month, a.value]));

  /** Reuniões por mês, separando pauta informativa de pauta opaca, com os atos
   *  do DOU sobrepostos: é onde se enxerga aceleração de acesso antes de ato. */
  const timeline = {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'axis' as const },
    legend: {
      data: ['Pauta informativa', 'Pauta opaca', 'Atos no DOU'],
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
        name: 'Pauta informativa', type: 'bar', stack: 'reunioes',
        data: charts.meetingsByMonth.map((m) => m.total - m.opaque),
        itemStyle: { color: SERIES_COLORS[0] }, barMaxWidth: 22,
      },
      {
        name: 'Pauta opaca', type: 'bar', stack: 'reunioes',
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

  const horizontalBar = (
    data: { name: string; value: number }[], color: string, labelWidth = 26,
  ) => ({
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'item' as const },
    grid: { ...baseOption.grid, left: 4, right: 28 },
    xAxis: { type: 'value', axisLabel, splitLine, axisLine: { show: false } },
    yAxis: {
      type: 'category',
      data: [...data].reverse().map((d) => truncate(d.name, labelWidth)),
      axisLabel: { ...axisLabel, fontSize: 10 },
      axisLine, axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: [...data].reverse().map((d) => d.value),
      itemStyle: { color, borderRadius: [0, 3, 3, 0] },
      barMaxWidth: 14,
      label: { show: true, position: 'right', color: MUTED, fontSize: 10 },
    }],
  });

  /** Objetividade: a fatia opaca é o que o cidadão não consegue saber. */
  const objectivity = {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'item' as const,
               formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie', radius: ['58%', '82%'], center: ['50%', '52%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      label: {
        show: true, position: 'center',
        formatter: () => `${charts.objectivity.clearPct}%\ninformativas`,
        color: INK, fontSize: 15, fontWeight: 700, lineHeight: 18,
      },
      labelLine: { show: false },
      data: [
        { value: charts.objectivity.clear, name: 'Pauta informativa',
          itemStyle: { color: CLEAR } },
        { value: charts.objectivity.opaque, name: 'Pauta opaca ou genérica',
          itemStyle: { color: OPAQUE } },
      ],
    }],
  };

  /** Cargo de quem recebe: ministro decide, gerente instrui. A diferença é o
   *  que separa acesso decisório de acesso técnico. */
  const tiers = {
    ...baseOption,
    tooltip: { ...baseOption.tooltip, trigger: 'item' as const,
               formatter: '{b}: {c} reuniões ({d}%)' },
    series: [{
      type: 'pie', radius: ['42%', '76%'], center: ['50%', '52%'],
      itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
      label: { color: MUTED, fontSize: 10, formatter: '{b}\n{c}' },
      labelLine: { length: 8, length2: 8, lineStyle: { color: 'rgba(148,163,184,0.4)' } },
      data: charts.byAuthorityTier.map((t, i) => ({
        value: t.value,
        name: truncate(t.label.replace(/\s*\(.*\)/, ''), 22),
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      })),
    }],
  };

  /** Treemap: a área é proporcional ao número de reuniões, então a comparação
   *  entre categorias é imediata e a cauda agregada não some da vista. */
  const treemap = (data: Slice[], total: number) => ({
    ...baseOption,
    tooltip: {
      ...baseOption.tooltip,
      formatter: (p: any) =>
        `<strong>${p.name}</strong><br/>${p.value.toLocaleString('pt-BR')} reuniões`
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

  const meetingsSum = charts.meetingsByMonth.reduce((a, m) => a + m.total, 0);
  const chartProps = { style: { height: 190, width: '100%' }, opts: { renderer: 'svg' as const } };

  return (
    <div className={styles.grid}>
      <Panel
        title="Reuniões por mês"
        hint={`${meetingsTotal} audiências · atos do DOU sobrepostos em vermelho`}
      >
        <ReactECharts option={timeline} style={{ height: 230, width: '100%' }}
                      opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel title="Objetividade das pautas"
             hint="pauta opaca impede o cidadão de saber o que foi tratado">
        <ReactECharts option={objectivity} {...chartProps} />
      </Panel>

      <Panel title="Cargo de quem recebe"
             hint="acesso decisório × acesso técnico">
        <ReactECharts option={tiers} {...chartProps} />
      </Panel>

      <Panel
        title="Temas tratados"
        hint={`mesma classificação usada no grafo · ${
          charts.totals?.sectors ?? charts.bySector.length} temas, 6 maiores`}
      >
        <ReactECharts option={treemap(charts.bySector, meetingsSum)}
                      style={{ height: 230, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel
        title="Órgãos que frequenta"
        hint={`${charts.totals?.bodies ?? charts.byBody.length} órgãos, 6 maiores`}
      >
        <ReactECharts option={treemap(charts.byBody, meetingsSum)}
                      style={{ height: 230, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel
        title="Empresas que representa"
        hint={`${charts.totals?.entities ?? charts.byEntity.length} entidades, 6 maiores`}
      >
        <ReactECharts option={treemap(charts.byEntity, meetingsSum)}
                      style={{ height: 230, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>

      <Panel title="Natureza dos encontros"
             hint="derivada dos termos da própria pauta">
        <ReactECharts option={treemap(charts.byNature, meetingsSum)}
                      style={{ height: 190, width: '100%' }} opts={{ renderer: 'svg' }} />
      </Panel>
    </div>
  );
};
