/** Native-style in-memory AuthAdapter: allowed domains exist only when inserted. Contrast with general-subscriber-adapter. */
export function createMemoryAuthAdapter() {
  const users = new Map();
  const usersByEmail = new Map();
  const tokens = new Map();
  const domains = new Map();

  const key = (hash, type) => `${type}:${hash}`;

  return {
    users,
    async getUserById(id) { return users.get(id) ?? null; },
    async getUserByEmail(email) { return usersByEmail.get(email.toLowerCase()) ?? null; },
    async createUser(user) {
      const record = {
        id: `user_${users.size + 1}`,
        email: user.email.toLowerCase(),
        name: user.name ?? null,
        avatarUrl: user.avatarUrl ?? null,
        role: user.role ?? 10,
        emailVerified: user.emailVerified ?? false,
        disabled: false,
        data: user.data ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      users.set(record.id, record);
      usersByEmail.set(record.email, record);
      return record;
    },
    async updateUser() {},
    async deleteUser() {},
    async countUsers() { return users.size; },
    async getUsers() { return { items: [...users.values()] }; },
    async getUserWithDetails(id) {
      const user = users.get(id);
      return user ? { user, credentials: [], oauthAccounts: [], lastLogin: null } : null;
    },
    async countAdmins() { return 0; },
    async getCredentialById() { return null; },
    async getCredentialsByUserId() { return []; },
    async createCredential(credential) { return credential; },
    async updateCredentialCounter() {},
    async updateCredentialName() {},
    async deleteCredential() {},
    async countCredentialsByUserId() { return 0; },
    async createToken(token) { tokens.set(key(token.hash, token.type), { ...token, userId: token.userId ?? null, email: token.email ?? null, role: token.role ?? null, invitedBy: token.invitedBy ?? null, createdAt: new Date() }); },
    async getToken(hash, type) { return tokens.get(key(hash, type)) ?? null; },
    async consumeToken(hash, type) {
      const record = tokens.get(key(hash, type)) ?? null;
      if (record) tokens.delete(key(hash, type));
      return record;
    },
    async deleteToken(hash) {
      for (const id of tokens.keys()) if (id.endsWith(`:${hash}`) || id.includes(`:${hash}`) || id.endsWith(hash)) tokens.delete(id);
    },
    async deleteExpiredTokens() {},
    async getOAuthAccount() { return null; },
    async getOAuthAccountsByUserId() { return []; },
    async createOAuthAccount(account) { return account; },
    async deleteOAuthAccount() {},
    async getAllowedDomain(domain) { return domains.get(domain.toLowerCase()) ?? null; },
    async getAllowedDomains() { return [...domains.values()]; },
    async createAllowedDomain(domain, defaultRole) {
      const record = { domain: domain.toLowerCase(), defaultRole, enabled: true, createdAt: new Date() };
      domains.set(record.domain, record);
      return record;
    },
    async updateAllowedDomain(domain, enabled, defaultRole) {
      const record = domains.get(domain.toLowerCase());
      if (record) {
        record.enabled = enabled;
        if (defaultRole !== undefined) record.defaultRole = defaultRole;
      }
    },
    async deleteAllowedDomain(domain) { domains.delete(domain.toLowerCase()); },
  };
}
