import ExpoModulesCore
import Speech
import AVFoundation
import Contacts
import UIKit

public class HaksanCallAssistantModule: Module {
  private let audio = AVAudioEngine()
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var completion: Promise?
  private var observer: NSObjectProtocol?
  private var timeout: DispatchWorkItem?
  private var speechID: UUID?
  private var hasTap = false
  private var backgroundObserver: NSObjectProtocol?
  public func definition() -> ModuleDefinition {
    Name("HaksanCallAssistant")
    Events("pendingAction")
    OnCreate {
      self.backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.stop(message: "Speech cancelled in background") }
      self.observer = NotificationCenter.default.addObserver(forName: NSNotification.Name("HaksanPendingAction"), object: nil, queue: .main) { [weak self] _ in self?.sendEvent("pendingAction", [:]) }
    }
    OnDestroy {
      if let observer = self.backgroundObserver { NotificationCenter.default.removeObserver(observer) }
      if let observer = self.observer { NotificationCenter.default.removeObserver(observer) }
      DispatchQueue.main.async { self.stop(message: "Speech cancelled") }
    }
    AsyncFunction("availability") { () -> [String: Bool] in
      let speech = SFSpeechRecognizer(locale: Locale(identifier: "tr-TR"))
      return ["speech": speech?.supportsOnDeviceRecognition == true, "callScreening": false, "appFunctions": false]
    }
    AsyncFunction("getCallScreeningStatus") { false }
    AsyncFunction("requestCallScreeningRole") { false }
    AsyncFunction("requestContactsPermission") { (promise: Promise) in
      CNContactStore().requestAccess(for: .contacts) { allowed, _ in promise.resolve(allowed) }
    }
    AsyncFunction("activateScope") { (scope: String?) in try AssistantVault.activateScope(scope) }
    AsyncFunction("setPhoneIndex") { (_: [String: Any]) in
      // iOS cannot observe ordinary cellular calls; no phone index is retained.
    }
    AsyncFunction("setEnabled") { (enabled: Bool, scope: String?) in try AssistantVault.setEnabled(enabled, scope: scope) }
    AsyncFunction("clearContext") { try AssistantVault.clear() }
    AsyncFunction("drainPendingActions") { try AssistantVault.drain() }
    AsyncFunction("acknowledgePendingActions") { (ids: [String]) in try AssistantVault.acknowledge(ids) }
    AsyncFunction("cancelSpeech") { self.stop(message: "Speech cancelled") }.runOnQueue(.main)
    AsyncFunction("startSpeech") { (locale: String?, promise: Promise) in
      guard self.completion == nil else { promise.reject("E_BUSY", "Speech already active"); return }
      self.completion = promise
      let id = UUID(); self.speechID = id
      SFSpeechRecognizer.requestAuthorization { status in
        guard status == .authorized else { DispatchQueue.main.async { if self.speechID == id { self.stop(message: "Speech permission denied") } }; return }
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
          DispatchQueue.main.async {
            guard self.completion != nil, self.speechID == id else { return }
            guard granted else { self.stop(message: "Microphone permission denied"); return }
            self.begin(locale: locale ?? "tr-TR")
          }
        }
      }
    }.runOnQueue(.main)
  }
  private func begin(locale: String) {
    let id = speechID
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.supportsOnDeviceRecognition, recognizer.isAvailable else { stop(message: "On-device speech unavailable"); return }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.record, mode: .measurement, options: .duckOthers)
      try session.setActive(true, options: .notifyOthersOnDeactivation)
      let request = SFSpeechAudioBufferRecognitionRequest()
      request.requiresOnDeviceRecognition = true
      request.shouldReportPartialResults = false
      self.request = request
      let input = audio.inputNode
      input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in request.append(buffer) }
      hasTap = true
      audio.prepare(); try audio.start()
      task = recognizer.recognitionTask(with: request) { [weak self] result, error in
        DispatchQueue.main.async {
          guard let self, self.completion != nil, self.speechID == id else { return }
          if let result, result.isFinal {
            let promise = self.completion; self.completion = nil
            self.stop(message: "")
            promise?.resolve(String(result.bestTranscription.formattedString.prefix(4000)))
          } else if error != nil { self.stop(message: "On-device speech failed") }
        }
      }
      let timeout = DispatchWorkItem { [weak self] in self?.stop(message: "Speech time limit reached") }
      self.timeout = timeout; DispatchQueue.main.asyncAfter(deadline: .now() + 30, execute: timeout)
    } catch { stop(message: "On-device speech could not start") }
  }
  private func stop(message: String) {
    timeout?.cancel(); timeout = nil
    speechID = nil
    if audio.isRunning { audio.stop() }
    if hasTap { audio.inputNode.removeTap(onBus: 0); hasTap = false }
    request?.endAudio(); request = nil; task?.cancel(); task = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    let promise = completion; completion = nil
    if !message.isEmpty { promise?.reject("E_SPEECH", message) }
  }
}
