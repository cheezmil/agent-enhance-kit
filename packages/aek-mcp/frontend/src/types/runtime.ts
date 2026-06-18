// Global runtime configuration interface
export interface RuntimeConfig {
  basePath: string;
  version: string;
  name: string;
}

// Extend Window interface to include runtime config
declare global {
  interface Window {
    __AEK_MCP_CONFIG__?: RuntimeConfig;
  }
}

export {};
