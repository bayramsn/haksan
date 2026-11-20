import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authForgotPasswordResponseSchema,
  authLoginResponseSchema,
  authLogoutResponseSchema,
  authMeResponseSchema,
  authRefreshResponseSchema,
  authResetPasswordResponseSchema,
} from './auth-schemas.ts';

const thinUser = {
  id: 'user-1',
  email: 'user@example.com',
  fullName: 'Test User',
  tenantId: 'tenant-1',
  roles: ['sales'],
};

const fullMe = {
  user: {
    ...thinUser,
    departmentId: null,
    permissions: ['companies.read'],
    mfaEnabled: false,
    divisions: [{ id: 'division-1', code: 'TR', name: 'Türkiye', isPrimary: true }],
    departments: [{ id: 'department-1', code: 'SALES', name: 'Satış', isPrimary: true }],
    accessScopes: [{ resource: 'companies', departmentId: null, divisionId: 'division-1', isPrimary: true }],
    canViewAllDivisions: false,
  },
  tenant: {
    id: 'tenant-1',
    name: 'Tenant',
    slug: 'tenant',
    hiddenNavigationKeys: [],
  },
};

test('login yanıtı shared sözleşmeyle doğrulanır', () => {
  assert.deepEqual(
    authLoginResponseSchema.parse({ accessToken: 'access-token', user: thinUser }),
    { accessToken: 'access-token', user: thinUser }
  );
});

test('login ve iç kullanıcı nesnesindeki sözleşme driftini reddeder', () => {
  assert.equal(
    authLoginResponseSchema.safeParse({ accessToken: 'access-token', user: { ...thinUser, unexpected: true } }).success,
    false
  );
  assert.equal(
    authLoginResponseSchema.safeParse({ accessToken: 'access-token', user: thinUser, refreshToken: 'secret' }).success,
    false
  );
});

test('me yanıtı bütün RBAC ve scope alanlarını zorunlu tutar', () => {
  assert.equal(authMeResponseSchema.safeParse(fullMe).success, true);
  const { permissions: _permissions, ...userWithoutPermissions } = fullMe.user;
  assert.equal(authMeResponseSchema.safeParse({ ...fullMe, user: userWithoutPermissions }).success, false);
});

test('me iç nesnelerindeki bilinmeyen alanları reddeder', () => {
  const withDrift = {
    ...fullMe,
    user: {
      ...fullMe.user,
      divisions: [{ ...fullMe.user.divisions[0], unexpected: true }],
    },
  };
  assert.equal(authMeResponseSchema.safeParse(withDrift).success, false);
});

test('refresh hem cookie-yok hem yenilenmiş oturum biçimini doğrular', () => {
  assert.deepEqual(authRefreshResponseSchema.parse({ accessToken: null }), { accessToken: null });
  assert.equal(authRefreshResponseSchema.safeParse({ accessToken: 'access-token', user: thinUser }).success, true);
  assert.equal(authRefreshResponseSchema.safeParse({ accessToken: null, user: thinUser }).success, false);
});

test('forgot-password dev tokenını doğrular ama sonuçtan çıkarır', () => {
  const parsed = authForgotPasswordResponseSchema.parse({
    ok: true,
    devToken: 'abcdefghijklmnopqrstuvwxyz123456',
  });
  assert.deepEqual(parsed, { ok: true });
  assert.equal('devToken' in parsed, false);
});

test('ok yanıtları literal true ve exact sözleşme ister', () => {
  assert.deepEqual(authLogoutResponseSchema.parse({ ok: true }), { ok: true });
  assert.deepEqual(authResetPasswordResponseSchema.parse({ ok: true }), { ok: true });
  assert.equal(authLogoutResponseSchema.safeParse({ ok: false }).success, false);
  assert.equal(authResetPasswordResponseSchema.safeParse({ ok: true, debug: 'detail' }).success, false);
});
