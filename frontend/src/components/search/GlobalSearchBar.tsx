import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Building2, Landmark, X } from 'lucide-react';
import { SearchResultItem } from '../../types/search.types';
import { searchService } from '../../services/searchService';
import styles from './GlobalSearchBar.module.css';

interface GlobalSearchBarProps {
  onSelectEntity: (item: SearchResultItem) => void;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ onSelectEntity }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hook useDebounce: 250ms
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchService.searchGlobal(query.trim());
        setResults(res);
        setIsOpen(true);
      } catch (err) {
        console.error('Erro na busca global:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: SearchResultItem) => {
    onSelectEntity(item);
    setIsOpen(false);
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'PERSON': return <User size={16} className={styles.iconPerson} />;
      case 'ORGANIZATION': return <Building2 size={16} className={styles.iconOrg} />;
      case 'PUBLIC_BODY': return <Landmark size={16} className={styles.iconBody} />;
      default: return <Search size={16} />;
    }
  };

  return (
    <div className={styles.searchWrapper} ref={containerRef}>
      <div className={styles.inputContainer}>
        <Search size={20} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.input}
          placeholder="Digite nome do representante, CPF, razão social, CNPJ ou órgão (ex: Carlos Henrique, BioPharma, Saúde)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
        />
        {query && (
          <button className={styles.clearBtn} onClick={() => setQuery('')}>
            <X size={16} />
          </button>
        )}
      </div>

      {isOpen && (
        <div className={styles.dropdown}>
          {loading ? (
            <div className={styles.dropdownMessage}>Buscando por trigramas e full-text...</div>
          ) : results.length === 0 ? (
            <div className={styles.dropdownMessage}>Nenhuma entidade encontrada para "{query}".</div>
          ) : (
            <div className={styles.resultsList}>
              {results.map((item) => (
                <div
                  key={item.id + item.entityType}
                  className={styles.resultRow}
                  onClick={() => handleSelect(item)}
                >
                  <div className={styles.iconBox}>{getEntityIcon(item.entityType)}</div>
                  <div className={styles.rowInfo}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowName}>{item.name}</span>
                      <span className={styles.rowTypeTag}>{item.entityType}</span>
                    </div>
                    <div className={styles.rowBottom}>
                      <span className="font-mono">{item.document}</span>
                      <span>&bull; {item.details}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
