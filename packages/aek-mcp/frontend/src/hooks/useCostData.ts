import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../utils/fetchInterceptor';
import type { ApiResponse, ServerTokenInput, GroupTokenInput } from '@/types';

export const useCostData = () => {
  const [serverTokenInputs, setServerTokenInputs] = useState<ServerTokenInput[]>([]);
  const [groupTokenInputs, setGroupTokenInputs] = useState<GroupTokenInput[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCosts = useCallback(async () => {
    try {
      setLoading(true);
      const [servers, groups] = await Promise.all([
        apiGet('/cost/servers') as Promise<ApiResponse<ServerTokenInput[]>>,
        apiGet('/cost/groups') as Promise<ApiResponse<GroupTokenInput[]>>,
      ]);
      if (servers?.success && Array.isArray(servers.data)) setServerTokenInputs(servers.data);
      if (groups?.success && Array.isArray(groups.data)) setGroupTokenInputs(groups.data);
    } catch (err) {
      // Silently handle - cost data is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  return { serverTokenInputs, groupTokenInputs, loading, refetch: fetchCosts };
};
