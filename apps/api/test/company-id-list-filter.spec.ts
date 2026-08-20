import { describe, expect, it } from 'vitest';
import { companyListRequestQuerySchema } from '@haksan/shared';

const companyId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('company list ids filter', () => {
  it('virgülle gelen kimlik listesini kırpıp diziye çevirir', () => {
    const result = companyListRequestQuerySchema.safeParse({
      ids: ` ${companyId(1)} , ${companyId(2)} ,`,
    });
    expect(result.success && result.data.ids).toEqual([companyId(1), companyId(2)]);
  });

  it('kimlik gönderilmeyen istekleri olduğu gibi bırakır', () => {
    const result = companyListRequestQuerySchema.safeParse({ page: 1 });
    expect(result.success && result.data.ids).toBeUndefined();
  });

  it('geçersiz kimliği ve 100 üstü toplu isteği reddeder', () => {
    expect(companyListRequestQuerySchema.safeParse({ ids: 'not-a-uuid' }).success).toBe(false);
    const overflow = Array.from({ length: 101 }, (_, index) => companyId(index + 1)).join(',');
    expect(companyListRequestQuerySchema.safeParse({ ids: overflow }).success).toBe(false);
  });
});
