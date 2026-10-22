type AuthSession = {
  session: { id: string; token: string; createdAt: Date; expiresAt: Date };
  user: { id: string; name: string; email: string; emailVerified: boolean };
};
type SessionStore = {
  getSession: (headers: Headers) => Promise<AuthSession | null>;
  revokeSession: (token: string) => Promise<void>;
};

export async function loadApplicationSession(store: SessionStore, headers: Headers, now = Date.now()) {
  const result = await store.getSession(headers);
  if (!result) return null;
  if (now >= result.session.createdAt.getTime() + 30 * 86_400_000 ||
      now >= result.session.expiresAt.getTime()) {
    await store.revokeSession(result.session.token);
    return null;
  }
  return {
    sessionId: result.session.id,
    user: {
      id: result.user.id, name: result.user.name,
      email: result.user.email, emailVerified: result.user.emailVerified,
    },
  };
}
