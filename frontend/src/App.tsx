import React, { useEffect, useState, Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from './components/common/Header';
import { NavigationTabs } from './components/common/NavigationTabs';
import { GlobalSearchModal } from './components/search/GlobalSearchModal';
import { UnifiedActorDossierModal } from './components/dossier/UnifiedActorDossierModal';
import { PageLoadingFallback } from './components/common/PageLoadingFallback';
import { useUrlNavigation } from './services/useUrlNavigation';
import { getApiUrl } from './services/api';
import { HomePage } from './components/home/HomePage';
import { Footer } from './components/common/Footer';
import { OnboardingModal } from './components/common/OnboardingModal';

// Lazy loading para otimização de performance e code splitting
const MinistryFichaPage = lazy(() =>
  import('./components/ministry/MinistryFichaPage').then((m) => ({ default: m.MinistryFichaPage }))
);
const RankingPage = lazy(() =>
  import('./components/ranking/RankingPage').then((m) => ({ default: m.RankingPage }))
);
const AlertsPage = lazy(() =>
  import('./components/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage }))
);
const GraphExplorerPage = lazy(() =>
  import('./components/graph/GraphExplorerPage').then((m) => ({ default: m.GraphExplorerPage }))
);
const TransparencyDataHub = lazy(() =>
  import('./components/transparency/TransparencyDataHub').then((m) => ({ default: m.TransparencyDataHub }))
);
const AuthoritiesPage = lazy(() =>
  import('./components/authorities/AuthoritiesPage').then((m) => ({ default: m.AuthoritiesPage }))
);
const AntunesPage = lazy(() =>
  import('./components/antunes/AntunesPage').then((m) => ({ default: m.AntunesPage }))
);
const UnifiedAuthorityDossierModal = lazy(() =>
  import('./components/dossier/UnifiedAuthorityDossierModal').then((m) => ({ default: m.UnifiedAuthorityDossierModal }))
);
const AuthorProfilePage = lazy(() =>
  import('./components/author/AuthorProfilePage').then((m) => ({ default: m.AuthorProfilePage }))
);
const MethodologyPage = lazy(() =>
  import('./components/methodology/MethodologyPage').then((m) => ({ default: m.MethodologyPage }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  const {
    tab,
    personId,
    authorityName,
    ministry,
    subtab,
    setTab,
    openPersonDossier,
    closePersonDossier,
    openAuthorityDossier,
    closeAuthorityDossier,
    setMinistryParam,
    setSubTabParam,
  } = useUrlNavigation();

  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);

  // Busca contagem real de alertas críticos e altos
  useEffect(() => {
    fetch(getApiUrl('/api/v1/dashboard/kpis'))
      .then((r) => r.json())
      .then((k) => setActiveAlertsCount((k.criticalAlertsCount ?? 0) + (k.highAlertsCount ?? 0)))
      .catch(() => setActiveAlertsCount(0));
  }, []);

  // Listener global de teclado para acionar a busca universal com Ctrl+K ou Cmd+K
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleInspectPerson = (inspectPersonId: string, targetAuthority?: string) => {
    openPersonDossier(inspectPersonId, targetAuthority);
  };

  const handleSelectMinistryFromSearch = (ministryName: string) => {
    setMinistryParam(ministryName);
    setTab('MINISTRIES');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
        {/* Cabeçalho Institucional com Marca Antessala, Robô Antunes e Busca */}
        <Header 
          onOpenSearch={() => setIsSearchOpen(true)} 
          onNavigateHome={() => setTab('HOME')}
          onOpenOnboarding={() => setIsOnboardingOpen(true)}
        />

        {/* Barra de Navegação dos Pilares da Antessala */}
        <NavigationTabs
          activeTab={tab}
          onTabChange={setTab}
          activeAlertsCount={activeAlertsCount}
        />

        {/* Conteúdo Principal com Lazy Loading e Fallback Temático CGU */}
        <main style={{ flex: 1, background: 'var(--bg-main)' }}>
          <Suspense fallback={<PageLoadingFallback />}>
            {tab === 'HOME' && (
              <HomePage onNavigateTab={setTab} />
            )}

            {tab === 'ANTUNES' && (
              <AntunesPage onNavigateTab={setTab} />
            )}

            {tab === 'MINISTRIES' && (
              <MinistryFichaPage onInspectPerson={handleInspectPerson} />
            )}

            {tab === 'AUTHORITIES' && (
              <AuthoritiesPage onInspectAuthority={openAuthorityDossier} />
            )}

            {tab === 'LOBBYISTS' && (
              <RankingPage onInspectPerson={handleInspectPerson} />
            )}

            {tab === 'ALERTS' && (
              <AlertsPage onInspectPerson={handleInspectPerson} />
            )}

            {tab === 'GRAPH' && (
              <GraphExplorerPage
                personId={personId || undefined}
                onOpenDossier={handleInspectPerson}
              />
            )}

            {tab === 'TRANSPARENCY' && (
              <TransparencyDataHub
                initialSubTab={(subtab as any) || 'TREEMAP'}
                onSubTabChange={setSubTabParam}
              />
            )}

            {tab === 'METHODOLOGY' && (
              <MethodologyPage onNavigateTab={setTab} />
            )}

            {tab === 'AUTHOR' && (
              <AuthorProfilePage onNavigateTab={setTab} />
            )}
          </Suspense>
        </main>

        {/* Rodapé Institucional com Logo sem slogan e Robô Antunes */}
        <Footer onNavigateTab={setTab} />

        {/* Modal de Busca Universal Global (Ctrl+K / Cmd+K) */}
        <GlobalSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelectPerson={handleInspectPerson}
          onSelectMinistry={handleSelectMinistryFromSearch}
          onSelectAuthority={openAuthorityDossier}
        />

        {/* Ficha / Dossiê Unificado do Ator em Modal Overlay */}
        <UnifiedActorDossierModal
          onInspectPerson={(id) => handleInspectPerson(id)}
          onInspectAuthority={openAuthorityDossier}
          personId={personId}
          targetAuthorityName={authorityName}
          onClose={closePersonDossier}
        />

        {/* Ficha / Dossiê Unificado de Autoridade Pública em Modal Overlay */}
        {authorityName && (
          <Suspense fallback={null}>
            <UnifiedAuthorityDossierModal
              authorityName={authorityName}
              onClose={closeAuthorityDossier}
              onInspectPerson={handleInspectPerson}
            />
          </Suspense>
        )}

        {/* Modal de Onboarding e Guia do Cidadão em 60s */}
        <OnboardingModal
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
        />
      </div>
    </QueryClientProvider>
  );
};

export default App;
