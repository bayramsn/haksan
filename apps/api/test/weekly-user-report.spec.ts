import { describe, expect, it } from 'vitest';
import { formatUserReport, userReportMailTargets } from '../src/modules/automation/automation.service';

describe('Weekly user report', () => {
  const period = { from: new Date('2026-08-24T00:00:00'), to: new Date('2026-08-31T00:00:00') };

  it('formats per-user performance and the account audit', () => {
    const report = formatUserReport(
      [
        { name: 'Ayşe Demir', activities: 13, quotes: 3, opportunities: 2, won: 1, total: 19, previousTotal: 12 },
        { name: 'Mehmet Kaya', activities: 1, quotes: 0, opportunities: 0, won: 0, total: 1, previousTotal: 1 },
      ],
      {
        activeCount: 12,
        newUsers: [{ name: 'Yeni Kullanıcı', email: 'yeni@haksan.com' }],
        dormantUsers: [
          { name: 'Uykuda Kişi', lastLoginAt: new Date('2026-06-01T09:00:00') },
          { name: 'Hiç Girmeyen', lastLoginAt: null },
        ],
        blockedUsers: [{ name: 'Pasif Kişi', reason: 'durum: inactive' }],
      },
      period,
    );

    // Dönem sonu dışa açık sınırın bir gün öncesi olmalı (pazar).
    expect(report).toContain('Dönem: 24.08.2026 – 30.08.2026');
    expect(report).toContain('Ayşe Demir: 19 kayıt (geçen haftaya göre +7)');
    expect(report).toContain('13 aktivite, 3 teklif, 2 fırsat, 1 kazanılan');
    expect(report).toContain('Mehmet Kaya: 1 kayıt (geçen haftayla aynı)');
    expect(report).toContain('12 aktif hesap');
    expect(report).toContain('Yeni Kullanıcı (yeni@haksan.com)');
    expect(report).toContain('Hiç Girmeyen (hiç giriş yapmamış)');
    expect(report).toContain('Uykuda Kişi (son giriş 01.06.2026)');
    expect(report).toContain('Pasif Kişi (durum: inactive)');
  });

  it('says so plainly when there is nothing to report', () => {
    const report = formatUserReport(
      [],
      { activeCount: 3, newUsers: [], dormantUsers: [], blockedUsers: [] },
      period,
    );

    expect(report).toContain('Bu hafta hiçbir kullanıcının kaydı yok.');
    expect(report).toContain('Bu hafta yeni hesap açılmadı');
    expect(report).toContain('30+ gündür giriş yapmayan hesap yok');
    expect(report).toContain('Pasif veya kilitli hesap yok');
  });

  it('falls back to the super admins when no recipient is configured', () => {
    const admins = [{ email: 'sa1@haksan.local' }, { email: 'sa2@haksan.local' }];

    expect(userReportMailTargets([], admins)).toEqual(['sa1@haksan.local', 'sa2@haksan.local']);
    expect(userReportMailTargets(null, admins)).toEqual(['sa1@haksan.local', 'sa2@haksan.local']);
    // Yalnız boşluktan ibaret girdi "yapılandırılmış liste" sayılmamalı; sayılsaydı
    // rapor hiç kimseye gitmez ve bu sessizce olurdu.
    expect(userReportMailTargets(['  '], admins)).toEqual(['sa1@haksan.local', 'sa2@haksan.local']);
  });

  it('still resolves the configured list when the tenant has no super admin', () => {
    // Alıcı listesinin varlık sebebi bu: süper admin olmayan biri de raporu alsın.
    // Süper admin kalmadığında liste yine de geçerli olmalı, aksi halde özellik
    // en çok gerektiği anda sessizce kapanır.
    expect(userReportMailTargets(['bt@firma.com'], [])).toEqual(['bt@firma.com']);
    expect(userReportMailTargets([], [])).toEqual([]);
  });

  it('ignores non-string entries coming from a hand-edited jsonb column', () => {
    const admins = [{ email: 'sa1@haksan.local' }];
    // Kolonun CHECK'i yalnız "dizi" diyor; bozuk eleman tüm cron döngüsünü
    // düşürmemeli.
    expect(userReportMailTargets([null as never, 42 as never, 'BT@Firma.com'], admins)).toEqual([
      'bt@firma.com',
    ]);
  });

  it('uses the configured list instead of the super admins', () => {
    const admins = [{ email: 'sa1@haksan.local' }];

    expect(userReportMailTargets([' BT@firma.com ', 'bt@firma.com', 'Mudur@firma.com'], admins)).toEqual([
      'bt@firma.com',
      'mudur@firma.com',
    ]);
  });
});
