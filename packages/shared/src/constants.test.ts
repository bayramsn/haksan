import { describe, expect, it } from 'vitest';
import {
  PIPELINE_STAGE_REQUIREMENTS,
  PIPELINE_STAGE_QUALIFICATION,
  QUALIFICATION_STAGE_ENTRY,
  QUALIFICATION_STAGE_PIPELINE_STEPS,
} from './constants';

describe('qualification pipeline ownership', () => {
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
  });
});
