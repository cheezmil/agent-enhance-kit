import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save } from 'lucide-react';
import { Server } from '@/types';
import { apiPut, apiPost } from '../utils/fetchInterceptor';

interface JsonServerEditorProps {
  server: Server;
  onEdit: () => void;
  onCancel: () => void;
}

const JsonServerEditor = ({ server, onEdit, onCancel }: JsonServerEditorProps) => {
  const { t } = useTranslation();
  
  // Build the full server config block
  const buildInitialJson = () => {
    const serverConfig: Record<string, any> = {};
    
    // Add config fields (command, args, env, url, type, etc.)
    if (server.config) {
      if (server.config.command) serverConfig.command = server.config.command;
      if (server.config.args) serverConfig.args = server.config.args;
      if (server.config.env) serverConfig.env = server.config.env;
      if (server.config.url) serverConfig.url = server.config.url;
      if (server.config.type) serverConfig.type = server.config.type;
      if (server.config.description) serverConfig.description = server.config.description;
      if (server.config.headers) serverConfig.headers = server.config.headers;
      if (server.config.options) serverConfig.options = serverConfig.options;
      if (server.config.proxy) serverConfig.proxy = serverConfig.proxy;
      if (server.config.oauth) serverConfig.oauth = serverConfig.oauth;
      if (server.config.openapi) serverConfig.openapi = serverConfig.openapi;
      if (server.config.enableKeepAlive !== undefined) serverConfig.enableKeepAlive = serverConfig.enableKeepAlive;
      if (server.config.keepAliveInterval) serverConfig.keepAliveInterval = serverConfig.keepAliveInterval;
    }
    
    // Build the full block with server name as key
    const fullBlock: Record<string, any> = {};
    fullBlock[server.name] = serverConfig;
    fullBlock.enabled = server.enabled !== false;
    fullBlock.owner = server.owner || 'admin';
    
    return JSON.stringify(fullBlock, null, 2);
  };

  const [jsonContent, setJsonContent] = useState(buildInitialJson);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setError(null);
      setSaving(true);

      // Parse and validate JSON
      let config;
      try {
        config = JSON.parse(jsonContent);
      } catch (e) {
        setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
        setSaving(false);
        return;
      }

      // Extract server config from the block
      const serverConfig = config[server.name];
      if (!serverConfig) {
        setError(`Missing server config for "${server.name}"`);
        setSaving(false);
        return;
      }

      const encodedServerName = encodeURIComponent(server.name);
      
      // Build the config object with all fields
      const fullConfig: Record<string, any> = {
        ...serverConfig,
        enabled: config.enabled !== false,
        owner: config.owner || server.owner || 'admin',
      };

      // Update server config
      const result = await apiPut(`/servers/${encodedServerName}`, {
        config: fullConfig,
      });

      if (!result.success) {
        setError(result.message || t('server.updateError', { serverName: server.name }));
        setSaving(false);
        return;
      }

      // Auto reload after successful save
      try {
        await apiPost(`/servers/${encodedServerName}/reload`, {});
      } catch (reloadErr) {
        // Ignore reload errors, server might be down
        console.warn('Reload failed after save:', reloadErr);
      }

      onEdit();
    } catch (err) {
      console.error('Error updating server:', err);
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="hub-card p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-[var(--hub-ink)]">
            {t('server.editTitle', { serverName: server.name })}
          </h2>
          <button
            onClick={onCancel}
            className="hub-icon-btn"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          <label className="block text-sm font-medium mb-2 text-[var(--hub-ink-2)]">
            Server Configuration (JSON)
          </label>
          <textarea
            value={jsonContent}
            onChange={(e) => setJsonContent(e.target.value)}
            className="w-full h-[60vh] p-3 font-mono text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              background: 'var(--hub-bg-2)',
              color: 'var(--hub-ink)',
              borderColor: 'var(--hub-line)',
            }}
            spellCheck={false}
          />
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--hub-line-2)' }}>
          <button
            onClick={onCancel}
            className="hub-btn"
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="hub-btn primary flex items-center gap-2"
            disabled={saving}
          >
            <Save size={14} />
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default JsonServerEditor;
