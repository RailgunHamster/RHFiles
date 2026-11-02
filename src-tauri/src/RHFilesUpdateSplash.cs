using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal static class Program
{
    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr dpiContext);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [STAThread]
    private static void Main(string[] args)
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
        catch { try { SetProcessDPIAware(); } catch { } }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new RHFilesSplashForm(SplashConfig.Parse(args)));
    }
}

internal sealed class SplashConfig
{
    public string Title = "RHFiles";
    public string FromVersion = "";
    public string ToVersion = "";
    public string Theme = "light"; // light | dark | sand | mist | forest | slate
    public string CustomBg = "";
    public string CustomCard = "";
    public string CustomText = "";
    public string CustomAccent = "";
    public string CustomBorder = "";
    public string LogoPath = "";
    public int WaitPid;
    public string RootDir = "";
    public string MainExe = "RHFiles.exe";
    public string ReadyFile = "";
    public string Language = "zh";
    public string Mode = "installed";
    public int TimeoutMs = 180000;
    public int DemoMs;
    public int DemoStage = 1;
    public string ScreenshotPath = "";

    public static SplashConfig Parse(string[] args)
    {
        var c = new SplashConfig();
        for (int i = 0; i < args.Length; i++)
        {
            string k = args[i];
            string v = (i + 1 < args.Length) ? args[i + 1] : "";
            switch (k)
            {
                case "--title": c.Title = v; i++; break;
                case "--from-version": c.FromVersion = v; i++; break;
                case "--to-version": c.ToVersion = v; i++; break;
                case "--theme": c.Theme = v; i++; break;
                case "--bg": c.CustomBg = v; i++; break;
                case "--card": c.CustomCard = v; i++; break;
                case "--text": c.CustomText = v; i++; break;
                case "--accent": c.CustomAccent = v; i++; break;
                case "--border": c.CustomBorder = v; i++; break;
                case "--logo": c.LogoPath = v; i++; break;
                case "--wait-pid": int.TryParse(v, out c.WaitPid); i++; break;
                case "--root-dir": c.RootDir = v; i++; break;
                case "--main-exe": c.MainExe = v; i++; break;
                case "--ready-file": c.ReadyFile = v; i++; break;
                case "--language": c.Language = v; i++; break;
                case "--mode": c.Mode = v; i++; break;
                case "--timeout-ms": int.TryParse(v, out c.TimeoutMs); i++; break;
                case "--demo-ms": int.TryParse(v, out c.DemoMs); i++; break;
                case "--demo-stage": int.TryParse(v, out c.DemoStage); i++; break;
                case "--screenshot": c.ScreenshotPath = v; i++; break;
            }
        }
        c.TimeoutMs = Math.Max(1000, Math.Min(600000, c.TimeoutMs));
        return c;
    }
}

internal sealed class RHFilesSplashForm : Form
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);
    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr icon);
    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();
    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    private readonly SplashConfig config;
    private readonly Stopwatch elapsed = Stopwatch.StartNew();
    private readonly Timer animTimer;
    private readonly Timer probeTimer;
    private Image logoImage;
    private float scale = 1f;
    private bool dwmRounded;
    private bool isDarkTheme;

    private int stage; // 0: closing, 1: extracting, 2: replacing, 3: starting
    private float targetProgress = 0.16f;
    private float displayProgress = 0.10f;
    private float shimmerPhase;
    private bool sawTempDir;
    private bool sawSwapOrMultipleTemp;
    private DateTime? updateExeExitedAt;
    private bool screenshotSaved;
    private readonly DateTime launchedAt = DateTime.UtcNow;
    private Process previousProcess;
    private Process updater;
    private string failure;
    private bool Zh { get { return config.Language.StartsWith("zh", StringComparison.OrdinalIgnoreCase); } }
    private string L(string zh, string en) { return Zh ? zh : en; }

    // Theme palette matching RHFiles variables.css & theme.js
    private Color bgColor;
    private Color cardColor;
    private Color borderColor;
    private Color textColor;
    private Color text2Color;
    private Color text3Color;
    private Color accentColor;
    private Color accentEndColor;
    private Color accentLightColor;
    private Color trackColor;
    private Color stepDoneColor;

    public RHFilesSplashForm(SplashConfig config)
    {
        this.config = config;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;
        TopMost = false;
        DoubleBuffered = true;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);

        Text = config.Title + L(" · 正在更新", " · Updating");
        try { previousProcess = Process.GetProcessById(config.WaitPid); var handle = previousProcess.Handle; } catch { }
        ApplyTheme();
        LoadLogo();

        if (!string.IsNullOrEmpty(config.ScreenshotPath))
        {
            stage = Math.Max(0, Math.Min(3, config.DemoStage));
            targetProgress = StageBaseProgress(stage) + 0.12f;
            displayProgress = targetProgress;
            shimmerPhase = 0.48f;
        }
        else if (config.DemoMs > 0)
        {
            stage = 1;
            targetProgress = StageBaseProgress(1);
            displayProgress = 0.14f;
        }

        animTimer = new Timer { Interval = 33 };
        animTimer.Tick += OnAnimateTick;
        probeTimer = new Timer { Interval = 500 };
        probeTimer.Tick += OnProbeTick;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        using (Graphics g = CreateGraphics())
        {
            scale = g.DpiX / 96f;
            if (scale <= 0f) scale = 1f;
        }
        if (!string.IsNullOrEmpty(config.ScreenshotPath) && scale < 1.25f)
            scale = 1.25f;
        ClientSize = new Size(S(560), S(188));
        TryEnableDwmCornerAndTheme();
        if (!dwmRounded)
            Region = new Region(RoundedRect(new RectangleF(0, 0, Width, Height), S(12)));
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        CenterToScreen();
        animTimer.Start();
        probeTimer.Start();
        Refresh();
        // The parent silences Velopack only after this painted window is ready.
        if (!string.IsNullOrEmpty(config.ReadyFile))
        {
            try { File.WriteAllText(config.ReadyFile, "ready"); }
            catch { Close(); }
        }
    }

    private void ApplyTheme()
    {
        string t = (config.Theme ?? "light").Trim().ToLowerInvariant();
        if (t == "dark")
        {
            isDarkTheme = true;
            bgColor = Color.FromArgb(31, 31, 31);          // --bg: #1f1f1f
            cardColor = Color.FromArgb(45, 45, 45);        // --bg-card: #2d2d2d
            borderColor = Color.FromArgb(64, 64, 64);      // --border: #404040
            textColor = Color.FromArgb(224, 224, 224);     // --text: #e0e0e0
            text2Color = Color.FromArgb(187, 187, 187);    // --text-2: #bbb
            text3Color = Color.FromArgb(148, 148, 148);    // --text-3: #999
            accentColor = Color.FromArgb(76, 194, 255);    // --accent: #4cc2ff
            accentEndColor = Color.FromArgb(135, 216, 255);
            accentLightColor = Color.FromArgb(26, 58, 82); // --accent-light: #1a3a52
            trackColor = Color.FromArgb(56, 56, 56);       // --bg-input: #383838
            stepDoneColor = Color.FromArgb(72, 199, 142);
        }
        else if (t == "sand")
        {
            isDarkTheme = false;
            bgColor = Color.FromArgb(244, 242, 238);       // --bg: #f4f2ee
            cardColor = Color.FromArgb(252, 251, 249);     // --bg-card: #fcfbf9
            borderColor = Color.FromArgb(226, 221, 211);   // --border: #e2ddd3
            textColor = Color.FromArgb(43, 40, 36);        // --text: #2b2824
            text2Color = Color.FromArgb(79, 73, 66);       // --text-2: #4f4942
            text3Color = Color.FromArgb(115, 107, 97);     // --text-3: #736b61
            accentColor = Color.FromArgb(180, 83, 42);     // --accent: #b4532a
            accentEndColor = Color.FromArgb(224, 118, 68);
            accentLightColor = Color.FromArgb(246, 229, 220); // --accent-light: #f6e5dc
            trackColor = Color.FromArgb(235, 231, 223);
            stepDoneColor = Color.FromArgb(42, 140, 150);  // teal from RHFiles icon
        }
        else if (t == "mist")
        {
            isDarkTheme = false;
            bgColor = Color.FromArgb(238, 243, 244);       // --bg: #eef3f4
            cardColor = Color.FromArgb(249, 252, 252);     // --bg-card: #f9fcfc
            borderColor = Color.FromArgb(211, 223, 225);   // --border: #d3dfe1
            textColor = Color.FromArgb(30, 44, 46);        // --text: #1e2c2e
            text2Color = Color.FromArgb(64, 84, 87);       // --text-2: #405457
            text3Color = Color.FromArgb(98, 118, 121);     // --text-3: #627679
            accentColor = Color.FromArgb(22, 125, 134);    // --accent: #167d86
            accentEndColor = Color.FromArgb(52, 166, 176);
            accentLightColor = Color.FromArgb(215, 238, 240);
            trackColor = Color.FromArgb(226, 235, 237);
            stepDoneColor = Color.FromArgb(22, 125, 134);
        }
        else if (t == "forest")
        {
            isDarkTheme = true;
            bgColor = Color.FromArgb(20, 32, 27);          // --bg: #14201b
            cardColor = Color.FromArgb(28, 42, 35);        // --bg-card: #1c2a23
            borderColor = Color.FromArgb(52, 72, 60);      // --border: #34483c
            textColor = Color.FromArgb(237, 245, 239);     // --text: #edf5ef
            text2Color = Color.FromArgb(198, 216, 203);    // --text-2: #c6d8cb
            text3Color = Color.FromArgb(151, 173, 158);    // --text-3: #97ad9e
            accentColor = Color.FromArgb(115, 201, 145);   // --accent: #73c991
            accentEndColor = Color.FromArgb(155, 226, 180);
            accentLightColor = Color.FromArgb(39, 71, 56);
            trackColor = Color.FromArgb(36, 53, 44);
            stepDoneColor = Color.FromArgb(115, 201, 145);
        }
        else if (t == "slate")
        {
            isDarkTheme = true;
            bgColor = Color.FromArgb(23, 28, 37);          // --bg: #171c25
            cardColor = Color.FromArgb(32, 38, 49);        // --bg-card: #202631
            borderColor = Color.FromArgb(56, 67, 83);      // --border: #384353
            textColor = Color.FromArgb(238, 241, 246);     // --text: #eef1f6
            text2Color = Color.FromArgb(203, 210, 220);    // --text-2: #cbd2dc
            text3Color = Color.FromArgb(158, 168, 183);    // --text-3: #9ea8b7
            accentColor = Color.FromArgb(138, 169, 255);   // --accent: #8aa9ff
            accentEndColor = Color.FromArgb(174, 198, 255);
            accentLightColor = Color.FromArgb(45, 65, 107);
            trackColor = Color.FromArgb(41, 49, 62);
            stepDoneColor = Color.FromArgb(115, 201, 145);
        }
        else
        {
            isDarkTheme = false;
            bgColor = Color.FromArgb(243, 243, 243);       // --bg: #f3f3f3
            cardColor = Color.FromArgb(251, 251, 251);     // --bg-card: #fbfbfb
            borderColor = Color.FromArgb(224, 224, 224);   // --border: #e0e0e0
            textColor = Color.FromArgb(26, 26, 26);        // --text: #1a1a1a
            text2Color = Color.FromArgb(68, 68, 68);       // --text-2: #444
            text3Color = Color.FromArgb(112, 112, 112);    // --text-3: #666
            accentColor = Color.FromArgb(0, 120, 212);     // --accent: #0078d4
            accentEndColor = Color.FromArgb(64, 166, 245);
            accentLightColor = Color.FromArgb(204, 228, 247); // --accent-light: #cce4f7
            trackColor = Color.FromArgb(228, 230, 234);
            stepDoneColor = Color.FromArgb(40, 167, 69);
        }

        bgColor = ParseHexOrDefault(config.CustomBg, bgColor);
        cardColor = ParseHexOrDefault(config.CustomCard, cardColor);
        textColor = ParseHexOrDefault(config.CustomText, textColor);
        accentColor = ParseHexOrDefault(config.CustomAccent, accentColor);
        borderColor = ParseHexOrDefault(config.CustomBorder, borderColor);
        if (!string.IsNullOrEmpty(config.CustomText))
        {
            text2Color = Blend(textColor, cardColor, 0.78f);
            text3Color = Blend(textColor, cardColor, 0.65f);
        }
        if (!string.IsNullOrEmpty(config.CustomAccent))
        {
            accentEndColor = Blend(accentColor, textColor, 0.80f);
            accentLightColor = Blend(accentColor, cardColor, 0.15f);
        }
        trackColor = Blend(textColor, cardColor, 0.10f);
        BackColor = bgColor;
    }

    private static Color Blend(Color a, Color b, float mix)
    {
        return Color.FromArgb((int)(a.R * mix + b.R * (1f-mix)),
            (int)(a.G * mix + b.G * (1f-mix)), (int)(a.B * mix + b.B * (1f-mix)));
    }

    private static Color ParseHexOrDefault(string hex, Color fallback)
    {
        if (string.IsNullOrWhiteSpace(hex)) return fallback;
        try { return ColorTranslator.FromHtml(hex.Trim()); }
        catch { return fallback; }
    }

    private void LoadLogo()
    {
        try
        {
            if (!string.IsNullOrEmpty(config.LogoPath) && File.Exists(config.LogoPath))
            {
                if (config.LogoPath.EndsWith(".ico", StringComparison.OrdinalIgnoreCase))
                {
                    using (var ico = new Icon(config.LogoPath, new Size(256, 256)))
                    {
                        Icon = (Icon)ico.Clone();
                        logoImage = ico.ToBitmap();
                    }
                }
                else
                {
                    using (var fs = new FileStream(config.LogoPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        using (var image = Image.FromStream(fs)) logoImage = new Bitmap(image);
                    using (var bitmap = new Bitmap(logoImage))
                    {
                        IntPtr handle = bitmap.GetHicon();
                        try { using (var icon = Icon.FromHandle(handle)) Icon = (Icon)icon.Clone(); }
                        finally { DestroyIcon(handle); }
                    }
                }
            }
        }
        catch { }
    }

    private void TryEnableDwmCornerAndTheme()
    {
        try
        {
            int dark = isDarkTheme ? 1 : 0;
            DwmSetWindowAttribute(Handle, 20, ref dark, 4);
            int corner = 2;
            int hr = DwmSetWindowAttribute(Handle, 33, ref corner, 4);
            dwmRounded = (hr == 0);
        }
        catch { dwmRounded = false; }
    }

    private static float StageBaseProgress(int s)
    {
        switch (s)
        {
            case 0: return 0.14f;
            case 1: return 0.36f;
            case 2: return 0.68f;
            default: return 0.90f;
        }
    }

    private string StageLabel()
    {
        if (failure != null) return failure;
        switch (stage)
        {
            case 0: return L("正在关闭当前窗口并释放文件…", "Closing the current window and releasing files…");
            case 1: return L("正在解压新版本程序与随包工具…", "Unpacking the application and bundled tools…");
            case 2: return L("正在应用新版本…", "Applying the new version…");
            default: return L("正在等待新版本窗口…", "Waiting for the new application window…");
        }
    }

    private void OnAnimateTick(object sender, EventArgs e)
    {
        shimmerPhase += 0.028f;
        if (shimmerPhase > 1.4f) shimmerPhase = -0.4f;

        if (config.DemoMs > 0 && string.IsNullOrEmpty(config.ScreenshotPath))
        {
            float ratio = Math.Min(1f, (float)elapsed.ElapsedMilliseconds / Math.Max(1000, config.DemoMs));
            stage = ratio < 0.42f ? 1 : (ratio < 0.78f ? 2 : 3);
            targetProgress = Math.Min(1f, 0.14f + ratio * 0.86f);
            displayProgress += (targetProgress - displayProgress) * 0.12f;
        }
        else if (config.DemoMs == 0 && string.IsNullOrEmpty(config.ScreenshotPath) && failure == null)
        {
            // This is a phase indicator, not a made-up byte percentage.
            displayProgress += (targetProgress - displayProgress) * 0.12f;
        }

        Invalidate();

        if (!screenshotSaved && !string.IsNullOrEmpty(config.ScreenshotPath) && elapsed.ElapsedMilliseconds >= 120)
        {
            screenshotSaved = true;
            SaveSnapshot(config.ScreenshotPath);
            if (config.DemoMs <= 0) { Close(); return; }
        }
        if (config.DemoMs > 0 && elapsed.ElapsedMilliseconds >= config.DemoMs)
            Close();
    }

    private void OnProbeTick(object sender, EventArgs e)
    {
        try { ProbeUpdate(); }
        catch { Fail(L("无法确认更新状态，请重新打开 RHFiles 查看诊断。", "Cannot confirm update status. Reopen RHFiles for diagnostics.")); }
    }

    private void ProbeUpdate()
    {
        if (config.DemoMs > 0 || !string.IsNullOrEmpty(config.ScreenshotPath)) return;
        if (failure != null) return;
        if (elapsed.ElapsedMilliseconds > config.TimeoutMs)
        {
            Fail(L("尚未检测到新窗口，请重新打开 RHFiles 查看更新诊断。", "No new window detected. Reopen RHFiles to view update diagnostics.")); return;
        }

        if (PreviousProcessAlive()) { stage = 0; return; }
        if (stage < 1) { stage = 1; targetProgress = Math.Max(targetProgress, StageBaseProgress(1)); }

        if (!string.IsNullOrEmpty(config.RootDir))
        {
            try
            {
                string veloTemp = Path.Combine(config.RootDir, "packages", "VelopackTemp");
                if (Directory.Exists(veloTemp))
                {
                    int subDirs = Directory.GetDirectories(veloTemp).Length;
                    if (subDirs >= 1) sawTempDir = true;
                    if (subDirs >= 2 || (sawTempDir && subDirs == 0)) sawSwapOrMultipleTemp = true;
                }
                else if (sawTempDir) sawSwapOrMultipleTemp = true;
            }
            catch { }
        }

        if (sawSwapOrMultipleTemp && stage < 2)
        {
            stage = 2;
            targetProgress = Math.Max(targetProgress, StageBaseProgress(2));
        }

        ObserveUpdater();
        if (updater != null && updater.HasExited)
        {
            if (updater.ExitCode != 0)
            {
                Fail(L("更新失败（退出码 ", "Update failed (exit code ") + updater.ExitCode + L("）。请重新打开 RHFiles 查看诊断。", "). Reopen RHFiles for diagnostics.")); return;
            }
            if (stage < 3) { stage = 3; targetProgress = Math.Max(targetProgress, StageBaseProgress(3)); }
            if (updateExeExitedAt == null) updateExeExitedAt = DateTime.UtcNow;
        }

        IntPtr newMainWindow = FindNewMainWindow();
        if (newMainWindow != IntPtr.Zero)
        {
            displayProgress = 1f;
            Invalidate(); Update();
            try { SetForegroundWindow(newMainWindow); } catch { }
            Close();
            return;
        }

        if (updateExeExitedAt != null)
        {
            double sinceExitMs = (DateTime.UtcNow - updateExeExitedAt.Value).TotalMilliseconds;
            if (sinceExitMs >= 30000)
                Fail(L("安装程序已退出，但未检测到新窗口。请重新打开 RHFiles。", "Installer exited, but no new window appeared. Reopen RHFiles."));
        }
    }

    private void Fail(string message)
    {
        failure = message;
        Text = config.Title + L(" · 请检查更新", " · Check update");
        probeTimer.Stop(); animTimer.Stop(); Invalidate();
    }

    private bool PreviousProcessAlive()
    {
        // Hold the original process handle: PID reuse must not hold the window open.
        try { return previousProcess != null && !previousProcess.HasExited; }
        catch { return false; }
    }

    private void ObserveUpdater()
    {
        if (updater != null) return;
        try
        {
            var procs = Process.GetProcessesByName("Update");
            try
            {
                foreach (var p in procs)
                {
                    try
                    {
                        if (p.HasExited) continue;
                        string path = p.MainModule != null ? p.MainModule.FileName : null;
                        if (SamePath(path, Path.Combine(config.RootDir, "Update.exe")) && p.StartTime.ToUniversalTime() >= launchedAt.AddSeconds(-1))
                        {
                            updater = Process.GetProcessById(p.Id);
                            var handle = updater.Handle; // Retain the handle before the process exits.
                            break;
                        }
                    }
                    catch { }
                }
            }
            finally { foreach (var p in procs) p.Dispose(); }
        }
        catch { }
    }

    private string TargetProcessName()
    {
        string name = config.MainExe ?? "RHFiles";
        return name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name.Substring(0, name.Length - 4) : name;
    }

    private static bool SamePath(string first, string second)
    {
        try { return !string.IsNullOrEmpty(first) && string.Equals(Path.GetFullPath(first), Path.GetFullPath(second), StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }

    private IntPtr FindNewMainWindow()
    {
        try
        {
            int selfPid = Process.GetCurrentProcess().Id;
            var procs = Process.GetProcessesByName(TargetProcessName());
            try
            {
                foreach (var p in procs)
                {
                    try
                    {
                        if (p.Id == config.WaitPid || p.Id == selfPid || p.HasExited) continue;
                        if (p.StartTime.ToUniversalTime() < launchedAt) continue;
                        string path = p.MainModule == null ? null : p.MainModule.FileName;
                        if (!SamePath(path, Path.Combine(config.RootDir, "current", config.MainExe))) continue;
                        IntPtr hwnd = p.MainWindowHandle;
                        if (hwnd != IntPtr.Zero && IsWindowVisible(hwnd)) return hwnd;
                    }
                    catch { }
                }
            }
            finally { foreach (var p in procs) p.Dispose(); }
        }
        catch { }
        return IntPtr.Zero;
    }

    private void SaveSnapshot(string path)
    {
        try
        {
            string dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            using (var bmp = new Bitmap(ClientSize.Width, ClientSize.Height, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bmp))
                    RenderSurface(g, new Rectangle(0, 0, bmp.Width, bmp.Height), true);
                bmp.Save(path, ImageFormat.Png);
            }
        }
        catch { }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        RenderSurface(e.Graphics, ClientRectangle, false);
    }

    private void RenderSurface(Graphics g, Rectangle bounds, bool forSnapshot)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;

        g.Clear(bgColor);

        // Card container matching RHFiles .dialog-box / --bg-card
        var cardRect = new RectangleF(S(14), S(14), bounds.Width - S(28), bounds.Height - S(28));
        using (var cardPath = RoundedRect(cardRect, S(10)))
        using (var cardBrush = new SolidBrush(cardColor))
        using (var cardBorderPen = new Pen(borderColor, 1f))
        {
            g.FillPath(cardBrush, cardPath);
            g.DrawPath(cardBorderPen, cardPath);
        }

        // Top-left icon
        var logoRect = new RectangleF(S(28), S(26), S(46), S(46));
        DrawLogo(g, logoRect);

        float textLeft = S(86);
        using (var titleFont = CreateFont(13.5f, FontStyle.Bold))
        using (var badgeFont = CreateFont(8.5f, FontStyle.Bold))
        using (var tagFont = CreateFont(8f, FontStyle.Regular))
        using (var statusFont = CreateFont(9f, FontStyle.Regular))
        using (var stepFont = CreateFont(8f, FontStyle.Regular))
        using (var footerFont = CreateFont(8f, FontStyle.Regular))
        using (var textBrush = new SolidBrush(textColor))
        using (var text2Brush = new SolidBrush(text2Color))
        using (var text3Brush = new SolidBrush(text3Color))
        {
            g.DrawString(config.Title, titleFont, textBrush, new PointF(textLeft, S(24)));
            SizeF titleSize = g.MeasureString(config.Title, titleFont);

            string badgeText = BuildVersionBadge();
            if (!string.IsNullOrEmpty(badgeText))
            {
                SizeF badgeSize = g.MeasureString(badgeText, badgeFont);
                var badgeRect = new RectangleF(textLeft + titleSize.Width + S(6), S(27), badgeSize.Width + S(12), S(20));
                using (var badgePath = RoundedRect(badgeRect, S(5)))
                using (var bFill = new SolidBrush(accentLightColor))
                using (var bText = new SolidBrush(accentColor))
                {
                    g.FillPath(bFill, badgePath);
                    using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                        g.DrawString(badgeText, badgeFont, bText, badgeRect, sf);
                }
            }

            // Right-aligned theme/mode tag
            string modeLabel = config.Mode == "portable" ? L("Portable 原地更新", "Portable update") : L("正在安装更新", "Installing update");
            SizeF modeSize = g.MeasureString(modeLabel, tagFont);
            g.DrawString(modeLabel, tagFont, text3Brush, new PointF(bounds.Width - S(28) - modeSize.Width, S(30)));

            // Current stage subtitle
            using (var labelFormat = new StringFormat { Trimming = StringTrimming.EllipsisCharacter })
                g.DrawString(StageLabel(), statusFont, text2Brush, new RectangleF(textLeft, S(51), bounds.Width-textLeft-S(28), S(30)), labelFormat);

            // 3-step visual node strip
            int currentStep = stage <= 1 ? 1 : (stage == 2 ? 2 : 3);
            string[] stepNames = new[] { L("1. 解压程序与工具", "1. Unpack files"), L("2. 应用新版本", "2. Apply update"), L("3. 重启恢复窗口", "3. Restore window") };
            float stripY = S(84);
            float stripX = S(28);
            for (int i = 0; i < 3; i++)
            {
                int idx = i + 1;
                bool done = idx < currentStep;
                bool active = idx == currentStep;
                string label = (done ? "✓ " : "● ") + stepNames[i];
                SizeF sz = g.MeasureString(label, stepFont);
                var pillRect = new RectangleF(stripX, stripY, sz.Width + S(10), S(18));
                if (active)
                {
                    using (var pPath = RoundedRect(pillRect, S(4)))
                    using (var pFill = new SolidBrush(accentLightColor))
                        g.FillPath(pFill, pPath);
                }
                using (var sBrush = new SolidBrush(done ? stepDoneColor : (active ? accentColor : text3Color)))
                {
                    using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                        g.DrawString(label, stepFont, sBrush, pillRect, sf);
                }
                stripX += pillRect.Width + S(10);
            }

            // Progress bar track
            float barX = S(28);
            float barY = S(112);
            float barW = bounds.Width - S(56);
            float barH = S(6);
            var trackRect = new RectangleF(barX, barY, barW, barH);
            using (var trackPath = RoundedRect(trackRect, barH / 2f))
            using (var trackBrush = new SolidBrush(trackColor))
            {
                g.FillPath(trackBrush, trackPath);
            }

            // Active progress bar + shimmer
            float fillW = Math.Max(barH * 2f, barW * Math.Max(0.08f, Math.Min(1f, displayProgress)));
            var fillRect = new RectangleF(barX, barY, fillW, barH);
            using (var fillPath = RoundedRect(fillRect, barH / 2f))
            using (var fillBrush = new LinearGradientBrush(new PointF(barX, barY), new PointF(barX + fillW, barY), accentColor, accentEndColor))
            {
                g.FillPath(fillBrush, fillPath);
                float shimmerCenter = barX + fillW * Math.Max(0f, Math.Min(1f, shimmerPhase));
                float shimmerHalf = Math.Max(S(24), fillW * 0.28f);
                var oldClip = g.Clip;
                g.SetClip(fillPath);
                var shimmerRect = new RectangleF(shimmerCenter - shimmerHalf, barY - 1, shimmerHalf * 2f, barH + 2);
                using (var shimmerBrush = new LinearGradientBrush(shimmerRect, Color.FromArgb(0, 255, 255, 255), Color.FromArgb(110, 255, 255, 255), LinearGradientMode.Horizontal))
                {
                    shimmerBrush.InterpolationColors = new ColorBlend(3)
                    {
                        Colors = new[] { Color.FromArgb(0, 255, 255, 255), Color.FromArgb(105, 255, 255, 255), Color.FromArgb(0, 255, 255, 255) },
                        Positions = new[] { 0f, 0.5f, 1f }
                    };
                    g.FillRectangle(shimmerBrush, shimmerRect);
                }
                g.Clip = oldClip;
                oldClip.Dispose();
            }

            // Footer row
            float footerY = S(132);
            g.DrawString(L("保留标签页、收藏夹与设备组", "Tabs, bookmarks and device groups are preserved"), footerFont, text3Brush, new PointF(S(28), footerY));

            int secs = (int)elapsed.Elapsed.TotalSeconds;
            if (!string.IsNullOrEmpty(config.ScreenshotPath)) secs = stage <= 1 ? 1 : (stage == 2 ? 3 : 5);
            string rightText = failure != null ? L("关闭提示 ×", "Dismiss ×") : string.Format(L("阶段 {0}/3 · {1:00}:{2:00}", "Stage {0}/3 · {1:00}:{2:00}"), currentStep, secs / 60, secs % 60);
            using (var rightFormat = new StringFormat { Alignment = StringAlignment.Far })
                g.DrawString(rightText, footerFont, text3Brush, new PointF(bounds.Width - S(28), footerY), rightFormat);
        }

        // Outer window border
        var outerRect = new RectangleF(0.5f, 0.5f, bounds.Width - 1f, bounds.Height - 1f);
        using (var borderPen = new Pen(borderColor, 1f))
        {
            if (dwmRounded && !forSnapshot)
                g.DrawRectangle(borderPen, 0, 0, bounds.Width - 1, bounds.Height - 1);
            else
            {
                using (var borderPath = RoundedRect(outerRect, S(12)))
                    g.DrawPath(borderPen, borderPath);
            }
        }
    }

    private void DrawLogo(Graphics g, RectangleF rect)
    {
        if (logoImage != null)
        {
            g.DrawImage(logoImage, rect);
            return;
        }
        // Fallback vector RHFiles icon (folder with orange tab & teal wave)
        using (var tabPath = RoundedRect(new RectangleF(rect.X + rect.Width * 0.08f, rect.Y + rect.Height * 0.14f, rect.Width * 0.42f, rect.Height * 0.28f), rect.Width * 0.08f))
        using (var tabBrush = new SolidBrush(Color.FromArgb(232, 108, 44)))
            g.FillPath(tabBrush, tabPath);
        using (var bodyPath = RoundedRect(new RectangleF(rect.X + rect.Width * 0.06f, rect.Y + rect.Height * 0.26f, rect.Width * 0.88f, rect.Height * 0.62f), rect.Width * 0.14f))
        using (var bodyBrush = new SolidBrush(Color.FromArgb(250, 245, 232)))
        using (var bodyPen = new Pen(Color.FromArgb(42, 44, 48), 2f))
        {
            g.FillPath(bodyBrush, bodyPath);
            g.DrawPath(bodyPen, bodyPath);
        }
    }

    private string BuildVersionBadge()
    {
        if (!string.IsNullOrEmpty(config.FromVersion) && !string.IsNullOrEmpty(config.ToVersion) && config.FromVersion != config.ToVersion)
            return "v" + config.FromVersion + " → v" + config.ToVersion;
        if (!string.IsNullOrEmpty(config.ToVersion))
            return "v" + config.ToVersion;
        return L("版本升级", "Update");
    }

    private static Font CreateFont(float sizePt, FontStyle style)
    {
        try { return new Font("Microsoft YaHei UI", sizePt, style, GraphicsUnit.Point); }
        catch { return new Font(SystemFonts.MessageBoxFont.FontFamily, sizePt, style, GraphicsUnit.Point); }
    }

    private int S(float logical)
    {
        return (int)Math.Round(logical * scale);
    }

    private static GraphicsPath RoundedRect(RectangleF r, float radius)
    {
        float d = Math.Min(Math.Min(r.Width, r.Height), radius * 2f);
        var path = new GraphicsPath();
        if (d <= 0.5f) { path.AddRectangle(r); return path; }
        path.AddArc(r.X, r.Y, d, d, 180, 90);
        path.AddArc(r.Right - d, r.Y, d, d, 270, 90);
        path.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
        path.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button == MouseButtons.Left)
        {
            if (failure != null && e.Y >= S(124)) { Close(); return; }
            ReleaseCapture();
            SendMessage(Handle, 0xA1, 0x2, 0);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            animTimer.Dispose(); probeTimer.Dispose();
            if (logoImage != null) logoImage.Dispose();
            if (previousProcess != null) previousProcess.Dispose();
            if (updater != null) updater.Dispose();
        }
        base.Dispose(disposing);
    }
}
