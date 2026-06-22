import BackgroundTasks
import EventKit
import React
import UIKit

@objc(HaksanCalendar)
final class HaksanCalendar: RCTEventEmitter {
  private let store = EKEventStore()
  private let formatter = ISO8601DateFormatter()
  private var observing = false

  override init() {
    super.init()
    NotificationCenter.default.addObserver(self, selector: #selector(backgroundSync), name: Notification.Name("HaksanCalendarBackgroundSync"), object: nil)
  }

  override static func requiresMainQueueSetup() -> Bool { false }
  override func supportedEvents() -> [String]! { ["calendarBackgroundSync"] }
  override func startObserving() { observing = true }
  override func stopObserving() { observing = false }

  @objc private func backgroundSync() {
    if observing { sendEvent(withName: "calendarBackgroundSync", body: nil) }
  }

  @objc(requestAccess:rejecter:)
  func requestAccess(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 17.0, *) {
      store.requestFullAccessToEvents { granted, error in self.finishAccess(granted, error, resolve, reject) }
    } else {
      store.requestAccess(to: .event) { granted, error in self.finishAccess(granted, error, resolve, reject) }
    }
  }

  private func finishAccess(_ granted: Bool, _ error: Error?, _ resolve: RCTPromiseResolveBlock, _ reject: RCTPromiseRejectBlock) {
    if let error { reject("CALENDAR_PERMISSION", error.localizedDescription, error) } else { resolve(granted) }
  }

  @objc(getDeviceId:rejecter:)
  func getDeviceId(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(UIDevice.current.identifierForVendor?.uuidString ?? "ios-device")
  }

  @objc(listCalendars:rejecter:)
  func listCalendars(resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    let rows = store.calendars(for: .event).map { calendar in
      ["id": calendar.calendarIdentifier, "title": calendar.title, "color": calendar.cgColor.hex, "writable": calendar.allowsContentModifications] as [String: Any]
    }
    resolve(rows)
  }

  @objc(readEvents:toIso:calendarIds:resolver:rejecter:)
  func readEvents(_ fromIso: String, toIso: String, calendarIds: [String], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let from = formatter.date(from: fromIso), let to = formatter.date(from: toIso) else { reject("CALENDAR_DATE", "Geçersiz tarih", nil); return }
    let selected = store.calendars(for: .event).filter { calendarIds.contains($0.calendarIdentifier) }
    var seenEventIds = Set<String>()
    let rows = store.events(matching: store.predicateForEvents(withStart: from, end: to, calendars: selected)).compactMap { event -> [String: Any]? in
      guard let eventIdentifier = event.eventIdentifier, seenEventIds.insert(eventIdentifier).inserted else { return nil }
      let crmId = event.url?.scheme == "haksan" ? event.url?.lastPathComponent : nil
      return [
        "crmEventId": crmId as Any, "externalCalendarId": event.calendar.calendarIdentifier,
        "externalEventId": eventIdentifier, "occurrenceId": "",
        "title": event.title ?? "İsimsiz etkinlik", "description": event.notes as Any, "location": event.location as Any,
        "startsAt": formatter.string(from: event.startDate), "endsAt": formatter.string(from: event.endDate), "allDay": event.isAllDay,
        "timezone": event.timeZone?.identifier ?? TimeZone.current.identifier, "recurrenceRule": recurrenceString(event.recurrenceRules?.first) as Any,
        "modifiedAt": formatter.string(from: event.lastModifiedDate ?? event.startDate), "deleted": false,
      ]
    }
    resolve(rows)
  }

  @objc(upsertEvents:resolver:rejecter:)
  func upsertEvents(_ commands: [[String: Any]], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    do {
      var written: [[String: Any]] = []
      for command in commands {
        guard let calendarId = command["externalCalendarId"] as? String,
              let calendar = store.calendar(withIdentifier: calendarId), calendar.allowsContentModifications,
              let startsAt = date(command["startsAt"]), let endsAt = date(command["endsAt"]) else { continue }
        let existingId = command["externalEventId"] as? String
        let event = existingId.flatMap { store.event(withIdentifier: $0) } ?? EKEvent(eventStore: store)
        event.calendar = calendar; event.title = command["title"] as? String ?? "CRM etkinliği"; event.notes = command["description"] as? String
        event.location = command["location"] as? String; event.startDate = startsAt; event.endDate = endsAt; event.isAllDay = command["allDay"] as? Bool ?? false
        event.timeZone = TimeZone(identifier: command["timezone"] as? String ?? TimeZone.current.identifier)
        if let crmId = command["crmEventId"] as? String { event.url = URL(string: "haksan://calendar/\(crmId)") }
        try store.save(event, span: .thisEvent, commit: true)
        var row = command; row["externalCalendarId"] = calendarId; row["externalEventId"] = event.eventIdentifier; row["occurrenceId"] = command["occurrenceId"] ?? ""; row["modifiedAt"] = formatter.string(from: event.lastModifiedDate ?? Date()); row["deleted"] = false
        written.append(row)
      }
      resolve(written)
    } catch { reject("CALENDAR_WRITE", error.localizedDescription, error) }
  }

  @objc(deleteEvents:resolver:rejecter:)
  func deleteEvents(_ commands: [[String: Any]], resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    do {
      for command in commands { if let id = command["externalEventId"] as? String, let event = store.event(withIdentifier: id) { try store.remove(event, span: event.hasRecurrenceRules ? .futureEvents : .thisEvent, commit: true) } }
      resolve(nil)
    } catch { reject("CALENDAR_DELETE", error.localizedDescription, error) }
  }

  @objc(setBackgroundSyncEnabled:resolver:rejecter:)
  func setBackgroundSyncEnabled(_ enabled: Bool, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: "com.haksan.mobile.calendar-refresh")
    if enabled {
      let request = BGAppRefreshTaskRequest(identifier: "com.haksan.mobile.calendar-refresh")
      request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
      do { try BGTaskScheduler.shared.submit(request) } catch { reject("CALENDAR_BACKGROUND", error.localizedDescription, error); return }
    }
    resolve(nil)
  }

  private func date(_ value: Any?) -> Date? { (value as? String).flatMap(formatter.date) }
  private func recurrenceString(_ rule: EKRecurrenceRule?) -> String? {
    guard let rule else { return nil }
    let frequency = [EKRecurrenceFrequency.daily: "DAILY", .weekly: "WEEKLY", .monthly: "MONTHLY", .yearly: "YEARLY"][rule.frequency] ?? "DAILY"
    return "FREQ=\(frequency);INTERVAL=\(rule.interval)"
  }
}

private extension CGColor {
  var hex: String {
    guard let values = components, values.count >= 3 else { return "#64748B" }
    return String(format: "#%02X%02X%02X", Int(values[0] * 255), Int(values[1] * 255), Int(values[2] * 255))
  }
}
