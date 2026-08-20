import { describe, expect, it } from 'vitest';
import {
  assertSafeCompanyWebsiteUrl,
  companyNameCoverage,
  extractCompanyWebsiteFacts,
  isPublicNetworkAddress,
} from '../src/modules/companies/company-website-lookup';

describe('company website lookup security', () => {
  it('rejects non-HTTPS and local hostnames before fetching', async () => {
    await expect(assertSafeCompanyWebsiteUrl('http://example.com')).rejects.toMatchObject({ code: 'COMPANY_WEBSITE_LOOKUP_FAILED' });
    await expect(assertSafeCompanyWebsiteUrl('https://localhost')).rejects.toMatchObject({ code: 'COMPANY_WEBSITE_LOOKUP_FAILED' });
    await expect(assertSafeCompanyWebsiteUrl('https://8.8.8.8')).rejects.toMatchObject({ code: 'COMPANY_WEBSITE_LOOKUP_FAILED' });
  });

  it('blocks loopback, private, link-local and documentation networks', () => {
    expect(isPublicNetworkAddress('127.0.0.1')).toBe(false);
    expect(isPublicNetworkAddress('10.20.30.40')).toBe(false);
    expect(isPublicNetworkAddress('169.254.169.254')).toBe(false);
    expect(isPublicNetworkAddress('192.168.1.4')).toBe(false);
    expect(isPublicNetworkAddress('203.0.113.10')).toBe(false);
    expect(isPublicNetworkAddress('::1')).toBe(false);
    expect(isPublicNetworkAddress('fd00::1')).toBe(false);
  });

  it('allows public unicast addresses', () => {
    expect(isPublicNetworkAddress('8.8.8.8')).toBe(true);
    expect(isPublicNetworkAddress('2606:4700:4700::1111')).toBe(true);
  });
});

describe('company website fact extraction', () => {
  it('reads Organization JSON-LD without executing site scripts', () => {
    const facts = extractCompanyWebsiteFacts({
      url: 'https://www.aytav.example/contact',
      html: `
        <html><head><title>AYTAV Tavukçuluk Ekipmanları</title></head><body>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "AYTAV Tavukçuluk Ekipmanları",
              "telephone": "+90 212 682 00 15",
              "email": "info@aytav.example",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Tekstilkent Cad. Koza Plaza A Blok Kat 10",
                "addressLocality": "Esenler",
                "addressRegion": "İstanbul",
                "postalCode": "34235",
                "addressCountry": "Türkiye"
              },
              "geo": { "@type": "GeoCoordinates", "latitude": 41.0685657, "longitude": 28.8646868 }
            }
          </script>
        </body></html>`,
    });

    expect(facts.structured).toBe(true);
    expect(facts.siteName).toBe('AYTAV Tavukçuluk Ekipmanları');
    expect(facts.address).toContain('Koza Plaza');
    expect(facts.city).toBe('İstanbul');
    expect(facts.district).toBe('Esenler');
    expect(facts.phone).toBe('+90 212 682 00 15');
    expect(facts.email).toBe('info@aytav.example');
    expect(facts.latitude).toBe(41.0685657);
    expect(facts.longitude).toBe(28.8646868);
  });

  it('falls back to visible contact text and scores meaningful name tokens', () => {
    const facts = extractCompanyWebsiteFacts({
      url: 'https://www.akdag.example/iletisim',
      html: '<title>Akdağ Makina Kalıp</title><p>Adres: Maltepe Mah. Gümüşsuyu Cad. No:32/120</p><p>info@akdag.example</p>',
    });

    expect(facts.address).toContain('Gümüşsuyu');
    expect(facts.email).toBe('info@akdag.example');
    expect(companyNameCoverage('AKDAĞ KALIP VE YED.PAR.SAN.DIŞ.TİC.LTD.ŞTİ', 'Akdağ Kalıp iletişim')).toBeGreaterThan(0.4);
  });
});
