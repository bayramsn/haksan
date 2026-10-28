import ActivityKit
import SwiftUI
import WidgetKit

@main
struct HaksanWidgets: WidgetBundle {
  var body: some Widget {
    HaksanWorkLiveActivity()
  }
}

private let navy = Color(red: 0.0, green: 0.05, blue: 0.40)
private let accent = Color(red: 0.86, green: 0.15, blue: 0.15)

private func icon(_ kind: String) -> String {
  kind == "visit" ? "mappin.and.ellipse" : "wrench.and.screwdriver.fill"
}

private func kindLabel(_ kind: String) -> String {
  kind == "visit" ? "Ziyaret" : "Saha servisi"
}

/// Çalışırken sistem saati kendisi sayar (güncelleme gerekmez); duraklatılınca sabit süre.
struct ElapsedText: View {
  let state: HaksanWorkAttributes.ContentState

  var body: some View {
    if state.status == "running" {
      Text(timerInterval: state.startedAt...Date.distantFuture, countsDown: false)
        .monospacedDigit()
    } else {
      Text(Self.format(state.elapsedSeconds)).monospacedDigit()
    }
  }

  static func format(_ seconds: Int) -> String {
    String(format: "%d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60)
  }
}

struct HaksanWorkLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: HaksanWorkAttributes.self) { context in
      // Kilit ekranı / bildirim merkezi
      HStack(spacing: 12) {
        Image(systemName: icon(context.attributes.kind))
          .font(.title3)
          .foregroundStyle(.white)
          .frame(width: 40, height: 40)
          .background(accent, in: RoundedRectangle(cornerRadius: 10))
        VStack(alignment: .leading, spacing: 2) {
          Text(context.attributes.title).font(.headline).foregroundStyle(.white).lineLimit(1)
          Text(context.attributes.subtitle).font(.subheadline).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
        }
        Spacer(minLength: 8)
        VStack(alignment: .trailing, spacing: 2) {
          ElapsedText(state: context.state).font(.title2.weight(.semibold)).foregroundStyle(.white)
          Text(context.state.status == "running" ? kindLabel(context.attributes.kind) : "Beklemede")
            .font(.caption2).foregroundStyle(.white.opacity(0.7))
        }
      }
      .padding(16)
      .activityBackgroundTint(navy)
      .activitySystemActionForegroundColor(.white)
      .widgetURL(URL(string: context.attributes.deepLink))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(kindLabel(context.attributes.kind), systemImage: icon(context.attributes.kind))
            .font(.caption)
            .foregroundStyle(.white.opacity(0.8))
        }
        DynamicIslandExpandedRegion(.trailing) {
          ElapsedText(state: context.state).font(.title3.weight(.semibold))
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title).font(.headline).lineLimit(1)
            Text(context.state.status == "running" ? context.attributes.subtitle : "\(context.attributes.subtitle) · Beklemede")
              .font(.caption).foregroundStyle(.secondary).lineLimit(1)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
      } compactLeading: {
        Image(systemName: icon(context.attributes.kind)).foregroundStyle(accent)
      } compactTrailing: {
        ElapsedText(state: context.state).frame(maxWidth: 56).font(.caption.weight(.semibold))
      } minimal: {
        Image(systemName: context.state.status == "running" ? icon(context.attributes.kind) : "pause.fill")
          .foregroundStyle(accent)
      }
      .widgetURL(URL(string: context.attributes.deepLink))
      .keylineTint(accent)
    }
  }
}
