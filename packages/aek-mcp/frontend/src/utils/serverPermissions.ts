type ServerLike = {
  owner?: string;
};

type UserLike = {
  username: string;
  isAdmin?: boolean;
  role?: string;
} | null | undefined;

export const canManageServer = (server: ServerLike, user: UserLike): boolean => {
  if (!user) {
    return false;
  }

  if (user.isAdmin || user.role === 'admin') {
    return true;
  }

  return Boolean(server.owner && server.owner === user.username);
};
