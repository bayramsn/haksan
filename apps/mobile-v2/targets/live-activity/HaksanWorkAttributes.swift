import ActivityKit
import Foundation

/// Uygulama (modules/haksan-live-activity) ve widget hedefi aynı adlı tipi paylaşır;
/// ActivityKit etkinliği tip adıyla eşler. İki kopya birebir aynı tutulmalı.
@available(iOS 16.1, *)
public struct HaksanWorkAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// "running" ya da "paused".
    public var status: String
    /// Çalışırken sayacın etkin başlangıcı (geçen süre düşülmüş); widget kendisi saydırır.
    public var startedAt: Date
    /// Duraklatıldığında gösterilen sabit süre (saniye).
    public var elapsedSeconds: Int
  }

  public var workId: String
  /// "service" (saha servisi) ya da "visit" (müşteri ziyareti).
  public var kind: String
  public var title: String
  public var subtitle: String
  public var deepLink: String
}
