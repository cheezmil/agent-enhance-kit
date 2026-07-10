import type { RuntimeConfig } from '../types/runtime';

/**
 * Get runtime configuration from window object
 */
export const getRuntimeConfig = (): RuntimeConfig => {
  return (
    window.__AEK_MCP_CONFIG__ || {
      basePath: '',
      version: 'dev',
      name: 'aek-mcp',
    }
  );
};

/**
 * Get the base path from runtime configuration
 */
export const getBasePath = (): string => {
  const config = getRuntimeConfig();
  const basePath = config.basePath || '';

  // Ensure the path starts with / if it's not empty and doesn't already start with /
  if (basePath && !basePath.startsWith('/')) {
    return '/' + basePath;
  }
  return basePath;
};

/**
 * Get the API base URL including base path and /api prefix
 */
export const getApiBaseUrl = (): string => {
  const basePath = getBasePath();
  // Always append /api to the base path for API endpoints
  return basePath + '/api';
};

/**
 * Construct a full API URL with the given endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrl();
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  return baseUrl + normalizedEndpoint;
};

/**
 * Load runtime configuration from server
 */
const CONFIG_CACHE_KEY = 'aek-mcp_runtime_config';
const DEFAULT_CONFIG: RuntimeConfig = { basePath: '', version: 'dev', name: 'aek-mcp' };

function getCachedConfig(): RuntimeConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCachedConfig(config: RuntimeConfig): void {
  try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config)); } catch {}
}

/** Returns cached config instantly (or null), then fetches fresh in background. */
export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  const cached = getCachedConfig();
  // Fire-and-forget background refresh
  fetchConfigFromServer().then(setCachedConfig).catch(() => {});
  return cached || (await fetchConfigFromServer());
};

async function fetchConfigFromServer(): Promise<RuntimeConfig> {
  const currentPath = window.location.pathname;
  const possibleConfigPaths = [
    currentPath.replace(/\/[^/]*$/, '') + '/config',
    '/config',
    ...(currentPath.includes('/')
      ? [currentPath.split('/')[1] ? `/${currentPath.split('/')[1]}/config` : '/config']
      : ['/config']),
  ];
  for (const configPath of possibleConfigPaths) {
    try {
      const response = await fetch(configPath, { method: 'GET', headers: { Accept: 'application/json' } });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) return data.data;
      }
    } catch {}
  }
  return DEFAULT_CONFIG;
}
