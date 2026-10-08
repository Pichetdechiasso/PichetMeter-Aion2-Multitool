# PichetMeter — module Windows
# Détection du client de jeu, serveur auquel il est connecté, position de sa fenêtre,
# capture d'une zone de l'écran et lecture du texte (OCR intégré à Windows).
# Aucune lecture de la mémoire du jeu.
# Protocole : une commande JSON par ligne sur l'entrée standard, une réponse JSON par ligne en sortie.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class A2Helper
{
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hWnd, out RECT r);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr hWnd, ref POINT p);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("shell32.dll")] static extern int SHQueryUserNotificationState(out int state);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int cls, out int info, int len, out int retLen);
    [DllImport("iphlpapi.dll")] static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool order, int af, int tableClass, uint reserved);

    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

    public static void Init() { try { SetProcessDPIAware(); } catch { } }

    // Client du jeu : AION2.exe (le lanceur AION2Launcher.exe et les outils tiers sont ignorés).
    // « prefere » : nom de processus imposé dans les paramètres (vide = automatique).
    static readonly string[] Exclus = { "launcher", "companion", "dps", "meter", "flex", "tool", "overlay", "hud", "helper", "crash", "report", "updat", "setup", "install", "patch" };

    public static int FindGame(string prefere)
    {
        int me = Process.GetCurrentProcess().Id;
        Process[] all = Process.GetProcesses();
        string voulu = string.IsNullOrEmpty(prefere) ? "aion2" : prefere.Trim().ToLowerInvariant();
        if (voulu.EndsWith(".exe")) voulu = voulu.Substring(0, voulu.Length - 4);
        // Plusieurs processus peuvent porter ce nom (client, sous-processus) : on garde celui qui est
        // au premier plan, sinon celui qui possède la plus grande fenêtre visible.
        int fg = ForegroundPid(), premier = 0, grand = 0;
        long grandA = 0;
        foreach (Process p in all)
        {
            try
            {
                if (p.Id == me || p.ProcessName.ToLowerInvariant() != voulu) continue;
                if (p.Id == fg) return p.Id;
                if (premier == 0) premier = p.Id;
                long a = WindowArea(p.Id);
                if (a > grandA) { grandA = a; grand = p.Id; }
            }
            catch { }
        }
        if (grand != 0) return grand;
        if (premier != 0) return premier;
        if (!string.IsNullOrEmpty(prefere)) return 0;
        int best = 0;
        long bestA = 0;
        foreach (Process p in all)
        {
            try
            {
                string n = p.ProcessName.ToLowerInvariant();
                if (p.Id == me || !n.StartsWith("aion")) continue;
                bool exclu = false;
                foreach (string x in Exclus) { if (n.Contains(x)) { exclu = true; break; } }
                if (exclu) continue;
                long a = WindowArea(p.Id);
                if (a > bestA) { bestA = a; best = p.Id; }
            }
            catch { }
        }
        return best;
    }

    public static string GameName(int pid)
    {
        try { return Process.GetProcessById(pid).ProcessName + ".exe"; } catch { return null; }
    }

    // 3 = application Direct3D en plein écran exclusif (rien ne peut s'afficher par-dessus)
    public static int NotificationState()
    {
        try { int s; if (SHQueryUserNotificationState(out s) == 0) return s; } catch { }
        return 0;
    }

    // 1 = jeu lancé en administrateur (ou protégé : ses droits ne sont pas lisibles), 0 = non, -1 = inconnu.
    // Windows empêche alors un programme non administrateur de lui envoyer des touches ou de voir son clavier.
    public static int GameElevated(int pid)
    {
        if (pid == 0) return -1;
        IntPtr p = OpenProcess(0x1000, false, pid);
        if (p == IntPtr.Zero) return 1;
        try
        {
            IntPtr t;
            if (!OpenProcessToken(p, 0x0008, out t)) return 1;
            try { int e, n; if (GetTokenInformation(t, 20, out e, 4, out n)) return e != 0 ? 1 : 0; return -1; }
            finally { CloseHandle(t); }
        }
        finally { CloseHandle(p); }
    }

    public static int ForegroundPid()
    {
        uint pid;
        GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        return (int)pid;
    }

    static IntPtr bestWindow;
    static long bestArea;
    static uint targetPid;
    static EnumProc visitor = new EnumProc(Visit);

    static bool Visit(IntPtr hWnd, IntPtr lParam)
    {
        uint pid;
        GetWindowThreadProcessId(hWnd, out pid);
        if (pid != targetPid || !IsWindowVisible(hWnd) || IsIconic(hWnd)) return true;
        RECT r;
        GetClientRect(hWnd, out r);
        long area = (long)(r.Right - r.Left) * (long)(r.Bottom - r.Top);
        if (area > bestArea) { bestArea = area; bestWindow = hWnd; }
        return true;
    }

    static long WindowArea(int pid)
    {
        bestWindow = IntPtr.Zero; bestArea = 0; targetPid = (uint)pid;
        EnumWindows(visitor, IntPtr.Zero);
        return bestArea;
    }

    // Zone cliente de la plus grande fenêtre visible du jeu, en pixels physiques : x, y, largeur, hauteur
    public static int[] GameRect(int pid)
    {
        bestWindow = IntPtr.Zero; bestArea = 0; targetPid = (uint)pid;
        EnumWindows(visitor, IntPtr.Zero);
        if (bestWindow == IntPtr.Zero) return null;
        RECT r;
        GetClientRect(bestWindow, out r);
        POINT p = new POINT();
        ClientToScreen(bestWindow, ref p);
        return new int[] { p.X, p.Y, r.Right - r.Left, r.Bottom - r.Top };
    }

    // Adresse distante la plus utilisée par le jeu (hors web), ex. "203.0.113.5:7777"
    public static string GameRemote(int pid)
    {
        int size = 0;
        GetExtendedTcpTable(IntPtr.Zero, ref size, false, 2, 5, 0);
        if (size <= 0) return null;
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try
        {
            if (GetExtendedTcpTable(buffer, ref size, false, 2, 5, 0) != 0) return null;
            int count = Marshal.ReadInt32(buffer);
            Dictionary<string, int> seen = new Dictionary<string, int>();
            for (int i = 0; i < count; i++)
            {
                IntPtr row = new IntPtr(buffer.ToInt64() + 4 + (long)i * 24);
                int state = Marshal.ReadInt32(row, 0);
                uint remote = (uint)Marshal.ReadInt32(row, 12);
                int rawPort = Marshal.ReadInt32(row, 16);
                int owner = Marshal.ReadInt32(row, 20);
                if (owner != pid || state != 5) continue;
                int port = ((rawPort & 0xFF) << 8) | ((rawPort >> 8) & 0xFF);
                if (port == 80 || port == 443 || remote == 0 || (remote & 0xFF) == 127) continue;
                string key = string.Format("{0}.{1}.{2}.{3}:{4}", remote & 0xFF, (remote >> 8) & 0xFF, (remote >> 16) & 0xFF, (remote >> 24) & 0xFF, port);
                int c;
                seen.TryGetValue(key, out c);
                seen[key] = c + 1;
            }
            string best = null;
            int bestCount = 0;
            foreach (KeyValuePair<string, int> kv in seen)
            {
                if (kv.Value > bestCount) { bestCount = kv.Value; best = kv.Key; }
            }
            return best;
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    // Capture d'une zone de l'écran, agrandie pour l'OCR, en PNG
    public static byte[] Capture(int x, int y, int w, int h, int scale, bool gray)
    {
        if (w < 1 || h < 1) return null;
        if (scale < 1) scale = 1;
        using (Bitmap src = new Bitmap(w, h, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(src)) { g.CopyFromScreen(x, y, 0, 0, new Size(w, h)); }
            int W = w * scale, H = h * scale;
            using (Bitmap dst = new Bitmap(W, H, PixelFormat.Format32bppArgb))
            {
                using (Graphics g2 = Graphics.FromImage(dst))
                {
                    g2.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g2.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    if (gray)
                    {
                        ColorMatrix m = new ColorMatrix(new float[][] {
                            new float[] { 0.30f, 0.30f, 0.30f, 0, 0 },
                            new float[] { 0.59f, 0.59f, 0.59f, 0, 0 },
                            new float[] { 0.11f, 0.11f, 0.11f, 0, 0 },
                            new float[] { 0, 0, 0, 1, 0 },
                            new float[] { 0, 0, 0, 0, 1 } });
                        using (ImageAttributes a = new ImageAttributes())
                        {
                            a.SetColorMatrix(m);
                            g2.DrawImage(src, new Rectangle(0, 0, W, H), 0, 0, w, h, GraphicsUnit.Pixel, a);
                        }
                    }
                    else
                    {
                        g2.DrawImage(src, new Rectangle(0, 0, W, H), 0, 0, w, h, GraphicsUnit.Pixel);
                    }
                }
                using (MemoryStream ms = new MemoryStream())
                {
                    dst.Save(ms, ImageFormat.Png);
                    return ms.ToArray();
                }
            }
        }
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing
[A2Helper]::Init()

function Send($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 5))
    [Console]::Out.Flush()
}

# ── OCR Windows (Windows.Media.Ocr) ──
$ocrEngine = $null
$ocrError = $null
$awaitMethod = $null
try {
    $null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime]
    $awaitMethod = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
    $ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
    if ($null -eq $ocrEngine) { $ocrError = "Aucune langue de reconnaissance de texte installée dans Windows." }
}
catch { $ocrError = "OCR Windows indisponible : " + $_.Exception.Message }

function Await($operation, [Type]$type) {
    $task = $awaitMethod.MakeGenericMethod($type).Invoke($null, @($operation))
    $null = $task.Wait(-1)
    $task.Result
}

$tempPng = Join-Path ([System.IO.Path]::GetTempPath()) ("a2hud-ocr-" + $PID + ".png")

function Read-Zone($rect, [int]$scale) {
    $png = [A2Helper]::Capture([int]$rect[0], [int]$rect[1], [int]$rect[2], [int]$rect[3], $scale, $true)
    if ($null -eq $png) { return "" }
    [System.IO.File]::WriteAllBytes($tempPng, $png)
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($tempPng)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($ocrEngine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $lines = @()
        foreach ($line in $result.Lines) { $lines += $line.Text }
        return ($lines -join ' ')
    }
    finally { $stream.Dispose() }
}

Send @{ type = 'ready'; ocr = ($null -ne $ocrEngine); ocrError = $ocrError; lang = $(if ($ocrEngine) { $ocrEngine.RecognizerLanguage.LanguageTag } else { $null }) }

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim() -eq '') { continue }
    $cmd = $null
    try {
        $cmd = $line | ConvertFrom-Json
        switch ($cmd.cmd) {
            'status' {
                $prefere = ''
                if ($cmd.name) { $prefere = [string]$cmd.name }
                $game = [A2Helper]::FindGame($prefere)
                $out = @{ type = 'status'; id = $cmd.id; game = ($game -ne 0); pid = $game; name = $null; fg = $false; remote = $null; rect = $null; qns = [A2Helper]::NotificationState(); fgpid = [A2Helper]::ForegroundPid() }
                $out.fgname = [A2Helper]::GameName($out.fgpid)
                if ($game -ne 0) {
                    $out.name = [A2Helper]::GameName($game)
                    $out.fg = ([A2Helper]::ForegroundPid() -eq $game)
                    $out.remote = [A2Helper]::GameRemote($game)
                    $out.rect = [A2Helper]::GameRect($game)
                    $out.elev = [A2Helper]::GameElevated($game)
                }
                Send $out
            }
            'fg' {
                Send @{ type = 'fg'; id = $cmd.id; fgpid = [A2Helper]::ForegroundPid() }
            }
            'ocr' {
                if ($null -eq $ocrEngine) { Send @{ type = 'ocr'; id = $cmd.id; error = $ocrError }; break }
                $texts = @()
                foreach ($r in $cmd.rects) {
                    if ($null -eq $r) { $texts += $null } else { $texts += (Read-Zone $r ([int]$cmd.scale)) }
                }
                Send @{ type = 'ocr'; id = $cmd.id; texts = $texts }
            }
            'capture' {
                $r = $cmd.rect
                $png = [A2Helper]::Capture([int]$r[0], [int]$r[1], [int]$r[2], [int]$r[3], 1, $false)
                $b64 = $null
                if ($png) { $b64 = [Convert]::ToBase64String($png) }
                Send @{ type = 'capture'; id = $cmd.id; png = $b64 }
            }
            'quit' { exit 0 }
            default { Send @{ type = 'error'; id = $cmd.id; error = "Commande inconnue" } }
        }
    }
    catch {
        $id = $null
        if ($cmd) { $id = $cmd.id }
        Send @{ type = 'error'; id = $id; error = $_.Exception.Message }
    }
}
Remove-Item -LiteralPath $tempPng -ErrorAction SilentlyContinue
