import React, { useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import mermaid from 'mermaid';
import styles from './MarkdownRenderer.module.css';

interface MarkdownRendererProps {
  content: string;
}

// Configura marked para GFM (GitHub Flavored Markdown) com quebra de linha inteligente
marked.setOptions({
  gfm: true,
  breaks: true,
});

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  securityLevel: 'loose',
  fontFamily: 'Inter, system-ui, sans-serif',
});

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content) as string;
    } catch (e) {
      console.error('Erro ao parsear markdown:', e);
      return content;
    }
  }, [content]);

  useEffect(() => {
    if (!containerRef.current) return;
    const codeBlocks = containerRef.current.querySelectorAll('code.language-mermaid');
    if (codeBlocks.length === 0) return;

    codeBlocks.forEach(async (codeEl, idx) => {
      const parent = codeEl.parentElement; // the <pre> tag
      if (!parent || parent.getAttribute('data-mermaid-processed')) return;
      parent.setAttribute('data-mermaid-processed', 'true');

      const rawCode = (codeEl.textContent || '').trim();
      if (!rawCode) return;

      const renderId = `mermaid-svg-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
      try {
        const { svg } = await mermaid.render(renderId, rawCode);
        const wrapper = document.createElement('div');
        wrapper.className = styles.mermaidDiagram;
        wrapper.innerHTML = svg;
        parent.replaceWith(wrapper);
      } catch (err) {
        console.warn('Falha na renderização de diagrama mermaid:', err);
      }
    });
  }, [html]);

  if (!content) return null;

  return (
    <div
      ref={containerRef}
      className={styles.markdownContainer}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

