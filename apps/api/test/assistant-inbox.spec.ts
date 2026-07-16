import { describe, expect, it } from 'vitest';
import { AssistantInboxService } from '../src/modules/assistant/assistant-inbox.service';

function privateService() {
  return new AssistantInboxService({} as never, {} as never, {} as never) as never as {
    classify: (value: string) => { category: string; priority: string; confidence: number };
    buildDraftReply: (input: Record<string, unknown>, category: string) => string;
    cleanSubject: (value: string) => string;
  };
}

describe('Assistant unified inbox', () => {
  it('acil servis mesajını kritik olarak sınıflandırır', () => {
    expect(privateService().classify('ACİL: üretim durdu, CNC çalışmıyor ve teknik servis gerekli')).toEqual({
      category: 'service',
      priority: 'critical',
      confidence: 82,
    });
  });

  it('finans mesajına güvenli ve gönderilmemiş yanıt taslağı üretir', () => {
    const draft = privateService().buildDraftReply(
      { channel: 'email', senderName: 'Ayşe Hanım', body: 'Vadesi gelen fatura hakkında bilgi rica ederiz.' },
      'finance'
    );
    expect(draft).toContain('Merhaba Ayşe Hanım');
    expect(draft).toContain('Finansal bildiriminizi aldık');
    expect(draft).not.toContain('<script');
  });

  it('e-posta başlığındaki satır sonlarını temizler', () => {
    expect(privateService().cleanSubject('Teklif\r\nBcc: attacker@example.com')).toBe('Teklif Bcc: attacker@example.com');
  });
});
