import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { useGroupData } from '@/hooks/useGroupData';
import { useServerData } from '@/hooks/useServerData';
import { useCostData } from '@/hooks/useCostData';
import { GroupFormData, Server, IGroupServerConfig } from '@/types';
import { ServerToolConfig } from './ServerToolConfig';

interface AddGroupFormProps {
  onAdd: () => void;
  onCancel: () => void;
}

const AddGroupForm = ({ onAdd, onCancel }: AddGroupFormProps) => {
  const { t } = useTranslation();
  const { createGroup } = useGroupData();
  const { allServers } = useServerData();
  const { serverTokenInputs } = useCostData();
  const [availableServers, setAvailableServers] = useState<Server[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toolSearch, setToolSearch] = useState('');

  const [formData, setFormData] = useState<GroupFormData>({
    name: '',
    description: '',
    servers: [] as IGroupServerConfig[],
  });

  useEffect(() => {
    setAvailableServers(allServers.filter((server) => server.enabled !== false));
  }, [allServers]);

  const filteredServers = useMemo(() => {
    if (!toolSearch.trim()) {
      return availableServers;
    }
    const query = toolSearch.trim().toLowerCase();
    return availableServers.filter((server) =>
      (server.tools ?? []).some((tool) => tool.enabled !== false && tool.name.toLowerCase().includes(query)),
    );
  }, [availableServers, toolSearch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!formData.name.trim()) {
        setError(t('groups.nameRequired'));
        setIsSubmitting(false);
        return;
      }

      const result = await createGroup(
        formData.name,
        formData.description,
        formData.servers,
      );
      if (!result.ok) {
        setError(result.message || t('groups.createError'));
        setIsSubmitting(false);
        return;
      }

      onAdd();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">{t('groups.addNew')}</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md border border-gray-200 dark:border-gray-700">
              {error}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-4">
              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
                  {t('groups.name')} *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t('groups.namePlaceholder')}
                  required
                />
              </div>

              <div>
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  {t('groups.configureCapabilities')}
                </label>
                <div className="relative mb-2">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-ink-3)]" />
                  <input
                    type="text"
                    value={toolSearch}
                    onChange={(e) => setToolSearch(e.target.value)}
                    placeholder={t('groups.searchTools', 'Search tools')}
                    className="w-full border border-gray-300 rounded-md pl-9 pr-8 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {toolSearch && (
                    <button
                      type="button"
                      onClick={() => setToolSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <span className="text-sm font-medium">×</span>
                    </button>
                  )}
                </div>
                <ServerToolConfig
                  servers={filteredServers}
                  value={formData.servers as IGroupServerConfig[]}
                  onChange={(servers) => setFormData((prev) => ({ ...prev, servers }))}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                  serverTokenInputs={serverTokenInputs}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2 p-5 pt-3 border-t border-[var(--hub-line-2)] flex-shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="hub-btn"
              disabled={isSubmitting}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="hub-btn primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('common.submitting') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddGroupForm;
