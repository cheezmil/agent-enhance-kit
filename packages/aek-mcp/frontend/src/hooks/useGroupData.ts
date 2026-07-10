import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, ApiResponse, IGroupServerConfig } from '@/types';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/fetchInterceptor';

export const useGroupData = () => {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchGroups = useCallback(async () => {
    try {
      setLoading(true);
      const data: ApiResponse<Group[]> = await apiGet('/groups');

      if (data && data.success && Array.isArray(data.data)) {
        setGroups(data.data);
      } else {
        // Groups may legitimately be empty or endpoint may not be available
        setGroups(Array.isArray(data?.data) ? data.data : []);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger a refresh of the groups data
  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Create a new group with server associations
  const createGroup = async (
    name: string,
    description?: string,
    servers: string[] | IGroupServerConfig[] = [],
  ): Promise<Group | null> => {
    try {
      const data = await apiPost('/groups', {
        name,
        description,
        servers,
      });
      if (data.success) {
        await fetchGroups();
        return data.data;
      }
      return null;
    } catch (err) {
      console.error('Error creating group:', err);
      return null;
    }
  };

  // Update an existing group
  const updateGroup = async (
    groupId: string,
    name: string,
    description?: string,
    servers?: string[] | IGroupServerConfig[],
  ): Promise<boolean> => {
    try {
      const updateData: Record<string, any> = { name };
      if (description !== undefined) updateData.description = description;
      if (servers !== undefined) updateData.servers = servers;

      const data = await apiPut(`/groups/${groupId}`, updateData);
      if (data.success) {
        await fetchGroups();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error updating group:', err);
      return false;
    }
  };

  // Delete a group
  const deleteGroup = async (groupId: string): Promise<boolean> => {
    try {
      const data = await apiDelete(`/groups/${groupId}`);
      if (data.success) {
        await fetchGroups();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error deleting group:', err);
      return false;
    }
  };

  // Add servers to a group
  const addServersToGroup = async (
    groupId: string,
    serverNames: string[],
  ): Promise<boolean> => {
    try {
      const data = await apiPost(`/groups/${groupId}/servers`, {
        serverNames,
      });
      if (data.success) {
        await fetchGroups();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error adding servers to group:', err);
      return false;
    }
  };

  // Remove servers from a group
  const removeServersFromGroup = async (
    groupId: string,
    serverNames: string[],
  ): Promise<boolean> => {
    try {
      const data = await apiDelete(`/groups/${groupId}/servers`, {
        body: JSON.stringify({ serverNames }),
        headers: { 'Content-Type': 'application/json' },
      });
      if (data.success) {
        await fetchGroups();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error removing servers from group:', err);
      return false;
    }
  };

  // Fetch data when refreshKey changes
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups, refreshKey]);

  return {
    groups,
    loading,
    error,
    fetchGroups,
    triggerRefresh,
    createGroup,
    updateGroup,
    deleteGroup,
    addServersToGroup,
    removeServersFromGroup,
  };
};
