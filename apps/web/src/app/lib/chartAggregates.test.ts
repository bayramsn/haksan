import { describe, expect, it } from 'vitest';
import { buildQualificationStageSummary, DASHBOARD_QUALIFICATION_STAGES } from './chartAggregates';

describe('dashboard qualification summary', () => {
  it('uses the C → WIN flow and excludes lead/lost cards', () => {
    const rows = buildQualificationStageSummary([
      { qualificationStage: 'lead' },
      { qualificationStage: 'c' },
      { qualificationStage: 'b' },
      { qualificationStage: 'b' },
      { qualificationStage: 'a' },
      { qualificationStage: 'a_plus' },
      { qualificationStage: 'win' },
      { qualificationStage: 'lost' },
    ]);

    expect(DASHBOARD_QUALIFICATION_STAGES).toEqual(['c', 'b', 'a', 'a_plus', 'win']);
    expect(rows).toEqual([
      { stage: 'c', count: 1 },
      { stage: 'b', count: 2 },
      { stage: 'a', count: 1 },
      { stage: 'a_plus', count: 1 },
      { stage: 'win', count: 1 },
    ]);
  });
});
