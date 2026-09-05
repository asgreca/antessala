import { useState, useEffect, useCallback } from 'react';
import { MainTabType } from '../components/common/NavigationTabs';

export interface UrlNavigationState {
  tab: MainTabType;
  personId: string | null;
  authorityName: string | null;
  ministry: string | null;
  subtab: string | null;
}

const parseUrlParams = (): UrlNavigationState => {
  if (typeof window === 'undefined') {
    return {
      tab: 'HOME',
      personId: null,
      authorityName: null,
      ministry: null,
      subtab: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const rawTab = params.get('tab')?.toUpperCase();
  const validTabs: MainTabType[] = ['HOME', 'MINISTRIES', 'AUTHORITIES', 'LOBBYISTS', 'ALERTS', 'GRAPH', 'TRANSPARENCY', 'METHODOLOGY', 'AUTHOR'];
  const tab: MainTabType = validTabs.includes(rawTab as MainTabType) ? (rawTab as MainTabType) : 'HOME';

  return {
    tab,
    personId: params.get('person') || null,
    authorityName: params.get('auth') || null,
    ministry: params.get('ministry') || null,
    subtab: params.get('subtab') || null,
  };
};

export const useUrlNavigation = () => {
  const [state, setState] = useState<UrlNavigationState>(parseUrlParams);

  // Sincroniza estado com a barra de URL via pushState
  const updateUrl = useCallback((nextState: UrlNavigationState, push = true) => {
    const params = new URLSearchParams();

    if (nextState.tab && nextState.tab !== 'HOME') {
      params.set('tab', nextState.tab);
    }
    if (nextState.personId) {
      params.set('person', nextState.personId);
    }
    if (nextState.authorityName) {
      params.set('auth', nextState.authorityName);
    }
    if (nextState.ministry) {
      params.set('ministry', nextState.ministry);
    }
    if (nextState.subtab) {
      params.set('subtab', nextState.subtab);
    }

    const queryString = params.toString();
    const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;

    if (push) {
      window.history.pushState(nextState, '', newUrl);
    } else {
      window.history.replaceState(nextState, '', newUrl);
    }
  }, []);

  // Ouve evento popstate (botão Voltar e Avançar do navegador)
  useEffect(() => {
    const handlePopState = () => {
      setState(parseUrlParams());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setTab = useCallback((tab: MainTabType) => {
    setState((prev) => {
      const next = { ...prev, tab };
      updateUrl(next, true);
      return next;
    });
  }, [updateUrl]);

  const openPersonDossier = useCallback((personId: string, authorityName?: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        personId,
        authorityName: authorityName || null,
      };
      updateUrl(next, true);
      return next;
    });
  }, [updateUrl]);

  const closePersonDossier = useCallback(() => {
    setState((prev) => {
      const next = {
        ...prev,
        personId: null,
      };
      updateUrl(next, true);
      return next;
    });
  }, [updateUrl]);

  const openAuthorityDossier = useCallback((authorityName: string) => {
    setState((prev) => {
      const next = {
        ...prev,
        authorityName,
        personId: null,
      };
      updateUrl(next, true);
      return next;
    });
  }, [updateUrl]);

  const closeAuthorityDossier = useCallback(() => {
    setState((prev) => {
      const next = {
        ...prev,
        authorityName: null,
      };
      updateUrl(next, true);
      return next;
    });
  }, [updateUrl]);

  const setMinistryParam = useCallback((ministry: string | null) => {
    setState((prev) => {
      const next = { ...prev, ministry };
      updateUrl(next, false);
      return next;
    });
  }, [updateUrl]);

  const setSubTabParam = useCallback((subtab: string | null) => {
    setState((prev) => {
      const next = { ...prev, subtab };
      updateUrl(next, false);
      return next;
    });
  }, [updateUrl]);

  return {
    tab: state.tab,
    personId: state.personId,
    authorityName: state.authorityName,
    ministry: state.ministry,
    subtab: state.subtab,
    setTab,
    openPersonDossier,
    closePersonDossier,
    openAuthorityDossier,
    closeAuthorityDossier,
    setMinistryParam,
    setSubTabParam,
  };
};
