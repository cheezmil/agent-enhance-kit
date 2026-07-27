import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Tool } from '@/types';
import { cn } from '@/utils/cn';
import { getToolDescriptionInfo } from '@/utils/toolDescription';

interface ToolOption {
  serverName: string;
  toolKey: string; // "serverName__toolName"
  displayName: string; // e.g. "exa__web_search"
  shortName: string; // e.g. "web_search"
  description: string;
}

interface AllowedToolsSelectorProps {
  servers: Server[];
  value?: string[];
  onChange: (value: string[]) => void;
  className?: string;
}

const AllowedToolsSelector: React.FC<AllowedToolsSelectorProps> = ({
  servers,
  value = [],
  onChange,
  className,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  const valueSet = useMemo(() => new Set(value), [value]);

  // Build the full tools list from all enabled servers
  const allTools: ToolOption[] = useMemo(() => {
    const enabledServers = servers.filter((s) => s.enabled !== false);
    const out: ToolOption[] = [];
    for (const server of enabledServers) {
      (server.tools || []).forEach((tool) => {
        if (tool.enabled === false) return;
        const prefix = `${server.name}__`;
        const shortName = tool.name.startsWith(prefix)
          ? tool.name.slice(prefix.length)
          : tool.name;
        const toolKey = `${server.name}__${shortName}`;
        out.push({
          serverName: server.name,
          toolKey,
          displayName: tool.name,
          shortName,
          description: tool.description || '',
        });
      });
    }
    return out;
  }, [servers]);

  // Debounce-free filtered list (list is small)
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allTools;
    return allTools.filter(
      (t) =>
        t.displayName.toLowerCase().includes(q) ||
        t.shortName.toLowerCase().includes(q) ||
        t.serverName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [query, allTools]);

  const toggle = (toolKey: string) => {
    if (valueSet.has(toolKey)) {
      onChange(value.filter((k) => k !== toolKey));
    } else {
      onChange([...value, toolKey]);
    }
  };

  const selectedCount = value.length;
  const totalCount = allTools.length;
  const allSelected = selectedCount > 0 && selectedCount === totalCount;

  const selectAll = () => onChange(allTools.map((t) => t.toolKey));
  const selectNone = () => onChange([]);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-gray-700 text-sm font-bold">
            {t('groups.allowedTools')}
          </label>
          <p className="text-gray-500 text-xs mt-0.5">{t('groups.allowedToolsHint')}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount === 0 ? (
            <span className="text-xs text-gray-400">{t('groups.allToolsExposed')}</span>
          ) : (
            <span className="text-xs text-green-600">
              {t('groups.allowedToolCount', { count: selectedCount })}
            </span>
          )}
          <button
            type="button"
            onClick={allSelected ? selectNone : selectAll}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {allSelected ? t('groups.selectNone') : t('groups.selectAll')}
          </button>
        </div>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('groups.searchTools')}
        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">{t('groups.noToolsFound')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-2">
          {filtered.map((tool) => {
            const isChecked = valueSet.has(tool.toolKey);
            const descriptionInfo = getToolDescriptionInfo(
              {
                description: tool.description,
                defaultDescription: undefined,
                hasDescriptionOverride: undefined,
              },
              t('tool.noDescription'),
            );
            return (
              <label
                key={tool.toolKey}
                className="flex min-w-0 items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 py-0.5"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(tool.toolKey)}
                  className="w-3 h-3 text-blue-600 bg-gray-100 dark:bg-gray-800 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                />
                <span className="text-gray-900 font-mono text-xs break-all whitespace-nowrap">
                  {tool.displayName}
                </span>
                {descriptionInfo?.hasDescriptionOverride || tool.description ? (
                  <span className="text-gray-400 text-xs truncate">
                    {descriptionInfo?.currentDescription ?? tool.description}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AllowedToolsSelector;
