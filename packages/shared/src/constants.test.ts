import { describe, expect, it } from 'vitest';
import {
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
});
