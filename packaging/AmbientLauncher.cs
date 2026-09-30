using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("Codex Ambient")]
[assembly: AssemblyDescription("Animated backgrounds and live preview for Codex")]
[assembly: AssemblyProduct("Codex Ambient")]
[assembly: AssemblyVersion("0.2.2.0")]
[assembly: AssemblyFileVersion("0.2.2.0")]

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexAmbient");
        bool smoke = false;
        int port = 43127;
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--data-dir" && i + 1 < args.Length) data = Path.GetFullPath(args[++i]);
            else if (args[i] == "--smoke-test") { smoke = true; port = 43129; }
        }
        UiText.Initialize(data);
        try
        {
            Directory.CreateDirectory(data);
            if (smoke)
            {
                using (var service = new AmbientService(data, port))
                {
                    service.EnsureStarted();
                    string panel = service.Read("/");
                    if (!panel.Contains("即時預覽") || !panel.Contains("ambient-token")) throw new Exception("Preview page is incomplete.");
                    foreach (string asset in new[] { "/app.js", "/style.css", "/runtime.js", "/i18n.js" })
                        if (service.Read(asset).Length < 100) throw new Exception("Missing asset: " + asset);
                    string runtimeVersion = service.NodeVersion();
                    File.WriteAllText(Path.Combine(data, "smoke-result.json"), new JavaScriptSerializer().Serialize(new {
                        ok = true, bundledRuntime = runtimeVersion, preview = "http://127.0.0.1:43129/", executable = Application.ExecutablePath,
                        engine = service.EnginePath, startedOwnService = service.OwnsServer,
                        languageSample = UiText.T("即時預覽", "Live preview")
                    }), Encoding.UTF8);
                }
                return 0;
            }
            bool first;
            using (var mutex = new Mutex(true, "Local\\CodexAmbient.Desktop.v2", out first))
            {
                if (!first)
                {
                    using (var running = new AmbientService(data, port))
                    {
                        var identity = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(running.Read("/api/identity"));
                        if (identity == null || !identity.ContainsKey("version") || Convert.ToString(identity["version"]) != "0.2.2")
                            throw new Exception(UiText.T("舊版 Ambient 仍在執行。請從系統匣離開舊版工具，再開啟新版。", "An older Ambient version is running. Quit the old tool from its tray menu, then open the new version."));
                    }
                    AmbientService.OpenPreview("http://127.0.0.1:43127/"); return 0;
                }
                try { Application.Run(new AmbientContext(data, port)); }
                finally { mutex.ReleaseMutex(); }
            }
            return 0;
        }
        catch (Exception error)
        {
            try { File.WriteAllText(Path.Combine(data, "launcher-error.log"), error.ToString(), Encoding.UTF8); } catch { }
            if (!smoke) MessageBox.Show(UiText.T("無法開啟 Codex Ambient。\n\n", "Could not open Codex Ambient.\n\n") + error.Message + UiText.T("\n\n詳細資訊：", "\n\nDetails: ") + Path.Combine(data, "launcher-error.log"), "Codex Ambient", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}

internal sealed class AmbientContext : ApplicationContext
{
    private readonly AmbientService service;
    private readonly NotifyIcon tray;
    private readonly Form dispatcher;
    private bool opening;
    private bool disposed;

    public AmbientContext(string data, int port)
    {
        service = new AmbientService(data, port);
        dispatcher = new Form();
        IntPtr handle = dispatcher.Handle;
        var menu = new ContextMenuStrip();
        menu.Items.Add(UiText.T("開啟背景預覽", "Open background preview"), null, delegate { Open(); });
        menu.Items.Add(UiText.T("啟動 Codex（背景模式）", "Start Codex (background mode)"), null, delegate { LaunchCodex(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(UiText.T("離開工具", "Quit"), null, delegate { ExitThread(); });
        tray = new NotifyIcon {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), Text = UiText.T("Codex Ambient · 正在啟動", "Codex Ambient · Starting"),
            ContextMenuStrip = menu, Visible = true
        };
        menu.Opening += delegate {
            menu.Items[0].Text = UiText.T("開啟背景預覽", "Open background preview");
            menu.Items[1].Text = UiText.T("啟動 Codex（背景模式）", "Start Codex (background mode)");
            menu.Items[3].Text = UiText.T("離開工具", "Quit");
            tray.Text = UiText.T("Codex Ambient · 雙擊開啟預覽", "Codex Ambient · Double-click to preview");
        };
        tray.DoubleClick += delegate { Open(); };
        Open();
    }
    private void Dispatch(Action action)
    {
        if (!disposed && !dispatcher.IsDisposed) try { dispatcher.BeginInvoke(action); } catch (InvalidOperationException) { }
    }
    private void Open()
    {
        if (opening) return;
        opening = true;
        Task.Run(() => {
            try
            {
                service.EnsureStarted();
                Dispatch(() => {
                    AmbientService.OpenPreview(service.Origin + "/");
                    tray.Text = UiText.T("Codex Ambient · 雙擊開啟預覽", "Codex Ambient · Double-click to preview");
                    opening = false;
                });
            }
            catch (Exception error)
            {
                Dispatch(() => { opening = false; tray.Text = UiText.T("Codex Ambient · 啟動失敗", "Codex Ambient · Startup failed"); MessageBox.Show(error.Message, "Codex Ambient", MessageBoxButtons.OK, MessageBoxIcon.Error); });
            }
        });
    }
    private void LaunchCodex()
    {
        if (opening) return;
        opening = true;
        Task.Run(() => {
            try
            {
                service.EnsureStarted();
                string result = service.StartCodex();
                Dispatch(() => { opening = false; MessageBox.Show(result, "Codex Ambient", MessageBoxButtons.OK, MessageBoxIcon.Information); });
            }
            catch (Exception error) { Dispatch(() => { opening = false; MessageBox.Show(error.Message, "Codex Ambient", MessageBoxButtons.OK, MessageBoxIcon.Warning); }); }
        });
    }
    protected override void ExitThreadCore()
    {
        disposed = true;
        tray.Visible = false; tray.Dispose();
        service.Dispose(); dispatcher.Dispose();
        base.ExitThreadCore();
    }
}

internal sealed class AmbientService : IDisposable
{
    private readonly string data;
    private readonly int port;
    private Process server;
    private readonly object gate = new object();
    private bool disposed;
    public string EnginePath { get; private set; }
    public string Origin { get { return "http://127.0.0.1:" + port; } }
    public bool OwnsServer { get { return server != null; } }
    public AmbientService(string data, int port) { this.data = data; this.port = port; }

    public string Read(string endpoint)
    {
        var request = (HttpWebRequest)WebRequest.Create(Origin + endpoint);
        request.Proxy = null; request.Timeout = endpoint == "/api/status" ? 5000 : 1500; request.ReadWriteTimeout = 5000; request.AllowAutoRedirect = false;
        using (var response = request.GetResponse())
        using (var reader = new StreamReader(response.GetResponseStream())) return reader.ReadToEnd();
    }
    private bool Healthy()
    {
        Dictionary<string, object> identity;
        try { identity = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(Read("/api/identity")); }
        catch { return false; }
        if (identity == null || !identity.ContainsKey("app") || Convert.ToString(identity["app"]) != "codex-ambient") return false;
        if (!identity.ContainsKey("version") || Convert.ToString(identity["version"]) != "0.2.2")
            throw new Exception(UiText.T("舊版 Ambient 仍在執行。請從系統匣離開舊版工具，再開啟新版。", "An older Ambient version is running. Quit the old tool from its tray menu, then open the new version."));
        return true;
    }
    public void EnsureStarted()
    {
        lock (gate)
        {
            if (disposed) throw new ObjectDisposedException("AmbientService");
            if (Healthy()) return;
            if (EnginePath == null) EnginePath = ExtractPayload();
            var info = new ProcessStartInfo(Path.Combine(EnginePath, "node.exe"), Quote(Path.Combine(EnginePath, "server.mjs"))) {
                WorkingDirectory = EnginePath, UseShellExecute = false, CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden, RedirectStandardOutput = true, RedirectStandardError = true
            };
            // Never inherit NODE_OPTIONS from a developer shell into the bundled helper.
            // Set process-local values. Avoid .NET Framework's case-sensitive PATH/Path
            // import bug when a developer host supplies both environment spellings.
            Environment.SetEnvironmentVariable("NODE_OPTIONS", null);
            Environment.SetEnvironmentVariable("NODE_PATH", null);
            Environment.SetEnvironmentVariable("AMBIENT_PORT", port.ToString());
            Environment.SetEnvironmentVariable("AMBIENT_DATA_DIR", Path.Combine(data, "settings"));
            server = new Process { StartInfo = info, EnableRaisingEvents = true };
            server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { Log(e.Data); };
            server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { Log(e.Data); };
            server.Start(); server.BeginOutputReadLine(); server.BeginErrorReadLine();
            for (int attempt = 0; attempt < 40; attempt++)
            {
                if (Healthy()) return;
                if (server.HasExited) throw new Exception(UiText.T("控制台啟動失敗。連接埠可能已被其他程式使用。\n請查看 ", "Control panel startup failed. Another application may be using the port.\nSee ") + Path.Combine(data, "service.log"));
                Thread.Sleep(150);
            }
            throw new Exception(UiText.T("控制台啟動逾時，請再試一次。", "Control panel startup timed out. Please try again."));
        }
    }
    private void Log(string line)
    {
        if (String.IsNullOrEmpty(line)) return;
        try { lock (data) File.AppendAllText(Path.Combine(data, "service.log"), DateTime.Now.ToString("s") + " " + line + Environment.NewLine, Encoding.UTF8); } catch { }
    }
    private string ExtractPayload()
    {
        var assembly = Assembly.GetExecutingAssembly();
        string digest;
        using (Stream stream = assembly.GetManifestResourceStream("ambient.payload.zip"))
        using (var sha = SHA256.Create()) digest = BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        string target = Path.GetFullPath(Path.Combine(data, "engine-" + digest.Substring(0, 16)));
        string marker = Path.Combine(target, ".ready");
        if (File.Exists(marker) && File.ReadAllText(marker) == digest && File.Exists(Path.Combine(target, "node.exe")) && File.Exists(Path.Combine(target, "server.mjs"))) return target;
        // An interrupted extraction is left intact. A fresh versioned folder needs no deletion.
        if (Directory.Exists(target)) target += "-" + Guid.NewGuid().ToString("N");
        Directory.CreateDirectory(target);
        string boundary = target.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        using (Stream stream = assembly.GetManifestResourceStream("ambient.payload.zip"))
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string destination = Path.GetFullPath(Path.Combine(target, entry.FullName));
                if (!destination.StartsWith(boundary, StringComparison.OrdinalIgnoreCase)) throw new Exception(UiText.T("封裝內容路徑無效。", "Invalid path in the application package."));
                if (String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(destination); continue; }
                Directory.CreateDirectory(Path.GetDirectoryName(destination));
                using (Stream input = entry.Open())
                using (Stream output = File.Create(destination)) input.CopyTo(output);
            }
        }
        File.WriteAllText(Path.Combine(target, ".ready"), digest);
        return target;
    }
    public string NodeVersion()
    {
        if (EnginePath == null) EnginePath = ExtractPayload();
        var info = new ProcessStartInfo(Path.Combine(EnginePath, "node.exe"), "--version") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true };
        Environment.SetEnvironmentVariable("NODE_OPTIONS", null);
        using (Process p = Process.Start(info)) { string result = p.StandardOutput.ReadToEnd(); p.WaitForExit(); if (p.ExitCode != 0) throw new Exception("Bundled Node failed."); return result.Trim(); }
    }
    public string StartCodex()
    {
        var status = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(Read("/api/status"));
        if (status.ContainsKey("connected") && Convert.ToBoolean(status["connected"])) return UiText.T("Codex 已連接。請直接在控制台選擇背景並按「套用至 Codex」。", "Codex is connected. Choose a background in the control panel and click Apply to Codex.");
        // Query the Store installation path only; launch the executable directly below.
        string command = "$p = Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1; if ($p) { Write-Output $p.InstallLocation }";
        var info = new ProcessStartInfo("powershell.exe", "-NoProfile -NonInteractive -Command " + Quote(command)) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardError = true, RedirectStandardOutput = true
        };
        string installPath;
        using (Process p = Process.Start(info))
        {
            Task<string> stdout = p.StandardOutput.ReadToEndAsync(), stderr = p.StandardError.ReadToEndAsync();
            if (!p.WaitForExit(20000)) { p.Kill(); throw new Exception(UiText.T("啟動 Codex 逾時。", "Starting Codex timed out.")); }
            Task.WaitAll(stdout, stderr);
            if (p.ExitCode != 0) throw new Exception(UiText.T("無法取得 Codex 安裝位置。\n\n", "Could not find the Codex installation location.\n\n") + stderr.Result);
            installPath = stdout.Result.Trim();
        }
        string executable = null;
        if (!String.IsNullOrEmpty(installPath)) foreach (string name in new[] { "ChatGPT.exe", "Codex.exe" }) {
            string candidate = Path.Combine(installPath, "app", name);
            if (File.Exists(candidate)) { executable = candidate; break; }
        }
        if (executable == null) throw new Exception(UiText.T("找不到 Microsoft Store 版 Codex。請使用原本的 Codex 啟動器開啟背景模式。", "Microsoft Store Codex was not found. Use your existing Codex launcher to start background mode."));
        foreach (Process app in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(executable)))
        {
            using (app) {
                string runningPath;
                try { runningPath = app.MainModule.FileName; }
                catch { throw new Exception(UiText.T("Codex 目前仍在執行。請先完成工作並完全結束 Codex（包含系統匣），再重試。", "Codex is still running. Finish your work and fully exit Codex, including the system tray, then try again.")); }
                if (String.Equals(runningPath, executable, StringComparison.OrdinalIgnoreCase)) throw new Exception(UiText.T("Codex 已開啟。請先完成工作並完全結束 Codex（包含系統匣），再重試。", "Codex is already open. Finish your work and fully exit Codex, including the system tray, then try again."));
            }
        }
        foreach (IPEndPoint endpoint in IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners())
            if (endpoint.Port == 9223) throw new Exception(UiText.T("9223 連接埠已被使用，請先關閉其他偵錯服務。", "Port 9223 is in use. Close other debugging services first."));
        Process.Start(new ProcessStartInfo(executable, "--remote-debugging-address=127.0.0.1 --remote-debugging-port=9223") { UseShellExecute = true });
        return UiText.T("已啟動 Codex。請在預覽控制台按「重新偵測」，再套用背景。", "Codex started. Click Detect again in the preview control panel, then apply a background.");
    }
    public static void OpenPreview(string url)
    {
        foreach (string folder in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) })
        {
            string edge = Path.Combine(folder, "Microsoft", "Edge", "Application", "msedge.exe");
            if (File.Exists(edge)) { Process.Start(new ProcessStartInfo(edge, "--app=" + Quote(url) + " --new-window") { UseShellExecute = true }); return; }
        }
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
    private static string Quote(string text) { return "\"" + text.Replace("\"", "\\\"") + "\""; }
    public void Dispose()
    {
        lock (gate)
        {
            disposed = true;
            if (server != null)
            {
                try { if (!server.HasExited) { server.Kill(); server.WaitForExit(3000); } } catch { }
                server.Dispose(); server = null;
            }
        }
    }
}

internal static class UiText
{
    private static string file;
    public static void Initialize(string data) { file = Path.Combine(data, "settings", "ui.json"); }
    public static string T(string chinese, string english)
    {
        try
        {
            var settings = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(file));
            if (settings != null && settings.ContainsKey("language") && Convert.ToString(settings["language"]) == "en") return english;
        }
        catch { }
        return chinese;
    }
}
