import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TYPE_OPTIONS,
  activityTypeCodeFromLabel,
  activityTypeLabel,
} from './companyLookups';

describe('activity type catalog', () => {
  it('exposes the new call, meeting and visit activity types', () => {
    expect(ACTIVITY_TYPE_OPTIONS).toEqual([
      { code: 'incoming_call', label: 'Gelen Arama' },
      { code: 'outgoing_call', label: 'Giden Arama' },
      { code: 'customer_visit', label: 'Müşteri Ziyareti' },
      { code: 'online_meeting', label: 'Çevrimiçi Toplantı' },
      { code: 'showroom_meeting', label: 'Showroom Toplantısı' },
      { code: 'email', label: 'E-posta / Mail' },
      { code: 'whatsapp', label: 'WhatsApp' },
      { code: 'note', label: 'Yorum' },
    ]);
  });

  it('normalizes legacy activity labels without losing historical records', () => {
    expect(activityTypeCodeFromLabel('Telefon Görüşmesi')).toBe('outgoing_call');
    expect(activityTypeCodeFromLabel('Demo / Sunum')).toBe('customer_visit');
    expect(activityTypeCodeFromLabel('Toplantı')).toBe('showroom_meeting');
    expect(activityTypeLabel('online_meeting')).toBe('Çevrimiçi Toplantı');
  });
});
