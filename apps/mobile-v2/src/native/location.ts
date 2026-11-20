import * as Location from 'expo-location';

/**
 * Yalnız uygulama açıkken alınan anlık konum. İzin verilmezse kullanıcıya
 * gösterilecek Türkçe mesajla hata fırlatır; arka plan konumu istenmez.
 */
export async function currentPosition(reason: string): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error(`Konum izni gerekli. ${reason}`);
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
