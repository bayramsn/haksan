import { describe, expect, it } from 'vitest';
import { buildOsmSearchCandidates, osmCountryCodeFilter, scoreOsmResult } from '../src/modules/companies/companies.service';

describe('OSM company search candidates', () => {
  it('falls back to Turkish district and city when a company POI is not mapped', () => {
    const candidates = buildOsmSearchCandidates({
      q: 'AKDAĞ KALIP VE YED.PAR.SAN.DIŞ.TİC.LTD.ŞTİ',
      district: 'Zeytinburnu',
      city: 'İstanbul',
      country: 'Türkiye',
    });

    expect(candidates).toContain('Zeytinburnu, İstanbul, Türkiye');
    expect(candidates).toContain('İstanbul, Türkiye');
    expect(candidates.length).toBeLessThanOrEqual(6);
    expect(osmCountryCodeFilter('Türkiye')).toBe('tr');
  });

  it('does not force the Turkey filter for foreign company addresses', () => {
    const candidates = buildOsmSearchCandidates({
      q: 'LK MACHINERY CORP.',
      district: 'Xitun District',
      city: 'Taichung',
      country: 'Taiwan',
    });

    expect(candidates).toContain('Xitun District, Taichung, Taiwan');
    expect(candidates).toContain('Taichung, Taiwan');
    expect(osmCountryCodeFilter('Taiwan')).toBeNull();
  });

  it('gives a stronger approximate score when both province and district match', () => {
    const match = scoreOsmResult(
      {
        q: 'AYTAV TAVUKÇULUK EKİPMANLARI',
        address: 'Oruç Reis Mah. Tekstilkent Cad. Koza Plaza A Blok No:12',
        district: 'Esenler',
        city: 'İstanbul',
        country: 'Türkiye',
      },
      {
        displayName: 'Esenler, İstanbul, Türkiye',
        type: 'administrative',
        category: 'boundary',
        address: { town: 'Esenler', province: 'İstanbul', country: 'Türkiye', country_code: 'tr' },
      },
    );

    expect(match.eligible).toBe(true);
    expect(match.matchQuality).toBe('area');
    expect(match.matchScore).toBe(75);
    expect(match.matchReason).toContain('İl ve ilçe eşleşti');
  });

  it('keeps a city-only administrative fallback below a province-and-district match', () => {
    const match = scoreOsmResult(
      {
        q: 'AYTAV TAVUKÇULUK EKİPMANLARI',
        city: 'İstanbul',
        country: 'Türkiye',
      },
      {
        displayName: 'İstanbul, Türkiye',
        type: 'administrative',
        category: 'boundary',
        address: { province: 'İstanbul', country: 'Türkiye', country_code: 'tr' },
      },
    );

    expect(match.eligible).toBe(true);
    expect(match.matchQuality).toBe('area');
    expect(match.matchScore).toBe(45);
    expect(match.matchReason).toContain('şehir merkezi');
  });

  it('recognizes municipality suffixes in structured district fields', () => {
    const match = scoreOsmResult(
      {
        q: 'ÖRNEK MAKİNA',
        district: 'Şehitkamil',
        city: 'Gaziantep',
        country: 'Türkiye',
      },
      {
        displayName: 'Şehitkamil, Gaziantep, Türkiye',
        type: 'administrative',
        category: 'boundary',
        address: {
          municipality: 'Şehitkamil Belediyesi',
          province: 'Gaziantep',
          country: 'Türkiye',
          country_code: 'tr',
        },
      },
    );

    expect(match.eligible).toBe(true);
    expect(match.matchQuality).toBe('area');
    expect(match.matchScore).toBe(75);
  });

  it('accepts a named company POI in the requested district as an exact match', () => {
    const match = scoreOsmResult(
      {
        q: 'AKDAĞ MAKİNA KALIP',
        address: 'Gümüşsuyu Cad. Emintaş Sanayi Sitesi No:32/120',
        district: 'Zeytinburnu',
        city: 'İstanbul',
        country: 'Türkiye',
      },
      {
        displayName: 'Akdağ Makina Kalıp, Gümüşsuyu Caddesi, Zeytinburnu, İstanbul, Türkiye',
        type: 'company',
        category: 'office',
        address: {
          office: 'Akdağ Makina Kalıp',
          road: 'Gümüşsuyu Caddesi',
          town: 'Zeytinburnu',
          province: 'İstanbul',
          country: 'Türkiye',
          country_code: 'tr',
        },
      },
    );

    expect(match.eligible).toBe(true);
    expect(match.matchQuality).toBe('exact');
    expect(match.matchScore).toBeGreaterThanOrEqual(80);
  });

  it('rejects results from a different city', () => {
    const match = scoreOsmResult(
      { q: 'AYTAV', district: 'Esenler', city: 'İstanbul', country: 'Türkiye' },
      {
        displayName: 'AYTAV, İzmir, Türkiye',
        type: 'company',
        category: 'office',
        address: { province: 'İzmir', country: 'Türkiye', country_code: 'tr' },
      },
    );

    expect(match.eligible).toBe(false);
  });
});
