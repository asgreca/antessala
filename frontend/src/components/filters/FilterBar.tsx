import React, { useEffect, useState } from 'react';
import { Building2, UserCog, Search, CalendarRange, X } from 'lucide-react';
import styles from './FilterBar.module.css';

export interface Facets {
  bodies: { value: string; count: number }[];
  tiers: { value: string; label: string; count: number }[];
  dateRange: { first: string; last: string };
}

export interface FilterState {
  publicBody: string;
  tier: string;
  search: string;
  dateFrom: string;   // dd/mm/aaaa
  dateTo: string;     // dd/mm/aaaa
}

export const EMPTY_FILTERS: FilterState = {
  publicBody: '', tier: '', search: '', dateFrom: '', dateTo: '',
};

interface Props {
  value: FilterState;
  facets: Facets | null;
  totalLabel?: string;
  loading?: boolean;
  onChange: (next: FilterState) => void;
}

/** ISO (aaaa-mm-dd) -> dd/mm/aaaa. A API aceita as duas formas; a tela usa
 *  sempre a brasileira. */
const isoToBr = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const isCompleteBrDate = (value: string): boolean =>
  /^\d{2}\/\d{2}\/\d{4}$/.test(value);

/** Insere as barras enquanto o usuário digita, sem forçar máscara rígida. */
const maskBrDate = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const FilterBar: React.FC<Props> = ({
  value, facets, totalLabel, loading, onChange,
}) => {
  const [term, setTerm] = useState(value.search);

  // A busca por texto espera o usuário parar de digitar; os selects aplicam
  // na hora, porque cada escolha reduz as opções dos demais.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (term !== value.search) onChange({ ...value, search: term });
    }, 350);
    return () => clearTimeout(timer);
  }, [term]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setTerm(value.search); }, [value.search]);

  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  const active = [
    value.publicBody && { key: 'publicBody', label: value.publicBody },
    value.tier && {
      key: 'tier',
      label: facets?.tiers.find((t) => t.value === value.tier)?.label ?? value.tier,
    },
    value.search && { key: 'search', label: `"${value.search}"` },
    (value.dateFrom || value.dateTo) && {
      key: 'dates',
      label: `${value.dateFrom || 'início'} até ${value.dateTo || 'hoje'}`,
    },
  ].filter(Boolean) as { key: string; label: string }[];

  const clear = (key: string) => {
    if (key === 'dates') set({ dateFrom: '', dateTo: '' });
    else set({ [key]: '' } as Partial<FilterState>);
  };

  const range = facets?.dateRange;

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}><Building2 size={13} /> Órgão</span>
          <select
            value={value.publicBody}
            onChange={(e) => set({ publicBody: e.target.value })}
          >
            <option value="">
              Todos os órgãos{facets ? ` (${facets.bodies.length})` : ''}
            </option>
            {facets?.bodies.map((b) => (
              <option key={b.value} value={b.value}>
                {b.value} — {b.count.toLocaleString('pt-BR')}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}><UserCog size={13} /> Cargo de quem recebe</span>
          <select value={value.tier} onChange={(e) => set({ tier: e.target.value })}>
            <option value="">Todos os cargos</option>
            {facets?.tiers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.count.toLocaleString('pt-BR')}
              </option>
            ))}
          </select>
        </label>

        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}><Search size={13} /> Nome</span>
          <input
            type="text"
            value={term}
            placeholder="autoridade, ministro(a), visitante ou empresa (ex: Marina Silva, Haddad...)"
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>

        <div className={`${styles.field} ${styles.dates}`}>
          <span className={styles.label}>
            <CalendarRange size={13} /> Período
            {range?.first && (
              <em className={styles.rangeHint}>
                {isoToBr(range.first)} a {isoToBr(range.last)}
              </em>
            )}
          </span>
          <div className={styles.dateInputs}>
            <input
              type="text" inputMode="numeric" placeholder="dd/mm/aaaa"
              value={value.dateFrom}
              onChange={(e) => {
                const masked = maskBrDate(e.target.value);
                if (masked === '' || isCompleteBrDate(masked)) set({ dateFrom: masked });
                else set({ dateFrom: masked });
              }}
              className={value.dateFrom && !isCompleteBrDate(value.dateFrom)
                ? styles.dateIncomplete : undefined}
            />
            <span className={styles.dateSep}>até</span>
            <input
              type="text" inputMode="numeric" placeholder="dd/mm/aaaa"
              value={value.dateTo}
              onChange={(e) => set({ dateTo: maskBrDate(e.target.value) })}
              className={value.dateTo && !isCompleteBrDate(value.dateTo)
                ? styles.dateIncomplete : undefined}
            />
          </div>
        </div>
      </div>

      {(active.length > 0 || totalLabel) && (
        <div className={styles.chips}>
          {totalLabel && (
            <span className={styles.total}>
              {loading ? 'filtrando…' : totalLabel}
            </span>
          )}
          {active.map((chip) => (
            <button key={chip.key} className={styles.chip} onClick={() => clear(chip.key)}>
              <span>{chip.label}</span>
              <X size={11} />
            </button>
          ))}
          {active.length > 1 && (
            <button className={styles.clearAll} onClick={() => onChange(EMPTY_FILTERS)}>
              limpar tudo
            </button>
          )}
        </div>
      )}
    </div>
  );
};
