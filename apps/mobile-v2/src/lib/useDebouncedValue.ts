import { useEffect, useState } from 'react';

/**
 * Arama kutusundaki her tuşu ayrı bir API çağrısına dönüştürmez. Sunucudaki
 * genel rate-limit ile uyumlu, ekranlar arasında tek ve öngörülebilir gecikme.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}
