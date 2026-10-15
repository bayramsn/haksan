/**
 * Sunucunun hata zarfından kullanıcıya gösterilecek mesajı çıkarır.
 *
 * Zarf İÇ İÇE: `{ error: { code, message, details, requestId } }`
 * (apps/api all-exceptions.filter). Düz `body.message` okumak her hatayı genel
 * metne düşürüyordu — hatalı parola bile "oturumunuz sona erdi" görünüyordu.
 *
 * Yerel modül bağımlılığı yok; bu yüzden `node --test` ile doğrudan test edilebiliyor
 * (client.ts expo-secure-store çektiği için orada kalamazdı).
 */
export function serverMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const nested = (body as { error?: { message?: unknown } }).error?.message;
  if (typeof nested === 'string' && nested) return nested;
  // Eski/farklı bir gövde ihtimaline karşı düz alan da kabul edilir.
  const flat = (body as { message?: unknown }).message;
  return typeof flat === 'string' && flat ? flat : null;
}
