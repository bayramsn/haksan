import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStatusMutationSchema } from '@haksan/shared';

const operationId = '11111111-1111-4111-8111-111111111111';

test('çevrimdışı firma durumu dar enum ve UUID operationId ister', () => {
  assert.equal(companyStatusMutationSchema.safeParse({ customerStatusCode: 'active', operationId }).success, true);
  assert.equal(companyStatusMutationSchema.safeParse({ customerStatusCode: 'deleted', operationId }).success, false);
  assert.equal(companyStatusMutationSchema.safeParse({ customerStatusCode: 'active', operationId: 'same-request' }).success, false);
});

test('genel firma alanları durum replay sözleşmesine taşınmaz', () => {
  const parsed = companyStatusMutationSchema.parse({
    customerStatusCode: 'passive',
    operationId,
    taxNumber: 'saklanmamali',
  });
  assert.deepEqual(parsed, { customerStatusCode: 'passive', operationId });
});
