import { describe, expect, it } from 'vitest';
import { loginSchema, resolveLoginIdentifier, userCreateSchema } from '../index';

describe('username authentication schemas', () => {
  it('accepts a username as the login identifier', () => {
    const parsed = loginSchema.parse({ identifier: 'RaifSenturk', password: 'correct-horse' });
    expect(resolveLoginIdentifier(parsed)).toBe('RaifSenturk');
  });

  it('keeps legacy email payloads compatible during client rollout', () => {
    const parsed = loginSchema.parse({ email: 'user@example.com', password: 'correct-horse' });
    expect(resolveLoginIdentifier(parsed)).toBe('user@example.com');
  });

  it('requires both email and username when an admin creates a user', () => {
    expect(() => userCreateSchema.parse({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'correct-horse',
    })).toThrow();
  });
});
