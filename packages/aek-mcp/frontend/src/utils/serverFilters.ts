import { Server } from '@/types';

export type ServerFilter = 'all' | 'favorites' | 'online' | 'issues' | 'disabled';

export const getServerFilterCounts = (servers: Server[], favorites?: Set<string>) => ({
  all: servers.length,
  online: servers.filter((server) => server.status === 'connected').length,
  issues: servers.filter((server) => server.status !== 'connected' && server.enabled !== false).length,
  disabled: servers.filter((server) => server.enabled === false).length,
  favorites: favorites ? servers.filter((s) => favorites.has(s.name)).length : 0,
});

export const filterServers = (
  servers: Server[],
  filter: ServerFilter,
  search = '',
): Server[] => {
  const query = search.trim().toLowerCase();

  return servers.filter((server) => {
    if (filter === 'online' && server.status !== 'connected') return false;
    if (filter === 'issues' && (server.status === 'connected' || server.enabled === false)) return false;
    if (filter === 'disabled' && server.enabled !== false) return false;
    if (!query) return true;

    const haystack = (
      server.name +
      ' ' +
      (server.config?.description || '') +
      ' ' +
      (server.tools?.map((tool) => tool.name).join(' ') || '')
    ).toLowerCase();

    return haystack.includes(query);
  });
};
