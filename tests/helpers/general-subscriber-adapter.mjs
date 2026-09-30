/**
 * Custom AuthAdapter for local proof only.
 * Implements the exported @emdash-cms/auth AuthAdapter contract.
 * getAllowedDomain synthesizes general SUBSCRIBER signup and does not insert domain rows.
 */
import { Role } from '@emdash-cms/auth';

export function createGeneralSubscriberAdapter() {
  const users = new Map();
  const usersByEmail = new Map();
  const tokens = new Map();
  const key = (hash, type) => `${type}:${hash}`;

  return {
    users,
    allowedDomainRowCount() {
      return 0;
    },
    async getUserById(id) {
      return users.get(id) ?? null;
    },
    async getUserByEmail(email) {
      return usersByEmail.get(email.toLowerCase()) ?? null;
    },
    async createUser(user) {
      const record = {
        id: `user_${users.size + 1}`,
        email: user.email.toLowerCase(),
        name: user.name ?? null,
        avatarUrl: user.avatarUrl ?? null,
        role: user.role ?? Role.SUBSCRIBER,
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
    async updateUser(id, data) {
      const user = users.get(id);
      if (!user) return;
      Object.assign(user, data, { updatedAt: new Date() });
    },
    async deleteUser() {},
    async countUsers() {
      return users.size;
    },
    async getUsers() {
      return { items: [...users.values()] };
    },
    async getUserWithDetails(id) {
      const user = users.get(id);
      return user ? { user, credentials: [], oauthAccounts: [], lastLogin: null } : null;
    },
    async countAdmins() {
      return [...users.values()].filter(user => user.role >= Role.ADMIN).length;
    },
    async getCredentialById() {
      return null;
    },
    async getCredentialsByUserId() {
      return [];
    },
    async createCredential(credential) {
      return credential;
    },
    async updateCredentialCounter() {},
    async updateCredentialName() {},
    async deleteCredential() {},
    async countCredentialsByUserId() {
      return 0;
    },
    async createToken(token) {
      tokens.set(key(token.hash, token.type), {
        ...token,
        userId: token.userId ?? null,
        email: token.email ?? null,
        role: token.role ?? null,
        invitedBy: token.invitedBy ?? null,
        createdAt: new Date(),
      });
    },
    async getToken(hash, type) {
      return tokens.get(key(hash, type)) ?? null;
    },
    async consumeToken(hash, type) {
      const record = tokens.get(key(hash, type)) ?? null;
      if (record) tokens.delete(key(hash, type));
      return record;
    },
    async deleteToken(hash) {
      for (const id of tokens.keys()) {
        if (id.endsWith(`:${hash}`) || id.includes(`:${hash}`)) tokens.delete(id);
      }
    },
    async deleteExpiredTokens() {},
    async getOAuthAccount() {
      return null;
    },
    async getOAuthAccountsByUserId() {
      return [];
    },
    async createOAuthAccount(account) {
      return account;
    },
    async deleteOAuthAccount() {},
    async getAllowedDomain(domain) {
      const cleaned = String(domain ?? '').trim().toLowerCase();
      if (!cleaned || cleaned.includes(' ') || !cleaned.includes('.')) return null;
      return {
        domain: cleaned,
        defaultRole: Role.SUBSCRIBER,
        enabled: true,
        createdAt: new Date(0),
      };
    },
    async getAllowedDomains() {
      return [];
    },
    async createAllowedDomain() {
      throw new Error('domain_rows_not_used');
    },
    async updateAllowedDomain() {
      throw new Error('domain_rows_not_used');
    },
    async deleteAllowedDomain() {
      throw new Error('domain_rows_not_used');
    },
  };
}
