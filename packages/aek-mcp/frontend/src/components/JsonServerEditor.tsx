import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save } from 'lucide-react';
import { Server } from '@/types';
import { apiGet, apiPut, apiPost } from '../utils/fetchInterceptor';

interface JsonServerEditorProps {
  server: Server;
  onEdit: () => void;
  onCancel: () => void;
}

const JsonServerEditor = ({ server, onEdit, onCancel }: JsonServerEditorProps) => {
  const { t } = useTranslation();
  const [jsonContent, setJsonContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Strip JSONC comments
  const stripJsoncComments = (s: string): string => {
    let result = '';
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;
    let prev = '';

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          result += ch;
        }
        continue;
      }

      if (inBlockComment) {
        if (prev === '*' && ch === '/') {
          inBlockComment = false;
        }
        prev = ch;
        continue;
      }

      if (inString) {
        result += ch;
        if (ch === '"' && prev !== '\\') {
          inString = false;
        }
        prev = ch;
        continue;
      }

      if (ch === '"') {
        inString = true;
        result += ch;
        prev = ch;
        continue;
      }

      if (ch === '/' && i + 1 < s.length) {
        if (s[i + 1] === '/') {
          inLineComment = true;
          prev = ch;
          continue;
        }
        if (s[i + 1] === '*') {
          inBlockComment = true;
          prev = ch;
          continue;
        }
      }

      result += ch;
      prev = ch;
    }
    return result;
  };

  // Load the raw config file
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result: any = await apiGet('/mcp-settings/raw');
        if (result.success && result.data) {
          let raw = result.data.content || '';
          
          // Strip comments
          const cleaned = stripJsoncComments(raw);
          try {
            const config = JSON.parse(cleaned);
            
            // Extract the server block
            const serverBlock = config[server.name];
            if (serverBlock) {
              // Display the server block exactly as it is in the config
              const displayBlock: Record<string, any> = {};
              displayBlock[server.name] = serverBlock;
              setJsonContent(JSON.stringify(displayBlock, null, 2));
            } else {
              setError(`Server "${server.name}" not found in config`);
            }
          } catch (e) {
            console.error('Parse error:', e);
            setError(`Failed to parse config: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } catch (err) {
        setError(`Failed to load config: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadConfig();
  }, [server.name]);

  const handleSave = async () => {
    try {
      setError(null);
      setSaving(true);

      // Parse the edited JSON
      let editedBlock;
      try {
        editedBlock = JSON.parse(jsonContent);
      } catch (e) {
        setError(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
        setSaving(false);
        return;
      }

      // Load the current config file
      const configResult: any = await apiGet('/mcp-settings/raw');
      if (!configResult.success || !configResult.data) {
        setError('Failed to load config file');
        setSaving(false);
        return;
      }

      // Parse the current config
      let config;
      try {
        const cleaned = stripJsoncComments(configResult.data.content);
        config = JSON.parse(cleaned);
      } catch (e) {
        setError(`Failed to parse config: ${e instanceof Error ? e.message : String(e)}`);
        setSaving(false);
        return;
      }

      // Update the server block
      config[server.name] = editedBlock[server.name];

      // Save the updated config
      const saveResult: any = await apiPut('/mcp-settings/raw', {
        content: JSON.stringify(config, null, 2)
      });

      if (!saveResult.success) {
        setError(saveResult.message || 'Failed to save config');
        setSaving(false);
        return;
      }

      onEdit();
    } catch (err) {
      console.error('Error saving config:', err);
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="hub-card p-6 w-full max-w-4xl">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

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
