import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Building2, Landmark, X, ArrowUp, ArrowDown, CornerDownLeft } from 'lucide-react';
import { SearchResultItem } from '../../types/search.types';
import { searchService } from '../../services/searchService';
import styles from './GlobalSearchModal.module.css';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
  onSelectMinistry?: (ministryName: string) => void;
  onSelectAuthority?: (authorityName: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectPerson,
  onSelectMinistry,
  onSelectAuthority,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchService.searchGlobal(query.trim(), 15);
        setResults(res);
        setSelectedIndex(0);
      } catch (err) {
        console.error('Erro na busca global:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          handleSelect(selected);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll(`.${styles.resultItem}`);
      const current = items[selectedIndex] as HTMLElement;
      if (current) {
        current.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const handleSelect = (item: SearchResultItem) => {
    if (item.entityType === 'AUTHORITY') {
      if (onSelectAuthority) {
        onSelectAuthority(item.name);
      }
      onClose();
    } else if (item.entityType === 'PERSON') {
      onSelectPerson(item.id);
      onClose();
    } else if (item.entityType === 'PUBLIC_BODY' && onSelectMinistry) {
      onSelectMinistry(item.name);
      onClose();
    } else {
      onSelectPerson(item.id);
      onClose();
    }
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'AUTHORITY':
        return (
          <div className={`${styles.iconBox} ${styles.iconBody}`} style={{ color: '#2563EB', background: '#EFF6FF', borderColor: '#BFDBFE' }}>
            <Landmark size={18} aria-hidden="true" />
          </div>
        );
      case 'PERSON':
        return (
          <div className={`${styles.iconBox} ${styles.iconPerson}`}>
            <User size={18} aria-hidden="true" />
          </div>
        );
      case 'ORGANIZATION':
      case 'ENTIDADE_DECLARADA':
        return (
          <div className={`${styles.iconBox} ${styles.iconOrg}`}>
            <Building2 size={18} aria-hidden="true" />
          </div>
        );
      case 'PUBLIC_BODY':
        return (
          <div className={`${styles.iconBox} ${styles.iconBody}`}>
            <Landmark size={18} aria-hidden="true" />
          </div>
        );
      default:
        return (
          <div className={styles.iconBox}>
            <Search size={18} aria-hidden="true" />
          </div>
        );
    }
  };

  const getTagClass = (type: string) => {
    switch (type) {
      case 'AUTHORITY': return styles.tagBody;
      case 'PERSON': return styles.tagPerson;
      case 'ORGANIZATION':
      case 'ENTIDADE_DECLARADA': return styles.tagOrg;
      case 'PUBLIC_BODY': return styles.tagBody;
      default: return '';
    }
  };

  const formatType = (type: string) => {
    switch (type) {
      case 'AUTHORITY': return 'Autoridade Pública';
      case 'PERSON': return 'Representante / Interlocutor';
      case 'ORGANIZATION': return 'Empresa';
      case 'ENTIDADE_DECLARADA': return 'Entidade';
      case 'PUBLIC_BODY': return 'Órgão Federal';
      default: return type;
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Busca Universal da Antessala"
      >
        <div className={styles.inputWrapper}>
          <Search size={22} className={styles.searchIcon} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Buscar por nome do representante, CPF, razão social, CNPJ ou ministério..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Campo de busca universal"
          />
          {query ? (
            <button
              className={styles.clearBtn}
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
            >
              <X size={18} />
            </button>
          ) : (
            <kbd className={styles.kbdHint}>ESC para sair</kbd>
          )}
        </div>

        {query.trim().length >= 2 ? (
          <div className={styles.resultsList} ref={listRef} role="listbox">
            {loading ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyText}>Pesquisando na base do e-Agendas e DOU...</span>
              </div>
            ) : results.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyTitle}>Nenhum resultado encontrado</span>
                <span className={styles.emptyText}>
                  Não foram encontradas entidades com "{query}". Tente buscar por outro termo, CPF ou CNPJ.
                </span>
              </div>
            ) : (
              results.map((item, index) => (
                <div
                  key={`${item.id}-${item.entityType}-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={`${styles.resultItem} ${index === selectedIndex ? styles.resultItemSelected : ''}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {getEntityIcon(item.entityType)}
                  <div className={styles.itemInfo}>
                    <div className={styles.itemTop}>
                      <span className={styles.itemName}>{item.name}</span>
                      <span className={`${styles.typeTag} ${getTagClass(item.entityType)}`}>
                        {formatType(item.entityType)}
                      </span>
                    </div>
                    <div className={styles.itemBottom}>
                      {item.document && <span className="font-mono">{item.document}</span>}
                      {item.details && <span>&bull; {item.details}</span>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '8px' }}>
              <img
                src="/antunes_mala.png"
                alt="Robô Antunes"
                style={{ width: '68px', height: '68px', objectFit: 'contain', filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.08))' }}
              />
              <img
                src="/logo_antessala.png"
                alt="Antessala — Monitorando Agenda. Rastreando Influências."
                style={{ height: '36px', width: 'auto' }}
              />
            </div>
            <span className={styles.emptyTitle}>Busca Universal de Inteligência &bull; Robô Antunes</span>
            <span className={styles.emptyText}>
              O Robô Antunes localiza representantes, autoridades públicas, empresas ou órgãos do Executivo Federal em milissegundos. Digite ao menos 2 caracteres para pesquisar.
            </span>
          </div>
        )}

        <div className={styles.footer}>
          <div className={styles.footerShortcuts}>
            <span className={styles.shortcut}>
              <kbd className={styles.kbdHint}><ArrowUp size={10} /><ArrowDown size={10} /></kbd> Navegar
            </span>
            <span className={styles.shortcut}>
              <kbd className={styles.kbdHint}><CornerDownLeft size={10} /></kbd> Selecionar
            </span>
            <span className={styles.shortcut}>
              <kbd className={styles.kbdHint}>ESC</kbd> Fechar
            </span>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/logo_antessala.png" alt="Antessala" style={{ height: '20px', width: 'auto' }} />
            <span>Antessala &bull; Inteligência Pública</span>
          </span>
        </div>
      </div>
    </div>
  );
};
