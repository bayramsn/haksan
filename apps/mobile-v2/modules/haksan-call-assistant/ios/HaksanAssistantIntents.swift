import AppIntents
import Foundation
import UIKit

@available(iOS 16.0, *)
public enum HaksanAssistantAction: String, AppEnum {
  case afterCall = "after_call", openToday = "open_today", findOpportunities = "find_opportunities", newOpportunity = "new_opportunity", addNote = "add_note", createTask = "create_task", newServiceTicket = "new_service_ticket"
  public static var typeDisplayRepresentation: TypeDisplayRepresentation = "Haksan işlemi"
  public static var caseDisplayRepresentations: [HaksanAssistantAction: DisplayRepresentation] = [
    .afterCall: "Görüşme sonrası", .openToday: "Bugünümü aç", .findOpportunities: "Fırsatlarımı bul", .newOpportunity: "Yeni fırsat", .addNote: "Not ekle", .createTask: "Görev oluştur", .newServiceTicket: "Servis talebi oluştur"
  ]
}

@available(iOS 16.0, *)
public struct HaksanAssistantIntent: AppIntent {
  public static var title: LocalizedStringResource = "Haksan yardımcısını aç"
  public static var description = IntentDescription("İşlemi Haksan uygulamasında gözden geçirmek için açar. Kendiliğinden kayıt oluşturmaz.")
  public static var openAppWhenRun: Bool = true
  public static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication
  @available(iOS 26.0, *) public static var supportedModes: IntentModes { .foreground }
  @Parameter(title: "İşlem") public var action: HaksanAssistantAction
  @Parameter(title: "Not") public var note: String?
  @Parameter(title: "Firma veya ilgili kişi") public var query: String?
  @Parameter(title: "Takip tarihi ve saati") public var dueAt: Date?
  public init() {}
  public init(action: HaksanAssistantAction) { self.action = action }
  @MainActor public func perform() async throws -> some IntentResult {
    let id = try AssistantVault.enqueue(action: action.rawValue, utterance: note, query: query, dueAt: dueAt)
    let destination = id.map { "haksan:///modules/call-assistant/\($0)" } ?? "haksan:///modules/call-assistant"
    guard let url = URL(string: destination) else { throw NSError(domain: "HaksanAssistant", code: 1) }
    // openAppWhenRun/supportedModes foreground the app on iOS 16+; only an
    // opaque local action id crosses the URL boundary.
    _ = await UIApplication.shared.open(url)
    return .result()
  }
}

/// Siri collects the full Turkish request; authorized CRM resolution and the
/// allowlisted command parser run only inside the authenticated application.
@available(iOS 16.0, *)
public struct HaksanAssistantCommandIntent: AppIntent {
  public static var title: LocalizedStringResource = "Haksan için komut hazırla"
  public static var description = IntentDescription("Söylediğiniz komutu Haksan'da incelemek için açar. Kaydetmeden iş kaydı oluşturmaz.")
  public static var openAppWhenRun: Bool = true
  public static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication
  @available(iOS 26.0, *) public static var supportedModes: IntentModes { .foreground }
  @Parameter(title: "Komut", requestValueDialog: "Haksan'da ne yapmak istiyorsunuz? Firma veya kişiyi ve varsa tarih ile saati söyleyin.")
  public var command: String
  public init() {}
  @MainActor public func perform() async throws -> some IntentResult {
    let text = command.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { throw $command.needsValueError("Lütfen yapmak istediğiniz işlemi Türkçe söyleyin.") }
    let id = try AssistantVault.enqueue(action: "after_call", command: text)
    let destination = id.map { "haksan:///modules/call-assistant/\($0)" } ?? "haksan:///modules/call-assistant"
    guard let url = URL(string: destination) else { throw NSError(domain: "HaksanAssistant", code: 1) }
    _ = await UIApplication.shared.open(url)
    return .result()
  }
}

// AppIntentsPackage iOS 17 ile geldi; intent ve kısayollar iOS 16'da kalır.
@available(iOS 17.0, *)
public struct HaksanCallAssistantIntentsPackage: AppIntentsPackage { public init() {} }
