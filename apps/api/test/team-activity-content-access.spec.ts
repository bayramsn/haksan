import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../src/shared/security/auth.types';
import { canExposeTeamActivityContent } from '../src/modules/reports/reports.service';

const actor = (patch: Partial<AuthContext> = {}): AuthContext => ({
  userId: 'user-1',
  tenantId: 'tenant-1',
  email: 'user@example.com',
  roles: ['sales'],
  permissions: new Set(['reports.read', 'companies.read', 'activities.read']),
  divisionIds: ['division-1'],
  primaryDivisionId: 'division-1',
  departmentIds: [],
  primaryDepartmentId: null,
  canViewAllDivisions: false,
  activeDivisionId: null,
  activeDepartmentId: null,
  accessScopes: [],
  ...patch,
});

describe('team activity content access', () => {
  it('kaynak modül izni yoksa içeriği kapatır', () => {
    expect(
      canExposeTeamActivityContent(actor(), 'quotes.read', 'quotes', 'division-1', true, 'company-1'),
    ).toBe(false);
  });

  it('kaynak bölüm kapsamı dışındaysa içeriği kapatır', () => {
    expect(
      canExposeTeamActivityContent(actor(), 'activities.read', 'activities', 'division-2', true, 'company-1'),
    ).toBe(false);
  });

  it('bağlı firma görünmüyorsa içeriği kapatır', () => {
    expect(
      canExposeTeamActivityContent(actor(), 'activities.read', 'activities', 'division-1', true, null),
    ).toBe(false);
  });

  it('izin, bölüm ve firma görünürlüğü uygunsa içeriği açar', () => {
    expect(
      canExposeTeamActivityContent(actor(), 'activities.read', 'activities', 'division-1', true, 'company-1'),
    ).toBe(true);
  });

  it('firmaya bağlanmamış kaydı kaynak izni ve bölüm kapsamında açar', () => {
    expect(
      canExposeTeamActivityContent(actor(), 'activities.read', 'activities', 'division-1', false, null),
    ).toBe(true);
  });
});
