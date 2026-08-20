import { describe, expect, it } from 'vitest';
import {
  PIPELINE_STAGE_FLOW,
  PIPELINE_STAGE_REQUIREMENTS,
  PIPELINE_STAGE_QUALIFICATION,
  QUALIFICATION_STAGE_ENTRY,
  QUALIFICATION_STAGE_PIPELINE_STEPS,
  STAGE_TRANSITIONS,
} from './constants';

describe('qualification pipeline ownership', () => {
  it('starts the opportunity flow at lead and lets it move on to sales/C', () => {
    expect(PIPELINE_STAGE_FLOW[0]).toBe('lead');
    expect(PIPELINE_STAGE_FLOW[1]).toBe('sales');
    // Operasyon ekseninde lead'e GERİ dönülmez; kartlar orada doğar.
    expect(STAGE_TRANSITIONS.lead).toEqual([]);
    expect(STAGE_TRANSITIONS.sales).toEqual(['lead']);
    expect(QUALIFICATION_STAGE_ENTRY.lead).toEqual({ stage: 'lead', gated: false });
  });

  it('places quote creation in the B process', () => {
    expect(PIPELINE_STAGE_QUALIFICATION.quote).toBe('b');
    expect(QUALIFICATION_STAGE_PIPELINE_STEPS.b).toContain('quote');
    expect(QUALIFICATION_STAGE_PIPELINE_STEPS.a).not.toContain('quote');
  });

  it('uses the completed quote step as the gated boundary for entering A', () => {
    expect(QUALIFICATION_STAGE_ENTRY.a).toEqual({ stage: 'quote', gated: true });
  });

  it('lets A+ enter the invoice work area before the invoice exists and gates it at WIN', () => {
    expect(QUALIFICATION_STAGE_ENTRY.a_plus).toEqual({ stage: 'commercial_invoice', gated: true });
    expect(PIPELINE_STAGE_REQUIREMENTS.commercial_invoice.requires).not.toMatch(/fatura/i);
    expect(PIPELINE_STAGE_REQUIREMENTS.delivered.requires).toMatch(/Ticari fatura/i);
    expect(PIPELINE_STAGE_QUALIFICATION.commercial_invoice).toBe('a_plus');
    expect(PIPELINE_STAGE_QUALIFICATION.delivered).toBe('win');
    // Peşin/leasing planı atlar; vadeli akış ödeme planı üzerinden devam eder.
    expect(STAGE_TRANSITIONS.commercial_invoice).toEqual(['contract', 'payment_plan']);
  });
});
