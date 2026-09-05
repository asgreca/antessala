const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
export const API_BASE_URL = isLocalhost ? 'http://localhost:8000/api/v1' : '/api/v1';

export function getApiUrl(path: string): string {
  const clean = path.startsWith('/') ? path.substring(1) : path;
  if (clean.startsWith('api/v1/')) {
    const sub = clean.substring('api/v1/'.length);
    return `${API_BASE_URL}/${sub}`;
  }
  return `${API_BASE_URL}/${clean}`;
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = getApiUrl(endpoint);
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
  } catch (err: any) {
    throw new Error(`Fetch call failed for URL ${url}: ` + err.message);
  }

  if (!response.ok) {
    let errText = '';
    try { errText = await response.text(); } catch(e) {}
    throw new Error(`HTTP Error ${response.status}: ${errText}`);
  }

  let text = '';
  try {
    text = await response.text();
    return JSON.parse(text);
  } catch (err: any) {
    throw new Error(`JSON Parse falhou para URL ${url}. Texto recebido: '${text.substring(0, 100)}...'. Erro original: ` + err.message);
  }
}
