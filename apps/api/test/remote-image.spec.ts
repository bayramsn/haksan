import { describe, expect, it } from 'vitest';
import { fetchRemoteImage, inlineRemoteImages, isPublicAddress } from '../src/shared/pdf/remote-image';

// PDF'e gömülen dış ürün görselleri sunucudan çekilir; iç ağa (bulut meta-veri ucu dahil) gidilmemeli.
describe('remote-image', () => {
  it('iç ağ, loopback ve meta-veri adreslerini reddeder', () => {
    for (const [address, family] of [
      ['127.0.0.1', 4], ['10.1.2.3', 4], ['172.20.0.5', 4], ['192.168.1.1', 4], ['169.254.169.254', 4], ['100.64.0.1', 4], ['0.0.0.0', 4],
      ['::1', 6], ['fd00::1', 6], ['fe80::1', 6], ['::ffff:169.254.169.254', 6],
    ] as const) expect(isPublicAddress(address, family), address).toBe(false);
    expect(isPublicAddress('93.184.216.34', 4)).toBe(true);
    expect(isPublicAddress('2606:4700::1111', 6)).toBe(true);
  });

  it('https dışını, başka portu ve iç ağa çözülen adı çekmez', async () => {
    await expect(fetchRemoteImage('http://example.com/a.png')).resolves.toBeUndefined();
    await expect(fetchRemoteImage('https://example.com:8443/a.png')).resolves.toBeUndefined();
    await expect(fetchRemoteImage('https://169.254.169.254/latest/meta-data')).resolves.toBeUndefined();
    await expect(fetchRemoteImage('https://localhost/a.png')).resolves.toBeUndefined();
  });

  it('IP yazılmış iç ağ adresine hiç bağlanmaz (lookup çağrılmadığı için ayrı süzülür)', async () => {
    // Bağlantı denenseydi yönlendirilemeyen adres 8 sn zaman aşımını beklerdi.
    const started = Date.now();
    await expect(fetchRemoteImage('https://10.255.255.1/a.png')).resolves.toBeUndefined();
    await expect(fetchRemoteImage('https://[fd00::1]/a.png')).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('alınamayan görseli olduğu gibi bırakır', async () => {
    const html = '<img src="https://127.0.0.1/x.png"><img src="data:image/png;base64,AA==">';
    await expect(inlineRemoteImages(html)).resolves.toBe(html);
  });
});
