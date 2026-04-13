#!/bin/bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_PYTHON="$(command -v python3)"
DEFAULT_ENTRY_DIR="$HOME/Desktop/研发测试/data-compliance-review-codex"
if [ -d "$DEFAULT_ENTRY_DIR/web" ]; then
  ENTRY_DIR="$DEFAULT_ENTRY_DIR"
  WEB_ENTRY="$DEFAULT_ENTRY_DIR/web"
elif [ -d "$DEFAULT_ENTRY_DIR/data-compliance-web" ]; then
  ENTRY_DIR="$DEFAULT_ENTRY_DIR"
  WEB_ENTRY="$DEFAULT_ENTRY_DIR/data-compliance-web"
else
  ENTRY_DIR="$(cd "$WEB_DIR/.." && pwd)"
  WEB_ENTRY="$WEB_DIR"
fi
APP_NAME="ComplianceAI"
APP_BUNDLE="${1:-$HOME/Desktop/${APP_NAME}.app}"
ICON_SOURCE="${2:-$HOME/Desktop/complianceai-icon-v2.svg}"
BUILD_ID="$(date +%Y%m%d%H%M%S)"
ICON_BASENAME="AppIcon-${BUILD_ID}"
TMP_DIR="$(mktemp -d)"
ICONSET_DIR="$TMP_DIR/${APP_NAME}.iconset"
PNG_BASE="$TMP_DIR/${APP_NAME}.png"
STYLED_PNG="$TMP_DIR/${APP_NAME}-styled.png"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ ! -f "$ICON_SOURCE" ]; then
  echo "未找到图标文件: $ICON_SOURCE" >&2
  exit 1
fi

mkdir -p "$ICONSET_DIR"

if [ ! -d "$WEB_DIR/venv" ]; then
  python3 -m venv "$WEB_DIR/venv"
fi

source "$WEB_DIR/venv/bin/activate"
pip install -q -r "$WEB_DIR/requirements.txt"

qlmanage -t -s 1024 -o "$TMP_DIR" "$ICON_SOURCE" >/dev/null 2>&1
GENERATED_PNG="$(find "$TMP_DIR" -maxdepth 1 -name '*.png' | head -n 1)"
if [ -z "$GENERATED_PNG" ]; then
  echo "SVG 转 PNG 失败" >&2
  exit 1
fi
mv "$GENERATED_PNG" "$PNG_BASE"

"$HOST_PYTHON" - <<'PY' "$PNG_BASE" "$STYLED_PNG"
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import sys

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

base = Image.open(src).convert("RGBA")
canvas_size = 1024
icon_size = 860
corner_radius = 188
shadow_blur = 20
shadow_offset = 10

pixels = base.load()
min_x = base.width
min_y = base.height
max_x = -1
max_y = -1
for y in range(base.height):
    for x in range(base.width):
        r, g, b, a = pixels[x, y]
        if a > 10 and not (r > 248 and g > 248 and b > 248):
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)

if max_x >= min_x and max_y >= min_y:
    pad = 2
    base = base.crop((
        max(0, min_x - pad),
        max(0, min_y - pad),
        min(base.width, max_x + pad + 1),
        min(base.height, max_y + pad + 1),
    ))

canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
shadow_layer = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
shadow_mask = Image.new("L", (canvas_size, canvas_size), 0)
shadow_draw = ImageDraw.Draw(shadow_mask)

left = (canvas_size - icon_size) // 2
top = (canvas_size - icon_size) // 2
right = left + icon_size
bottom = top + icon_size

shadow_draw.rounded_rectangle(
    [left, top + shadow_offset, right, bottom + shadow_offset],
    radius=corner_radius,
    fill=160,
)
shadow_layer.putalpha(shadow_mask.filter(ImageFilter.GaussianBlur(shadow_blur)))
canvas.alpha_composite(shadow_layer)

resized = base.resize((icon_size, icon_size), Image.LANCZOS)
clip_mask = Image.new("L", (icon_size, icon_size), 0)
ImageDraw.Draw(clip_mask).rounded_rectangle(
    [0, 0, icon_size, icon_size],
    radius=corner_radius,
    fill=255,
)
rounded_icon = Image.new("RGBA", (icon_size, icon_size), (0, 0, 0, 0))
rounded_icon.paste(resized, (0, 0), clip_mask)

canvas.alpha_composite(rounded_icon, (left, top))
canvas.save(dst)
PY

for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$STYLED_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  retina=$((size * 2))
  sips -z "$retina" "$retina" "$STYLED_PNG" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done

rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
iconutil -c icns "$ICONSET_DIR" -o "$APP_BUNDLE/Contents/Resources/${ICON_BASENAME}.icns"

cat >"$APP_BUNDLE/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key>
  <string>${APP_NAME}</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.complianceai.desktop.native</string>
  <key>CFBundleVersion</key>
  <string>${BUILD_ID}</string>
  <key>CFBundleShortVersionString</key>
  <string>1.1</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleIconFile</key>
  <string>${ICON_BASENAME}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.business</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSExceptionDomains</key>
    <dict>
      <key>localhost</key>
      <dict>
        <key>NSExceptionAllowsInsecureHTTPLoads</key>
        <true/>
      </dict>
      <key>127.0.0.1</key>
      <dict>
        <key>NSExceptionAllowsInsecureHTTPLoads</key>
        <true/>
      </dict>
    </dict>
  </dict>
</dict>
</plist>
PLIST

SWIFT_SOURCE="$TMP_DIR/${APP_NAME}.swift"
cat >"$SWIFT_SOURCE" <<SWIFT
import Cocoa
import Foundation
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var serverTask: Process?
    private let entryDir = "${ENTRY_DIR}"
    private let webDir = "${WEB_ENTRY}"
    private let port = 5100

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        createWindow()
        startServer()
        pollServerReadiness()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let task = serverTask, task.isRunning {
            task.terminate()
        }
    }

    private func createWindow() {
        let rect = NSRect(x: 0, y: 0, width: 1440, height: 960)
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.appearance = NSAppearance(named: .aqua)
        window.backgroundColor = .white
        window.title = ""
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = false
        window.isMovableByWindowBackground = false
        if #available(macOS 11.0, *) {
            window.toolbarStyle = .unifiedCompact
        }
        window.delegate = self
        window.center()
        window.minSize = NSSize(width: 1200, height: 820)

        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: rect, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.resolvesAliases = true

        if panel.runModal() == .OK {
            completionHandler(panel.urls)
        } else {
            completionHandler(nil)
        }
    }

    private func startServer() {
        let process = Process()
        process.currentDirectoryURL = URL(fileURLWithPath: webDir)
        process.executableURL = URL(fileURLWithPath: webDir + "/venv/bin/python3")
        process.arguments = [webDir + "/server_entry.py", "--port", String(port)]
        var env = ProcessInfo.processInfo.environment
        env["COMPLIANCEAI_PYTHON"] = webDir + "/venv/bin/python3"
        env["PYTHONUNBUFFERED"] = "1"
        process.environment = env

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            fputs(text, stderr)
        }

        do {
            try process.run()
            serverTask = process
        } catch {
            showFatal("无法启动本地服务：\\(error.localizedDescription)")
        }
    }

    private func pollServerReadiness() {
        let url = URL(string: "http://127.0.0.1:\\(port)/")!
        let deadline = Date().addingTimeInterval(20)
        func tryLoad() {
            guard Date() < deadline else {
                showFatal("应用启动超时，请检查 Python 运行环境。")
                return
            }
            let task = URLSession.shared.dataTask(with: url) { [weak self] _, response, error in
                guard let self else { return }
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    DispatchQueue.main.async {
                        self.webView.load(URLRequest(url: url))
                    }
                    return
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                    tryLoad()
                }
            }
            task.resume()
        }
        tryLoad()
    }

    private func showFatal(_ message: String) -> Never {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "ComplianceAI 启动失败"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
        exit(1)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
SWIFT

swiftc \
  -framework Cocoa \
  -framework WebKit \
  "$SWIFT_SOURCE" \
  -o "$APP_BUNDLE/Contents/MacOS/${APP_NAME}"

chmod +x "$APP_BUNDLE/Contents/MacOS/${APP_NAME}"

echo "已生成: $APP_BUNDLE"
