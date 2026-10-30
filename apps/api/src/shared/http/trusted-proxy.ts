import { BlockList, isIP } from 'node:net';

// The API is exposed only inside the Docker bridge behind Nginx. Validate
// the peer address as well as the configured hop limit before trusting headers.
const proxyNetworks = new BlockList();
proxyNetworks.addSubnet('127.0.0.0', 8, 'ipv4');
proxyNetworks.addSubnet('10.0.0.0', 8, 'ipv4');
proxyNetworks.addSubnet('172.16.0.0', 12, 'ipv4');
proxyNetworks.addSubnet('192.168.0.0', 16, 'ipv4');
proxyNetworks.addAddress('::1', 'ipv6');
proxyNetworks.addSubnet('fc00::', 7, 'ipv6');

export function createTrustedProxy(maxHops: number) {
  return (address: string, hop: number): boolean => {
    if (hop >= maxHops) return false;
    const family = isIP(address);
    if (!family) return false;
    return proxyNetworks.check(address, family === 4 ? 'ipv4' : 'ipv6');
  };
}
