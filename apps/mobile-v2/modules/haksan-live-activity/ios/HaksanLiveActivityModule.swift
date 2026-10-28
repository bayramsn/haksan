import ExpoModulesCore
import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// JS → Live Activity köprüsü. Etkinliği yalnız uygulama başlatır/günceller/bitirir;
/// sayaç widget'ta `Text(timerInterval:)` ile kendiliğinden işlediği için push gerekmez.
public class HaksanLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("HaksanLiveActivity")

    AsyncFunction("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) { return ActivityAuthorizationInfo().areActivitiesEnabled }
      return false
    }

    AsyncFunction("syncWork") { (payload: WorkPayload) async throws in
      if #available(iOS 16.2, *) { try await LiveWork.sync(payload) }
    }

    AsyncFunction("endWork") { (workId: String) async in
      if #available(iOS 16.2, *) { await LiveWork.end { $0 == workId } }
    }

    AsyncFunction("endAll") { () async in
      if #available(iOS 16.2, *) { await LiveWork.end { _ in true } }
    }
  }
}

struct WorkPayload: Record {
  @Field var workId: String = ""
  @Field var kind: String = "service"
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var deepLink: String = ""
  @Field var status: String = "running"
  /// Etkin başlangıç (epoch ms).
  @Field var startedAt: Double = 0
  @Field var elapsedSeconds: Double = 0
}

@available(iOS 16.2, *)
enum LiveWork {
  static func sync(_ payload: WorkPayload) async throws {
    let state = HaksanWorkAttributes.ContentState(
      status: payload.status,
      startedAt: Date(timeIntervalSince1970: payload.startedAt / 1000),
      elapsedSeconds: max(0, Int(payload.elapsedSeconds))
    )
    let content = ActivityContent(state: state, staleDate: nil)
    if let existing = Activity<HaksanWorkAttributes>.activities.first(where: { $0.attributes.workId == payload.workId }) {
      await existing.update(content)
      return
    }
    // Kullanıcı Ayarlar'dan Canlı Etkinlikleri kapattıysa sessizce geç.
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    let attributes = HaksanWorkAttributes(
      workId: payload.workId,
      kind: payload.kind,
      title: payload.title,
      subtitle: payload.subtitle,
      deepLink: payload.deepLink
    )
    _ = try Activity.request(attributes: attributes, content: content, pushType: nil)
  }

  static func end(where matches: (String) -> Bool) async {
    for activity in Activity<HaksanWorkAttributes>.activities where matches(activity.attributes.workId) {
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}
