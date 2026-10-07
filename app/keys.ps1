# PichetMeter — détection des touches de compétences
# Écoute passive du clavier et des boutons de souris (aucune touche n'est bloquée ni envoyée au jeu).
# Seules les touches déclarées dans le suivi des cooldowns sont signalées ; rien d'autre n'est transmis.
# Deux méthodes complémentaires :
#   - crochet clavier / souris de bas niveau (réinstallé régulièrement : Windows le retire sans prévenir s'il a été lent) ;
#   - lecture de l'état des seules touches suivies, toutes les 8 ms (secours quand Windows isole le jeu).
# Un même appui vu par les deux méthodes n'est signalé qu'une fois.
# Commandes sur l'entrée standard :
#   watch id,vk,mods;id,vk,mods   liste des touches suivies (mods : 1 Ctrl, 2 Alt, 4 Maj)
#   pid N                         processus du jeu (pour l'option « seulement en jeu »)
#   quit
# Messages émis :
#   {"type":"key","id":..,"fg":bool,"src":"hook|poll","pid":N,"fgname":".."}   touche suivie pressée
#   {"type":"etat","bloque":bool}   le crochet ne reçoit plus rien pendant le jeu (jeu lancé en administrateur ?)
#   {"type":"stats","crochet":N,"suivies":N}   toutes les 15 s

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class A2Keys
{
    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, HookProc proc, IntPtr hMod, uint threadId);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll")] static extern UIntPtr SetTimer(IntPtr hWnd, UIntPtr id, uint ms, IntPtr proc);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);

    [StructLayout(LayoutKind.Sequential)]
    struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; public uint lPrivate; }

    [StructLayout(LayoutKind.Sequential)]
    struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }

    static HookProc keyboardProc;
    static HookProc mouseProc;
    static IntPtr hookClavier = IntPtr.Zero;
    static IntPtr hookSouris = IntPtr.Zero;
    static Dictionary<long, string> watched = new Dictionary<long, string>();
    static int[] polled = new int[0];
    static readonly Dictionary<int, long> derniers = new Dictionary<int, long>();
    static readonly Dictionary<int, long> enfonces = new Dictionary<int, long>();
    static readonly object gate = new object();
    static readonly object sortie = new object();
    static readonly Stopwatch horloge = Stopwatch.StartNew();
    static long evenementsCrochet = 0;
    public static int GamePid = 0;

    static long Maintenant() { return horloge.ElapsedMilliseconds; }

    public static void SetWatch(string spec)
    {
        Dictionary<long, string> next = new Dictionary<long, string>();
        List<int> vks = new List<int>();
        foreach (string part in spec.Split(';'))
        {
            string[] f = part.Split(',');
            if (f.Length < 3) continue;
            int vk, mods;
            if (!int.TryParse(f[1], out vk) || !int.TryParse(f[2], out mods)) continue;
            if (vk <= 0 || vk > 254) continue;
            next[(long)vk + (long)mods * 65536L] = f[0];
            if (!vks.Contains(vk)) vks.Add(vk);
        }
        lock (gate) { watched = next; polled = vks.ToArray(); }
    }

    public static void Start()
    {
        Thread t = new Thread(RunHooks);
        t.IsBackground = true;
        t.Start();
        Thread p = new Thread(RunPoll);
        p.IsBackground = true;
        p.Start();
    }

    // Nouveau crochet d'abord, ancien retiré ensuite : aucun trou pendant le remplacement
    static void Installer()
    {
        IntPtr module = GetModuleHandle(null);
        IntPtr k = SetWindowsHookEx(13, keyboardProc, module, 0);
        IntPtr m = SetWindowsHookEx(14, mouseProc, module, 0);
        if (hookClavier != IntPtr.Zero) UnhookWindowsHookEx(hookClavier);
        if (hookSouris != IntPtr.Zero) UnhookWindowsHookEx(hookSouris);
        hookClavier = k;
        hookSouris = m;
    }

    static void RunHooks()
    {
        keyboardProc = new HookProc(OnKeyboard);
        mouseProc = new HookProc(OnMouse);
        Installer();
        SetTimer(IntPtr.Zero, UIntPtr.Zero, 30000, IntPtr.Zero);
        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0)
        {
            if (msg.message == 0x0113) Installer();
        }
    }

    static IntPtr OnKeyboard(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            Interlocked.Increment(ref evenementsCrochet);
            int vk = Marshal.ReadInt32(lParam);
            int message = wParam.ToInt32();
            if (message == 0x100 || message == 0x104)
            {
                long t = Maintenant();
                long avant;
                bool nouveau;
                lock (gate)
                {
                    // Une touche tenue se répète au moins toutes les 400 ms après 1 s : au-delà de 1,1 s
                    // sans nouvelle, le relâchement a été manqué et c'est un nouvel appui.
                    nouveau = !enfonces.TryGetValue(vk, out avant) || t - avant > 1100;
                    enfonces[vk] = t;
                }
                if (nouveau) Fire(vk, "hook");
            }
            else if (message == 0x101 || message == 0x105)
            {
                lock (gate) { enfonces.Remove(vk); }
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    static IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            Interlocked.Increment(ref evenementsCrochet);
            int message = wParam.ToInt32();
            int vk = 0;
            if (message == 0x207) vk = 0x04;
            else if (message == 0x20B)
            {
                int data = Marshal.ReadInt32(lParam, 8);
                vk = ((data >> 16) & 0xFFFF) == 1 ? 0x05 : 0x06;
            }
            if (vk != 0) Fire(vk, "hook");
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    static void RunPoll()
    {
        Dictionary<int, bool> etat = new Dictionary<int, bool>();
        long controle = Maintenant();
        long stats = Maintenant();
        long crochetAvant = Interlocked.Read(ref evenementsCrochet);
        uint saisieAvant = DerniereSaisie();
        int suspects = 0;
        bool bloque = false;
        while (true)
        {
            Thread.Sleep(8);
            int[] liste;
            lock (gate) { liste = polled; }
            foreach (int vk in liste)
            {
                bool bas = (GetAsyncKeyState(vk) & 0x8000) != 0;
                bool avant;
                etat.TryGetValue(vk, out avant);
                if (bas && !avant) Fire(vk, "poll");
                etat[vk] = bas;
            }
            long t = Maintenant();
            if (t - controle >= 2000)
            {
                controle = t;
                long crochet = Interlocked.Read(ref evenementsCrochet);
                uint saisie = DerniereSaisie();
                if (crochet != crochetAvant) suspects = 0;
                else if (saisie != saisieAvant && PremierPlanEstJeu()) suspects++;
                bool b = suspects >= 2;
                if (b != bloque)
                {
                    bloque = b;
                    Ecrire("{\"type\":\"etat\",\"bloque\":" + (b ? "true" : "false") + "}");
                }
                crochetAvant = crochet;
                saisieAvant = saisie;
            }
            if (t - stats >= 15000)
            {
                stats = t;
                Ecrire("{\"type\":\"stats\",\"crochet\":" + Interlocked.Read(ref evenementsCrochet) + ",\"suivies\":" + liste.Length + "}");
            }
        }
    }

    static uint DerniereSaisie()
    {
        LASTINPUTINFO i = new LASTINPUTINFO();
        i.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
        if (!GetLastInputInfo(ref i)) return 0;
        return i.dwTime;
    }

    static int PidPremierPlan()
    {
        uint pid;
        GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        return (int)pid;
    }

    static bool PremierPlanEstJeu()
    {
        int g = GamePid;
        return g != 0 && PidPremierPlan() == g;
    }

    static int Modifiers()
    {
        int m = 0;
        if ((GetAsyncKeyState(0x11) & 0x8000) != 0) m += 1;
        if ((GetAsyncKeyState(0x12) & 0x8000) != 0) m += 2;
        if ((GetAsyncKeyState(0x10) & 0x8000) != 0) m += 4;
        return m;
    }

    static string Echapper(string s)
    {
        return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    static void Ecrire(string ligne)
    {
        lock (sortie) { Console.Out.WriteLine(ligne); Console.Out.Flush(); }
    }

    static void Fire(int vk, string src)
    {
        if (vk == 0x10 || vk == 0x11 || vk == 0x12 || (vk >= 0xA0 && vk <= 0xA5)) return;
        int mods = Modifiers();
        long t = Maintenant();
        string id;
        lock (gate)
        {
            if (!watched.TryGetValue((long)vk + (long)mods * 65536L, out id)) return;
            long avant;
            if (derniers.TryGetValue(vk, out avant) && t - avant < 250) return;
            derniers[vk] = t;
        }
        int pid = PidPremierPlan();
        int g = GamePid;
        bool inGame = g != 0 && pid == g;
        string debut = "{\"type\":\"key\",\"id\":\"" + Echapper(id) + "\",\"fg\":" + (inGame ? "true" : "false") + ",\"src\":\"" + src + "\",\"pid\":" + pid;
        ThreadPool.QueueUserWorkItem(delegate (object state)
        {
            string nom = "";
            try { nom = Process.GetProcessById((int)state).ProcessName; } catch { }
            Ecrire(debut + ",\"fgname\":\"" + Echapper(nom) + "\"}");
        }, pid);
    }
}
'@

Add-Type -TypeDefinition $source -IgnoreWarnings
[A2Keys]::Start()
[Console]::Out.WriteLine('{"type":"ready"}')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'quit') { break }
    try {
        if ($line.StartsWith('watch ')) { [A2Keys]::SetWatch($line.Substring(6)) }
        elseif ($line.StartsWith('pid ')) { [A2Keys]::GamePid = [int]$line.Substring(4) }
    }
    catch { }
}
