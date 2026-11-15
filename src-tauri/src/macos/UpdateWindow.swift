import AppKit
import Darwin

private struct Appearance: Decodable {
    let theme: String
    let language: String
    let bg: String
    let card: String
    let text: String
    let accent: String
    let border: String
}

private struct Config: Decodable {
    let from: String
    let to: String
    let phase: String
    let parentPid: Int32
    let appearance: Appearance
}

private struct Progress: Decodable {
    let phase: String
    var percentage: Int? = nil
    var downloadedBytes: Int64? = nil
    var totalBytes: Int64? = nil
    var speed: Int64? = nil
    var message: String? = nil
}

private func color(_ value: String, fallback: UInt32) -> NSColor {
    let hex = value.count == 7 && value.hasPrefix("#")
        ? UInt32(value.dropFirst(), radix: 16) ?? fallback : fallback
    return NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
                   green: CGFloat((hex >> 8) & 255) / 255,
                   blue: CGFloat(hex & 255) / 255, alpha: 1)
}

private final class UpdatePanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

@MainActor
private final class UpdateWindow: NSObject {
    private let config: Config
    private let directory: URL
    private let input: FileHandle
    private let window = UpdatePanel(contentRect: NSRect(x: 0, y: 0, width: 560, height: 184),
                                     styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
    private let status = NSTextField(labelWithString: "")
    private let mode = NSTextField(labelWithString: "")
    private let details = NSTextField(labelWithString: "")
    private let elapsedText = NSTextField(labelWithString: "")
    private let spinner = NSProgressIndicator()
    private let track = NSView(frame: NSRect(x: 28, y: 50, width: 504, height: 6))
    private let fill = NSView()
    private let dismiss = NSButton()
    private var steps: [NSTextField] = []
    private var progress: Progress
    private var queued: [Progress] = []
    private var unread = Data()
    private var received = 0
    private var phaseStarted = ProcessInfo.processInfo.systemUptime
    private var lastActivity = ProcessInfo.processInfo.systemUptime
    private let launchedAt = ProcessInfo.processInfo.systemUptime
    private let accent: NSColor
    private let textColor: NSColor
    private let secondary: NSColor
    private let backdrop: NSColor
    private let card: NSColor
    private let border: NSColor
    private var isChinese: Bool { config.appearance.language.lowercased().hasPrefix("zh") }

    init(config: Config, directory: URL, input: FileHandle) {
        self.config = config
        self.directory = directory
        self.input = input
        progress = Progress(phase: config.phase)
        let palettes: [String: (UInt32, UInt32, UInt32, UInt32, UInt32)] = [
            "light": (0xf3f5f9, 0xffffff, 0x172337, 0x306bf3, 0xdce3ed),
            "dark":  (0x111721, 0x171f2b, 0xe7edf7, 0x80adff, 0x344257),
            "sand":  (0xf2eee6, 0xfffcf5, 0x392e24, 0x9d542e, 0xdad0c1),
            "mist":  (0xeaf0f8, 0xf7faff, 0x1a2f47, 0x316bb9, 0xd0dceb),
            "forest": (0xe8efe9, 0xf6faf6, 0x213d2e, 0x376e53, 0xccdbd1),
            "slate": (0x222831, 0x2a313b, 0xeff2f5, 0x9bbbee, 0x414d60)
        ]
        let palette = palettes[config.appearance.theme] ?? palettes["light"]!
        accent = color(config.appearance.accent, fallback: palette.3)
        textColor = color(config.appearance.text, fallback: palette.2)
        backdrop = color(config.appearance.bg, fallback: palette.0)
        card = color(config.appearance.card, fallback: palette.1)
        border = color(config.appearance.border, fallback: palette.4)
        secondary = textColor.withAlphaComponent(0.73)
        super.init()
    }

    private func local(_ zh: String, _ en: String) -> String { isChinese ? zh : en }

    private func box(_ view: NSView, _ background: NSColor, radius: CGFloat) {
        view.wantsLayer = true
        view.layer?.backgroundColor = background.cgColor
        view.layer?.cornerRadius = radius
    }

    private func label(_ view: NSTextField, _ value: String, in frame: NSRect,
                       size: CGFloat = 12, weight: NSFont.Weight = .regular, color: NSColor) {
        view.frame = frame
        view.stringValue = value
        view.font = .systemFont(ofSize: size, weight: weight)
        view.textColor = color
        view.lineBreakMode = .byTruncatingTail
        view.maximumNumberOfLines = 1
    }

    func show() {
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.hidesOnDeactivate = false
        window.isMovableByWindowBackground = true
        window.level = .floating
        window.title = local("RHFiles · 正在更新", "RHFiles · Updating")
        let view = NSView(frame: window.frame)
        box(view, backdrop, radius: 14)
        view.layer?.borderWidth = 1
        view.layer?.borderColor = border.cgColor
        window.contentView = view

        let surface = NSView(frame: NSRect(x: 12, y: 12, width: 536, height: 160))
        box(surface, card, radius: 10)
        surface.layer?.borderWidth = 1
        surface.layer?.borderColor = border.cgColor
        view.addSubview(surface)

        let logo = NSImageView(frame: NSRect(x: 28, y: 107, width: 45, height: 45))
        logo.image = NSImage(contentsOf: directory.appendingPathComponent("logo.png"))
        logo.imageScaling = .scaleProportionallyUpOrDown
        view.addSubview(logo)
        let title = NSTextField(labelWithString: "")
        label(title, "RHFiles", in: NSRect(x: 85, y: 132, width: 65, height: 24),
              size: 19, weight: .semibold, color: textColor)
        let badge = NSTextField(labelWithString: "")
        label(badge, "\(config.from)  →  \(config.to)", in: NSRect(x: 156, y: 134, width: 125, height: 18),
              size: 11, weight: .semibold, color: accent)
        badge.alignment = .center
        box(badge, accent.withAlphaComponent(0.12), radius: 5)
        label(status, "", in: NSRect(x: 86, y: 107, width: 410, height: 20), size: 13, color: textColor)
        label(mode, "macOS", in: NSRect(x: 435, y: 134, width: 97, height: 16), color: secondary)
        mode.alignment = .right
        for child in [title, badge, status, mode] { view.addSubview(child) }
        spinner.style = .spinning
        spinner.controlSize = .small
        spinner.frame = NSRect(x: 513, y: 109, width: 17, height: 17)
        spinner.isDisplayedWhenStopped = false
        view.addSubview(spinner)

        let bounds = [("下载", "Download"), ("验签", "Verify"), ("安装", "Install"), ("重启", "Restart")]
        for (index, name) in bounds.enumerated() {
            let step = NSTextField(labelWithString: local(name.0, name.1))
            label(step, local(name.0, name.1), in: NSRect(x: CGFloat(28 + index * 128), y: 69, width: 120, height: 23),
                  size: 12, weight: .medium, color: secondary)
            step.alignment = .center
            view.addSubview(step)
            steps.append(step)
        }
        box(track, border, radius: 3)
        box(fill, accent, radius: 3)
        track.addSubview(fill)
        view.addSubview(track)
        label(details, "", in: NSRect(x: 28, y: 23, width: 371, height: 16), size: 11, color: secondary)
        label(elapsedText, "", in: NSRect(x: 405, y: 23, width: 127, height: 16), size: 11, color: secondary)
        elapsedText.alignment = .right
        dismiss.title = local("关闭", "Close")
        dismiss.bezelStyle = .rounded
        dismiss.frame = NSRect(x: 463, y: 17, width: 70, height: 27)
        dismiss.target = self
        dismiss.action = #selector(finish)
        for child in [details, elapsedText, dismiss] { view.addSubview(child) }

        render()
        window.center()
        window.orderFrontRegardless()
        window.displayIfNeeded()
        if window.isVisible && window.windowNumber > 0 {
            try? Data(String(window.windowNumber).utf8).write(to: directory.appendingPathComponent("ready"), options: .atomic)
        }
    }

    private func byteLabel(_ number: Int64?) -> String {
        guard let number = number, number > 0 else { return "—" }
        return ByteCountFormatter.string(fromByteCount: number, countStyle: .file)
    }

    private var activeStep: Int {
        switch progress.phase {
        case "downloading": return 0
        case "verifying": return 1
        case "ready", "applying": return 2
        case "restarting": return 3
        default: return 4
        }
    }

    private func render() {
        let phase = progress.phase
        let percentage = min(100, max(0, progress.percentage ?? 0))
        let busy = ["verifying", "applying", "restarting"].contains(phase) || (phase == "downloading" && (progress.totalBytes ?? 0) <= 0)
        let messages = [
            "downloading": local("正在下载更新", "Downloading update"),
            "verifying": local("正在验证发布签名", "Verifying release signature"),
            "ready": local("已验签，等待安装", "Verified. Ready to install"),
            "applying": local("正在安装新版本", "Installing the new version"),
            "restarting": local("正在重启，等待新版窗口", "Restarting and waiting for the new window"),
            "complete": local("更新完成", "Update complete"),
            "failed": local("更新失败", "Update failed")
        ]
        status.stringValue = (messages[phase] ?? "") + (phase == "downloading" && (progress.totalBytes ?? 0) > 0 ? " · \(percentage)%" : "")
        window.title = "RHFiles · " + status.stringValue
        let names = [local("下载", "Download"), local("验签", "Verify"), local("安装", "Install"), local("重启", "Restart")]
        for (index, step) in steps.enumerated() {
            let active = index == activeStep
            let done = index < activeStep && phase != "failed"
            step.stringValue = (done ? "✓  " : "\(index + 1)  ") + names[index]
            step.textColor = active || done ? accent : secondary
            box(step, active ? accent.withAlphaComponent(0.14) : .clear, radius: 5)
        }
        let fraction = phase == "downloading" ? Double(percentage) / 100
            : phase == "failed" ? 0 : min(1, Double(activeStep) / 4)
        fill.frame = NSRect(x: 0, y: 0, width: track.bounds.width * fraction, height: track.bounds.height)
        if busy { spinner.startAnimation(nil) } else { spinner.stopAnimation(nil) }
        dismiss.isHidden = phase != "ready" && phase != "failed"
        elapsedText.isHidden = !dismiss.isHidden
        details.stringValue = phase == "downloading"
            ? "\(byteLabel(progress.downloadedBytes)) / \(byteLabel(progress.totalBytes)) · \(byteLabel(progress.speed))/s"
            : progress.message ?? (phase == "restarting" ? local("正在恢复应用窗口", "Restoring the application window") : "")
        details.toolTip = progress.message
        window.displayIfNeeded()
        if window.isVisible, let data = try? JSONSerialization.data(withJSONObject: [
            "phase": phase, "percentage": percentage, "window": window.windowNumber,
            "parentAlive": kill(config.parentPid, 0) == 0
        ]) {
            try? data.write(to: directory.appendingPathComponent("displayed.json"), options: .atomic)
        }
    }

    private func receive() throws {
        guard let data = try input.read(upToCount: 65_536), !data.isEmpty else { return }
        received += data.count
        if received > 2_097_152 { throw CocoaError(.fileReadTooLarge) }
        unread.append(data)
        while let end = unread.firstIndex(of: 10) {
            guard end - unread.startIndex <= 8192 else { throw CocoaError(.fileReadTooLarge) }
            let next = try JSONDecoder().decode(Progress.self, from: unread[..<end])
            unread.removeSubrange(unread.startIndex...end)
            if queued.last?.phase == next.phase { queued[queued.count - 1] = next }
            else { queued.append(next) }
        }
        if unread.count > 8192 { throw CocoaError(.fileReadTooLarge) }
    }

    @objc func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        do { try receive() }
        catch { change(Progress(phase: "failed", message: local("无法读取更新进度", "Could not read update progress")), at: now) }
        if let next = queued.first, next.phase == progress.phase || now - phaseStarted >= 0.25 {
            queued.removeFirst()
            change(next, at: now)
        }
        let elapsed = Int(now - launchedAt)
        elapsedText.stringValue = String(format: "%02d:%02d", elapsed / 60, elapsed % 60)
        if progress.phase == "restarting" {
            let started = directory.appendingPathComponent("started")
            if now - phaseStarted >= 0.75, let marker = try? String(contentsOf: started, encoding: .utf8),
               let pid = Int32(marker), pid > 0, pid != config.parentPid, kill(pid, 0) == 0 {
                change(Progress(phase: "complete"), at: now)
            } else if now - phaseStarted > 60 {
                change(Progress(phase: "failed", message: local("新版窗口未就绪，请重新打开 RHFiles", "The new window did not become ready. Reopen RHFiles.")), at: now)
            }
        } else if progress.phase == "complete" && now - phaseStarted >= 0.65 {
            finish()
        } else if progress.phase == "failed" && now - phaseStarted > 90 {
            finish()
        } else if progress.phase == "ready" && now - phaseStarted > 600 {
            finish()
        } else if !["complete", "failed"].contains(progress.phase) && queued.isEmpty
                    && (kill(config.parentPid, 0) != 0 || now - lastActivity > 240 && progress.phase != "ready") {
            change(Progress(phase: "failed", message: local("更新连接已中断，请重新打开 RHFiles", "Update progress was interrupted. Reopen RHFiles.")), at: now)
        }
    }

    private func change(_ next: Progress, at time: TimeInterval) {
        if next.phase != progress.phase { phaseStarted = time }
        progress = next
        lastActivity = time
        render()
    }

    @objc func finish() {
        window.orderOut(nil)
        try? input.close()
        let names = ["RHFiles.UpdateWindow", "logo.png", "config.json", "progress.jsonl",
                     "ready", "displayed.json", "restart.json", "started"]
        for name in names { _ = unlink(directory.appendingPathComponent(name).path) }
        _ = rmdir(directory.path)
        NSApp.terminate(nil)
    }
}

@main
private struct EntryPoint {
    @MainActor static func main() {
        guard CommandLine.arguments.count == 2 else { exit(2) }
        let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        guard let data = try? Data(contentsOf: directory.appendingPathComponent("config.json")),
              data.count <= 8192, let config = try? JSONDecoder().decode(Config.self, from: data),
              config.parentPid > 0,
              let input = try? FileHandle(forReadingFrom: directory.appendingPathComponent("progress.jsonl")) else { exit(2) }
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let updateWindow = UpdateWindow(config: config, directory: directory, input: input)
        DispatchQueue.main.async { updateWindow.show() }
        let timer = Timer(timeInterval: 0.08, target: updateWindow, selector: #selector(UpdateWindow.tick), userInfo: nil, repeats: true)
        RunLoop.main.add(timer, forMode: .common)
        app.run()
    }
}
