# PichetMeter — viseur en mode compatibilité
# Fenêtre Windows native (couche transparente, toujours au premier plan, clics traversants),
# dessinée avec GDI+ : utile si la fenêtre Electron du viseur reste invisible sur une configuration.
# Commandes sur l'entrée standard :
#   cfg cle=valeur;cle=valeur   apparence (shape, color, thick, len, gap, dot, radius, outline, outlineColor, outlineW, opacity)
#   show X Y                    centre du viseur en pixels physiques
#   hide | quit

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

public static class A2Viseur
{
    delegate IntPtr WndProc(IntPtr h, uint msg, IntPtr w, IntPtr l);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WNDCLASSEX
    {
        public uint cbSize; public uint style; public WndProc lpfnWndProc; public int cbClsExtra; public int cbWndExtra;
        public IntPtr hInstance; public IntPtr hIcon; public IntPtr hCursor; public IntPtr hbrBackground;
        public string lpszMenuName; public string lpszClassName; public IntPtr hIconSm;
    }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
    [StructLayout(LayoutKind.Sequential, Pack = 1)] struct BLENDFUNCTION { public byte BlendOp, BlendFlags, SourceConstantAlpha, AlphaFormat; }
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; public uint lPrivate; }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern ushort RegisterClassEx(ref WNDCLASSEX wc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateWindowEx(uint exStyle, string cls, string name, uint style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr param);
    [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG m);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG m);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll")] static extern bool UpdateLayeredWindow(IntPtr h, IntPtr hdcDst, ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc, ref POINT pptSrc, uint crKey, ref BLENDFUNCTION pblend, uint flags);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr h);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr h, IntPtr dc);
    [DllImport("user32.dll")] static extern UIntPtr SetTimer(IntPtr h, UIntPtr id, uint ms, IntPtr fn);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr obj);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);

    const uint WS_POPUP = 0x80000000;
    const uint WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x8000000, WS_EX_TOPMOST = 0x8;
    const uint WM_APP = 0x8000, WM_TIMER = 0x113;
    const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
    static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    const int T = 300;

    static WndProc proc = new WndProc(Procedure);
    static IntPtr hwnd = IntPtr.Zero;
    static uint fil;
    static readonly object verrou = new object();
    static readonly Queue<string> file = new Queue<string>();
    static readonly ManualResetEvent pret = new ManualResetEvent(false);
    static bool visible;
    static int cx = -1, cy = -1;
    static Dictionary<string, string> cfg = new Dictionary<string, string>();

    static IntPtr Procedure(IntPtr h, uint msg, IntPtr w, IntPtr l)
    {
        if (msg == WM_TIMER && visible) SetWindowPos(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        return DefWindowProc(h, msg, w, l);
    }

    public static void Demarrer()
    {
        Thread t = new Thread(Boucle);
        t.IsBackground = true;
        t.Start();
        pret.WaitOne(5000);
    }

    static void Boucle()
    {
        try { SetProcessDPIAware(); } catch { }
        fil = GetCurrentThreadId();
        WNDCLASSEX wc = new WNDCLASSEX();
        wc.cbSize = (uint)Marshal.SizeOf(typeof(WNDCLASSEX));
        wc.lpfnWndProc = proc;
        wc.hInstance = GetModuleHandle(null);
        wc.lpszClassName = "A2HudViseur";
        RegisterClassEx(ref wc);
        hwnd = CreateWindowEx(WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST,
            "A2HudViseur", "PichetMeter · viseur", WS_POPUP, 0, 0, T, T, IntPtr.Zero, IntPtr.Zero, wc.hInstance, IntPtr.Zero);
        SetTimer(hwnd, new UIntPtr(1), 1000, IntPtr.Zero);
        pret.Set();
        MSG m;
        while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0)
        {
            if (m.hwnd == IntPtr.Zero && m.message == WM_APP) { Traiter(); continue; }
            TranslateMessage(ref m);
            DispatchMessage(ref m);
        }
    }

    public static void Commande(string ligne)
    {
        lock (verrou) file.Enqueue(ligne);
        PostThreadMessage(fil, WM_APP, IntPtr.Zero, IntPtr.Zero);
    }

    static void Traiter()
    {
        while (true)
        {
            string l;
            lock (verrou) { if (file.Count == 0) return; l = file.Dequeue(); }
            try { Executer(l); } catch { }
        }
    }

    static void Executer(string l)
    {
        if (l.StartsWith("cfg "))
        {
            Dictionary<string, string> n = new Dictionary<string, string>();
            foreach (string p in l.Substring(4).Split(';'))
            {
                int i = p.IndexOf('=');
                if (i > 0) n[p.Substring(0, i).Trim()] = p.Substring(i + 1).Trim();
            }
            cfg = n;
            if (visible) Dessiner();
        }
        else if (l.StartsWith("show "))
        {
            string[] p = l.Split(' ');
            cx = int.Parse(p[1], CultureInfo.InvariantCulture);
            cy = int.Parse(p[2], CultureInfo.InvariantCulture);
            visible = true;
            Dessiner();
            SetWindowPos(hwnd, HWND_TOPMOST, cx - T / 2, cy - T / 2, T, T, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
        else if (l == "hide")
        {
            visible = false;
            ShowWindow(hwnd, 0);
        }
    }

    static int Entier(string k, int defaut)
    {
        string v; double d;
        if (cfg.TryGetValue(k, out v) && double.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out d)) return (int)Math.Round(d);
        return defaut;
    }
    static Color Couleur(string k, Color defaut)
    {
        string v;
        if (!cfg.TryGetValue(k, out v) || v.Length != 7 || v[0] != '#') return defaut;
        try { return Color.FromArgb(255, Convert.ToInt32(v.Substring(1, 2), 16), Convert.ToInt32(v.Substring(3, 2), 16), Convert.ToInt32(v.Substring(5, 2), 16)); }
        catch { return defaut; }
    }

    static void Formes(Graphics g, Color c, int extra, string forme, int th, int len, int gap, int dot, int r)
    {
        int m = T / 2;
        using (SolidBrush b = new SolidBrush(c))
        {
            if ((forme == "cross" || forme == "crossdot" || forme == "t") && len > 0)
            {
                int x0 = m - th / 2 - extra, w = th + 2 * extra;
                if (forme != "t") g.FillRectangle(b, x0, m - gap - len - extra, w, len + 2 * extra);
                g.FillRectangle(b, x0, m + gap - extra, w, len + 2 * extra);
                g.FillRectangle(b, m - gap - len - extra, x0, len + 2 * extra, w);
                g.FillRectangle(b, m + gap - extra, x0, len + 2 * extra, w);
            }
            if (forme == "circle" || forme == "circledot")
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                using (Pen p = new Pen(c, th + 2 * extra)) g.DrawEllipse(p, m - r, m - r, 2 * r, 2 * r);
                g.SmoothingMode = SmoothingMode.None;
            }
            if (forme == "dot" || forme == "crossdot" || forme == "circledot")
            {
                int z = Math.Max(1, dot) + 2 * extra;
                g.FillRectangle(b, m - z / 2, m - z / 2, z, z);
            }
        }
    }

    static void Dessiner()
    {
        if (hwnd == IntPtr.Zero) return;
        string forme;
        if (!cfg.TryGetValue("shape", out forme)) forme = "crossdot";
        int th = Math.Max(1, Entier("thick", 2)), len = Entier("len", 8), gap = Entier("gap", 4), dot = Entier("dot", 2), r = Entier("radius", 12);
        bool contour = Entier("outline", 1) != 0;
        int ow = Math.Max(1, Entier("outlineW", 1));
        int opa = Math.Max(20, Math.Min(100, Entier("opacity", 100)));
        using (Bitmap bmp = new Bitmap(T, T, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.Clear(Color.Transparent);
                g.SmoothingMode = SmoothingMode.None;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                if (contour) Formes(g, Couleur("outlineColor", Color.Black), ow, forme, th, len, gap, dot, r);
                Formes(g, Couleur("color", Color.FromArgb(61, 255, 138)), 0, forme, th, len, gap, dot, r);
            }
            IntPtr ecran = GetDC(IntPtr.Zero);
            IntPtr mem = CreateCompatibleDC(ecran);
            IntPtr hb = bmp.GetHbitmap(Color.FromArgb(0));
            IntPtr ancien = SelectObject(mem, hb);
            try
            {
                SIZE taille = new SIZE(); taille.cx = T; taille.cy = T;
                POINT src = new POINT();
                POINT dst = new POINT(); dst.X = cx - T / 2; dst.Y = cy - T / 2;
                BLENDFUNCTION bf = new BLENDFUNCTION();
                bf.BlendOp = 0; bf.BlendFlags = 0; bf.SourceConstantAlpha = (byte)(opa * 255 / 100); bf.AlphaFormat = 1;
                UpdateLayeredWindow(hwnd, ecran, ref dst, ref taille, mem, ref src, 0, ref bf, 2);
            }
            finally
            {
                SelectObject(mem, ancien);
                DeleteObject(hb);
                DeleteDC(mem);
                ReleaseDC(IntPtr.Zero, ecran);
            }
        }
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing
[A2Viseur]::Demarrer()
[Console]::Out.WriteLine('{"type":"ready"}')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'quit') { break }
    if ($line.Trim() -ne '') { [A2Viseur]::Commande($line.Trim()) }
}
