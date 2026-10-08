# PichetMeter — moteur de macros (clavier et souris)
# Joue des séquences d'appuis simulés (SendInput) quand une touche de déclenchement est pressée.
# Rien ne tourne tant que l'utilisateur n'a pas activé le module Macros dans l'interface.
# Les appuis simulés par ce module sont ignorés par ses propres crochets (pas de boucle).
#
# Commandes sur l'entrée standard :
#   clear                                   oublie toutes les macros
#   add id|vk|mods|mode|fois|boucle|bloque|etapes
#        mode : once | count | hold | toggle ; fois : nombre de passages (count) ;
#        boucle : pause en ms entre deux passages ; bloque : 1 = la touche déclencheur n'est pas transmise au jeu
#        etapes : vk,mods,action,duree,pause;...   (vk 0 = simple pause)
#        action : t appui | d enfoncer | u relâcher | h maintenir « duree » ms ; pause : attente après l'étape
#        vk 1 2 4 5 6 = boutons de souris gauche, droit, milieu, 4, 5
#   opt fg=1 panic=vk,mods actif=1          options globales
#   pid N                                   processus du jeu
#   pause 1|0                               interface ouverte : rien ne se déclenche, tout s'arrête
#   test id                                 joue la macro une fois, 3 s plus tard
#   pot actif=1 zone=x,y,w,h couleur=r,g,b tol=N regles=vk,mods,seuil,delai;...
#                                           auto-potions : lecture de la barre de vie à l'écran
#   hpcal id x,y,w,h                        calibre la couleur de la barre (vie pleine), répond {"type":"hpcal","id":..}
#   stop                                    arrête tout ; quit
# Messages émis :
#   {"type":"ready"} {"type":"run","id":"..","on":bool} {"type":"stop","raison":".."} {"type":"err","message":".."}
#   {"type":"hp","v":0.63}  part de vie lue (auto-potions) ; {"type":"potion","seuil":N}  potion utilisée
param([switch]$Test)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class A2Macro
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
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
    [DllImport("winmm.dll")] static extern uint timeBeginPeriod(uint ms);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; public uint lPrivate; }
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION u; }

    public class Etape { public int Vk; public int Mods; public char Action; public int Duree; public int Pause; }
    public class Groupe
    {
        public string Id; public int Vk; public int Mods; public string Mode; public int Fois; public int Boucle; public bool Bloque;
        public List<Etape> Etapes = new List<Etape>();
        public volatile bool EnCours; public volatile bool Arret; public volatile bool Tenu;
    }

    static HookProc keyboardProc, mouseProc;
    static IntPtr hookClavier = IntPtr.Zero, hookSouris = IntPtr.Zero;
    static readonly object gate = new object();
    static readonly object sortie = new object();
    static List<Groupe> groupes = new List<Groupe>();
    static readonly HashSet<int> enfonces = new HashSet<int>();
    static volatile bool arretGlobal = false;
    public static volatile bool Actif = false;
    public static volatile bool Pause = false;
    public static volatile bool PremierPlan = true;
    public static volatile int GamePid = 0;
    public static int PanicVk = 0, PanicMods = 0;
    // Mode test (sans Windows) : les appuis sont notés au lieu d'être envoyés
    public static bool Simulation = false;
    public static readonly List<string> Journal = new List<string>();
    static readonly Stopwatch horloge = Stopwatch.StartNew();

    /* ───────── Configuration ───────── */
    public static Groupe Analyser(string spec)
    {
        string[] f = spec.Split('|');
        if (f.Length < 8) throw new FormatException("macro incomplète");
        CultureInfo ci = CultureInfo.InvariantCulture;
        Groupe g = new Groupe();
        g.Id = f[0];
        g.Vk = int.Parse(f[1], ci); g.Mods = int.Parse(f[2], ci);
        g.Mode = f[3]; g.Fois = Math.Max(1, int.Parse(f[4], ci)); g.Boucle = Math.Max(0, int.Parse(f[5], ci)); g.Bloque = f[6] == "1";
        if (g.Mode != "once" && g.Mode != "count" && g.Mode != "hold" && g.Mode != "toggle") throw new FormatException("mode inconnu : " + g.Mode);
        if (g.Vk <= 0 || g.Vk > 254 || g.Vk == 1 || g.Vk == 2) throw new FormatException("touche de déclenchement invalide");
        foreach (string s in f[7].Split(';'))
        {
            if (s.Length == 0) continue;
            string[] e = s.Split(',');
            if (e.Length < 5) throw new FormatException("étape incomplète : " + s);
            Etape et = new Etape();
            et.Vk = int.Parse(e[0], ci); et.Mods = int.Parse(e[1], ci);
            et.Action = e[2].Length > 0 ? e[2][0] : 't';
            et.Duree = Math.Max(0, Math.Min(60000, int.Parse(e[3], ci)));
            et.Pause = Math.Max(0, Math.Min(600000, int.Parse(e[4], ci)));
            if (et.Vk < 0 || et.Vk > 254) throw new FormatException("touche invalide : " + s);
            if ("tduh".IndexOf(et.Action) < 0) throw new FormatException("action inconnue : " + s);
            g.Etapes.Add(et);
        }
        return g;
    }
    public static void Vider() { ToutArreter("config"); lock (gate) { groupes = new List<Groupe>(); } }
    public static void Ajouter(string spec)
    {
        Groupe g = Analyser(spec);
        lock (gate) { List<Groupe> l = new List<Groupe>(groupes); l.Add(g); groupes = l; }
    }
    static Groupe ParId(string id)
    {
        foreach (Groupe g in groupes) if (g.Id == id) return g;
        return null;
    }

    /* ───────── Crochets clavier / souris ───────── */
    public static void Start()
    {
        try { timeBeginPeriod(1); } catch { }
        try { SetProcessDPIAware(); } catch { } // coordonnées d'écran en pixels réels (barre de vie)
        Thread t = new Thread(RunHooks);
        t.IsBackground = true;
        t.Start();
        Thread p = new Thread(BouclePotions);
        p.IsBackground = true;
        p.Start();
    }
    static void Installer()
    {
        IntPtr module = GetModuleHandle(null);
        IntPtr k = SetWindowsHookEx(13, keyboardProc, module, 0);
        IntPtr m = SetWindowsHookEx(14, mouseProc, module, 0);
        if (hookClavier != IntPtr.Zero) UnhookWindowsHookEx(hookClavier);
        if (hookSouris != IntPtr.Zero) UnhookWindowsHookEx(hookSouris);
        hookClavier = k; hookSouris = m;
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
            int vk = Marshal.ReadInt32(lParam);
            int flags = Marshal.ReadInt32(lParam, 8);
            int message = wParam.ToInt32();
            bool injecte = (flags & 0x10) != 0;
            if (!injecte)
            {
                bool bas = message == 0x100 || message == 0x104;
                bool haut = message == 0x101 || message == 0x105;
                if ((bas || haut) && Evenement(vk, bas)) return (IntPtr)1;
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }
    static IntPtr OnMouse(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            int message = wParam.ToInt32();
            int flags = Marshal.ReadInt32(lParam, 12);
            if ((flags & 0x01) == 0)
            {
                int vk = 0; bool bas = false;
                if (message == 0x207 || message == 0x208) { vk = 0x04; bas = message == 0x207; }
                else if (message == 0x20B || message == 0x20C)
                {
                    int data = Marshal.ReadInt32(lParam, 8);
                    vk = ((data >> 16) & 0xFFFF) == 1 ? 0x05 : 0x06;
                    bas = message == 0x20B;
                }
                if (vk != 0 && Evenement(vk, bas)) return (IntPtr)1;
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }
    // Mode test : appui ou relâchement d'une touche physique
    public static bool Simuler(int vk, bool bas) { return Evenement(vk, bas); }
    static int Modificateurs()
    {
        if (Simulation) return 0;
        int m = 0;
        if ((GetAsyncKeyState(0x11) & 0x8000) != 0) m += 1;
        if ((GetAsyncKeyState(0x12) & 0x8000) != 0) m += 2;
        if ((GetAsyncKeyState(0x10) & 0x8000) != 0) m += 4;
        return m;
    }
    // Retourne true si l'appui doit être bloqué (non transmis au jeu)
    static bool Evenement(int vk, bool bas)
    {
        bool modif = vk == 0x10 || vk == 0x11 || vk == 0x12 || (vk >= 0xA0 && vk <= 0xA5);
        bool repetition;
        lock (gate)
        {
            repetition = bas && enfonces.Contains(vk);
            if (bas) enfonces.Add(vk); else enfonces.Remove(vk);
        }
        if (!Actif) return false;
        // une touche de modification (Ctrl, Alt, Maj) déclenche seule : pas de combinaison à vérifier
        int mods = bas && !modif ? Modificateurs() : 0;
        if (bas && !repetition && PanicVk != 0 && vk == PanicVk && (PanicMods == 0 || mods == PanicMods))
        {
            // hors du crochet : il doit rendre la main tout de suite
            Thread t = new Thread(delegate () { if (ToutArreter("panique")) Ecrire("{\"type\":\"stop\",\"raison\":\"panique\"}"); });
            t.IsBackground = true;
            t.Start();
            return false;
        }
        if (Pause) return false;
        List<Groupe> liste = groupes;
        bool bloquer = false;
        foreach (Groupe g in liste)
        {
            if (g.Vk != vk) continue;
            if (!bas)
            {
                // relâchement : vaut pour la macro tenue, quels que soient les modificateurs
                if (g.Tenu) { g.Tenu = false; if (g.Bloque) bloquer = true; }
                continue;
            }
            if (g.Mods != 0 && g.Mods != mods) continue;
            if (!JeuDevant()) continue;
            if (g.Bloque) bloquer = true;
            if (!repetition) Declencher(g);
        }
        return bloquer;
    }

    /* ───────── Exécution ───────── */
    static int PidPremierPlan()
    {
        uint pid;
        GetWindowThreadProcessId(GetForegroundWindow(), out pid);
        return (int)pid;
    }
    static bool JeuDevant()
    {
        if (Simulation || !PremierPlan) return true;
        int g = GamePid;
        return g != 0 && PidPremierPlan() == g;
    }
    static void Declencher(Groupe g)
    {
        if (g.Mode == "toggle")
        {
            if (g.EnCours) { g.Arret = true; return; }
        }
        else if (g.Mode == "hold") g.Tenu = true;
        if (g.EnCours) return;
        g.EnCours = true; g.Arret = false;
        Thread t = new Thread(delegate () { Executer(g, 0); });
        t.IsBackground = true;
        t.Start();
    }
    public static bool ToutArreter(string raison)
    {
        bool actif = false;
        arretGlobal = true;
        foreach (Groupe g in groupes) { if (g.EnCours) actif = true; g.Arret = true; g.Tenu = false; }
        // laisse aux exécutions en cours le temps de relâcher leurs touches
        Stopwatch sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < 500)
        {
            bool reste = false;
            foreach (Groupe g in groupes) if (g.EnCours) reste = true;
            if (!reste) break;
            Thread.Sleep(2);
        }
        arretGlobal = false;
        return actif && raison != null;
    }
    public static void Tester(string id, int delai)
    {
        Groupe g = ParId(id);
        if (g == null || g.EnCours) return;
        g.EnCours = true; g.Arret = false;
        Thread t = new Thread(delegate () { Executer(g, delai); });
        t.IsBackground = true;
        t.Start();
    }
    static bool Interrompu(Groupe g)
    {
        if (g.Arret || arretGlobal || Pause) return true;
        if (!JeuDevant()) return true;
        if (g.Mode == "hold" && !g.Tenu) return true;
        return false;
    }
    // Attente précise (pas de 1 ms) ; false si la macro doit s'arrêter
    static bool Attendre(Groupe g, int ms, bool interruptible)
    {
        if (ms <= 0) return !(interruptible && Interrompu(g));
        long fin = horloge.ElapsedMilliseconds + ms;
        while (true)
        {
            if (interruptible && Interrompu(g)) return false;
            long reste = fin - horloge.ElapsedMilliseconds;
            if (reste <= 0) return true;
            Thread.Sleep(reste > 15 ? 5 : 1);
        }
    }
    public static void Executer(Groupe g, int delaiInitial)
    {
        List<int> tenues = new List<int>();
        bool test = delaiInitial > 0 || g.Mode == "test";
        Ecrire("{\"type\":\"run\",\"id\":\"" + Echapper(g.Id) + "\",\"on\":true}");
        try
        {
            if (delaiInitial > 0 && !Attendre(g, delaiInitial, false)) return;
            int passages = 0;
            while (true)
            {
                foreach (Etape e in g.Etapes)
                {
                    if (!test && Interrompu(g)) return;
                    if (test && (g.Arret || arretGlobal)) return;
                    Jouer(e, tenues, g);
                    if (!Attendre(g, e.Pause, !test)) return;
                }
                passages++;
                if (test || g.Mode == "once") return;
                if (g.Mode == "count" && passages >= g.Fois) return;
                if (g.Etapes.Count == 0) return;
                if (!Attendre(g, Math.Max(g.Boucle, 1), true)) return;
            }
        }
        catch (Exception ex) { Ecrire("{\"type\":\"err\",\"message\":\"" + Echapper(ex.Message) + "\"}"); }
        finally
        {
            for (int i = tenues.Count - 1; i >= 0; i--) Envoyer(tenues[i], false);
            g.Tenu = false; g.EnCours = false;
            Ecrire("{\"type\":\"run\",\"id\":\"" + Echapper(g.Id) + "\",\"on\":false}");
        }
    }
    static void Jouer(Etape e, List<int> tenues, Groupe g)
    {
        if (e.Vk == 0) return; // simple pause
        List<int> mods = new List<int>();
        if ((e.Mods & 1) != 0) mods.Add(0x11);
        if ((e.Mods & 2) != 0) mods.Add(0x12);
        if ((e.Mods & 4) != 0) mods.Add(0x10);
        foreach (int m in mods) Envoyer(m, true);
        if (e.Action == 'd') { Envoyer(e.Vk, true); if (!tenues.Contains(e.Vk)) tenues.Add(e.Vk); }
        else if (e.Action == 'u') { Envoyer(e.Vk, false); tenues.Remove(e.Vk); }
        else
        {
            Envoyer(e.Vk, true);
            tenues.Add(e.Vk);
            Attendre(g, Math.Max(e.Duree, 10), false);
            Envoyer(e.Vk, false);
            tenues.Remove(e.Vk);
        }
        for (int i = mods.Count - 1; i >= 0; i--) Envoyer(mods[i], false);
    }
    static bool Etendue(int vk)
    {
        return (vk >= 0x21 && vk <= 0x2E) || vk == 0x5B || vk == 0x5C || vk == 0x5D || vk == 0x6F || vk == 0x90 || vk == 0xA3 || vk == 0xA5;
    }
    static void Envoyer(int vk, bool bas)
    {
        if (Simulation)
        {
            lock (Journal) Journal.Add((bas ? "+" : "-") + vk.ToString(CultureInfo.InvariantCulture) + "@" + horloge.ElapsedMilliseconds.ToString(CultureInfo.InvariantCulture));
            return;
        }
        INPUT[] tab = new INPUT[1];
        if (vk == 1 || vk == 2 || vk == 4 || vk == 5 || vk == 6)
        {
            tab[0].type = 0;
            uint f = 0, data = 0;
            if (vk == 1) f = bas ? 0x0002u : 0x0004u;
            else if (vk == 2) f = bas ? 0x0008u : 0x0010u;
            else if (vk == 4) f = bas ? 0x0020u : 0x0040u;
            else { f = bas ? 0x0080u : 0x0100u; data = vk == 5 ? 1u : 2u; }
            tab[0].u.mi.dwFlags = f;
            tab[0].u.mi.mouseData = data;
        }
        else
        {
            tab[0].type = 1;
            uint scan = MapVirtualKey((uint)vk, 0);
            uint f = 0x0008; // KEYEVENTF_SCANCODE : lu par les jeux qui ignorent les codes virtuels
            if (scan == 0) f = 0;
            if (Etendue(vk)) f += 0x0001;
            if (!bas) f += 0x0002;
            tab[0].u.ki.wVk = (ushort)vk;
            tab[0].u.ki.wScan = (ushort)scan;
            tab[0].u.ki.dwFlags = f;
        }
        if (SendInput(1, tab, Marshal.SizeOf(typeof(INPUT))) == 0)
            Ecrire("{\"type\":\"err\",\"message\":\"Windows a refusé l'appui simulé (code " + Marshal.GetLastWin32Error().ToString(CultureInfo.InvariantCulture) + "). Le jeu tourne-t-il en administrateur ?\"}");
    }

    /* ───────── Auto-potions : lecture de la barre de vie à l'écran ───────── */
    public class Potion { public int Vk; public int Mods; public int Seuil; public int Delai; public long Dernier = -1000000; }
    static volatile bool potionsActives = false;
    static int[] zoneVie = null;
    static int couleurR, couleurV, couleurB, tolerance = 70;
    static List<Potion> potions = new List<Potion>();
    static System.Reflection.MethodInfo captureEcran, pngEcran;

    public static void ConfigurerPotions(string spec)
    {
        CultureInfo ci = CultureInfo.InvariantCulture;
        bool actif = false; int[] z = null; int r = couleurR, v = couleurV, b = couleurB, tol = tolerance;
        List<Potion> l = new List<Potion>();
        foreach (string kv in spec.Split(' '))
        {
            int i = kv.IndexOf('=');
            if (i < 0) continue;
            string k = kv.Substring(0, i), val = kv.Substring(i + 1);
            if (k == "actif") actif = val == "1";
            else if (k == "zone") { string[] f = val.Split(','); if (f.Length == 4) { z = new int[4]; for (int j = 0; j < 4; j++) z[j] = int.Parse(f[j], ci); if (z[2] < 4 || z[3] < 1) z = null; } }
            else if (k == "couleur") { string[] f = val.Split(','); if (f.Length == 3) { r = int.Parse(f[0], ci); v = int.Parse(f[1], ci); b = int.Parse(f[2], ci); } }
            else if (k == "tol") tol = Math.Max(5, Math.Min(250, int.Parse(val, ci)));
            else if (k == "regles")
            {
                foreach (string rg in val.Split(';'))
                {
                    string[] f = rg.Split(',');
                    if (f.Length < 4) continue;
                    Potion po = new Potion();
                    po.Vk = int.Parse(f[0], ci); po.Mods = int.Parse(f[1], ci);
                    po.Seuil = Math.Max(1, Math.Min(99, int.Parse(f[2], ci)));
                    po.Delai = Math.Max(100, Math.Min(600000, int.Parse(f[3], ci)));
                    if (po.Vk > 0 && po.Vk < 255) l.Add(po);
                }
            }
        }
        l.Sort(delegate (Potion a, Potion c) { return a.Seuil.CompareTo(c.Seuil); });
        lock (gate)
        {
            // garde le moment du dernier appui des règles déjà connues (pas de double potion en changeant un réglage)
            foreach (Potion n in l) foreach (Potion o in potions) if (o.Vk == n.Vk && o.Mods == n.Mods) n.Dernier = o.Dernier;
            potions = l; zoneVie = z; couleurR = r; couleurV = v; couleurB = b; tolerance = tol;
            potionsActives = actif && z != null && l.Count > 0;
        }
    }

    // Part de vie (0 à 1) d'une barre qui se remplit de gauche à droite ; -1 si illisible.
    // Une colonne est « pleine » si au moins 40 % des lignes sondées ont la couleur de la barre ;
    // le texte écrit sur la barre (chiffres) ne crée que de petits trous, ignorés.
    public static double Ratio(int[] px, int w, int h, int r0, int g0, int b0, int tol)
    {
        if (px == null || w < 4 || h < 1 || px.Length < w * h) return -1;
        double[] fr = new double[] { 0.2, 0.35, 0.5, 0.65, 0.8 };
        List<int> lignes = new List<int>();
        foreach (double f in fr) { int y = Math.Min(h - 1, Math.Max(0, (int)(h * f))); if (!lignes.Contains(y)) lignes.Add(y); }
        int tol2 = tol * tol, dernier = -1, trou = 0, maxTrou = Math.Max(3, w * 6 / 100);
        for (int x = 0; x < w; x++)
        {
            int n = 0;
            foreach (int y in lignes)
            {
                int c = px[y * w + x];
                int dr = ((c >> 16) & 255) - r0, dg = ((c >> 8) & 255) - g0, db = (c & 255) - b0;
                if (dr * dr + dg * dg + db * db <= tol2) n++;
            }
            if (n * 10 >= lignes.Count * 4) { dernier = x; trou = 0; }
            else if (dernier >= 0) { trou++; if (trou > maxTrou) break; }
        }
        return (dernier + 1) / (double)w;
    }

    static int[] Capturer(int x, int y, int w, int h)
    {
        if (captureEcran == null)
        {
            foreach (System.Reflection.Assembly a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type t = a.GetType("A2Ecran");
                if (t != null) { captureEcran = t.GetMethod("Capture"); pngEcran = t.GetMethod("Png"); break; }
            }
            if (captureEcran == null) throw new InvalidOperationException("lecture de l'écran indisponible");
        }
        return (int[])captureEcran.Invoke(null, new object[] { x, y, w, h });
    }

    // Calibrage (vie pleine) : couleur médiane de la ligne du milieu, puis lecture de contrôle
    public static string Calibrer(string id, string zone)
    {
        CultureInfo ci = CultureInfo.InvariantCulture;
        string[] f = zone.Split(',');
        int x = int.Parse(f[0], ci), y = int.Parse(f[1], ci), w = int.Parse(f[2], ci), h = int.Parse(f[3], ci);
        int[] px = Capturer(x, y, w, h);
        int ym = h / 2;
        List<int> rs = new List<int>(), vs = new List<int>(), bs = new List<int>();
        for (int i = w / 10; i < Math.Max(w / 10 + 1, w * 6 / 10); i++)
        {
            int c = px[ym * w + i];
            rs.Add((c >> 16) & 255); vs.Add((c >> 8) & 255); bs.Add(c & 255);
        }
        rs.Sort(); vs.Sort(); bs.Sort();
        int r = rs[rs.Count / 2], v = vs[vs.Count / 2], b = bs[bs.Count / 2];
        double lu = Ratio(px, w, h, r, v, b, tolerance);
        string png = "";
        try { if (pngEcran != null) png = (string)pngEcran.Invoke(null, new object[] { px, w, h }); } catch { }
        return "{\"type\":\"hpcal\",\"id\":" + int.Parse(id, ci).ToString(ci) + ",\"couleur\":[" + r.ToString(ci) + "," + v.ToString(ci) + "," + b.ToString(ci) + "],\"v\":" + lu.ToString("0.000", ci) + ",\"png\":\"" + png + "\"}";
    }

    static void BouclePotions()
    {
        CultureInfo ci = CultureInfo.InvariantCulture;
        long dernierEnvoi = 0; double dernierLu = -2; bool erreurDite = false;
        while (true)
        {
            Thread.Sleep(100);
            if (!Actif || Pause || !potionsActives) continue;
            if (!JeuDevant()) continue;
            int[] z; List<Potion> l; int r, v, b, tol;
            lock (gate) { z = zoneVie; l = potions; r = couleurR; v = couleurV; b = couleurB; tol = tolerance; }
            if (z == null) continue;
            double lu;
            try { lu = Ratio(Capturer(z[0], z[1], z[2], z[3]), z[2], z[3], r, v, b, tol); erreurDite = false; }
            catch (Exception ex)
            {
                if (!erreurDite) { erreurDite = true; Ecrire("{\"type\":\"err\",\"message\":\"Auto-potions : " + Echapper((ex.InnerException ?? ex).Message) + "\"}"); }
                Thread.Sleep(2000);
                continue;
            }
            long t = horloge.ElapsedMilliseconds;
            if (t - dernierEnvoi >= 400 && Math.Abs(lu - dernierLu) >= 0.01 || t - dernierEnvoi >= 3000)
            {
                dernierEnvoi = t; dernierLu = lu;
                Ecrire("{\"type\":\"hp\",\"v\":" + lu.ToString("0.000", ci) + "}");
            }
            // barre vide ou illisible (écran de chargement, personnage mort, barre masquée) : rien
            if (lu <= 0.01) continue;
            foreach (Potion po in l)
            {
                if (lu * 100 > po.Seuil || t - po.Dernier < po.Delai) continue;
                po.Dernier = t;
                Etape e = new Etape(); e.Vk = po.Vk; e.Mods = po.Mods; e.Action = 't'; e.Duree = 30;
                Jouer(e, new List<int>(), new Groupe());
                Ecrire("{\"type\":\"potion\",\"seuil\":" + po.Seuil.ToString(ci) + "}");
                Thread.Sleep(40);
            }
        }
    }

    // Mode test : barre synthétique (remplie jusqu'à « plein », chiffres dessinés au milieu)
    public static double TestBarre(int w, int h, double plein, int tol)
    {
        int[] px = new int[w * h];
        int rouge = (200 << 16) | (40 << 8) | 40, fond = (25 << 16) | (20 << 8) | 22, texte = (240 << 16) | (240 << 8) | 240;
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                int c = x < (int)(w * plein) ? rouge + ((x * 7 + y * 3) % 9) : fond;
                bool chiffre = x > w * 40 / 100 && x < w * 60 / 100 && y > h * 30 / 100 && y < h * 70 / 100 && (x % 5) < 2;
                px[y * w + x] = chiffre ? texte : c;
            }
        return Ratio(px, w, h, 200, 40, 40, tol);
    }

    /* ───────── Sortie ───────── */
    static string Echapper(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }
    public static void Ecrire(string ligne)
    {
        lock (sortie) { Console.Out.WriteLine(ligne); Console.Out.Flush(); }
    }
}
'@

$ecran = @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class A2Ecran
{
    public static int[] Capture(int x, int y, int w, int h)
    {
        using (Bitmap b = new Bitmap(w, h, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(b)) { g.CopyFromScreen(x, y, 0, 0, new Size(w, h)); }
            BitmapData d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            int[] px = new int[w * h];
            try { for (int r = 0; r < h; r++) Marshal.Copy(IntPtr.Add(d.Scan0, r * d.Stride), px, r * w, w); }
            finally { b.UnlockBits(d); }
            return px;
        }
    }
    public static string Png(int[] px, int w, int h)
    {
        using (Bitmap b = new Bitmap(w, h, PixelFormat.Format32bppArgb))
        {
            BitmapData d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            try { for (int r = 0; r < h; r++) Marshal.Copy(px, r * w, IntPtr.Add(d.Scan0, r * d.Stride), w); }
            finally { b.UnlockBits(d); }
            using (MemoryStream ms = new MemoryStream()) { b.Save(ms, ImageFormat.Png); return Convert.ToBase64String(ms.ToArray()); }
        }
    }
}
'@

Add-Type -TypeDefinition $source -IgnoreWarnings
if ($Test) { [A2Macro]::Simulation = $true }
else {
    Add-Type -TypeDefinition $ecran -ReferencedAssemblies System.Drawing -IgnoreWarnings
    [A2Macro]::Start()
}
[A2Macro]::Ecrire('{"type":"ready"}')

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'quit') { break }
    try {
        if ($line -eq 'clear') { [A2Macro]::Vider() }
        elseif ($line.StartsWith('add ')) { [A2Macro]::Ajouter($line.Substring(4)) }
        elseif ($line.StartsWith('pid ')) { [A2Macro]::GamePid = [int]$line.Substring(4) }
        elseif ($line.StartsWith('pause ')) {
            $p = $line.Substring(6) -eq '1'
            [A2Macro]::Pause = $p
            if ($p) { [void][A2Macro]::ToutArreter($null) }
        }
        elseif ($line -eq 'stop') { [void][A2Macro]::ToutArreter($null) }
        elseif ($line.StartsWith('pot ')) { [A2Macro]::ConfigurerPotions($line.Substring(4)) }
        elseif ($line.StartsWith('hpcal ')) {
            $p = $line.Substring(6).Split(' ')
            try { [A2Macro]::Ecrire([A2Macro]::Calibrer($p[0], $p[1])) }
            catch {
                $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
                [A2Macro]::Ecrire('{"type":"hpcal","id":' + [int]$p[0] + ',"erreur":"' + ($ex.Message -replace '\\', '\\\\' -replace '"', '\"') + '"}')
            }
        }
        elseif ($Test -and $line -match '^hpsim (\d+) (\d+) ([\d.]+) (\d+)$') {
            $v = [A2Macro]::TestBarre([int]$Matches[1], [int]$Matches[2], [double]::Parse($Matches[3], [Globalization.CultureInfo]::InvariantCulture), [int]$Matches[4])
            [A2Macro]::Ecrire('{"type":"hpsim","v":' + $v.ToString('0.000', [Globalization.CultureInfo]::InvariantCulture) + '}')
        }
        elseif ($line.StartsWith('test ')) { [A2Macro]::Tester($line.Substring(5), $(if ($Test) { 1 } else { 3000 })) }
        elseif ($line.StartsWith('opt ')) {
            foreach ($kv in $line.Substring(4).Split(' ')) {
                $p = $kv.Split('=')
                if ($p.Count -ne 2) { continue }
                switch ($p[0]) {
                    'fg' { [A2Macro]::PremierPlan = ($p[1] -eq '1') }
                    'actif' { [A2Macro]::Actif = ($p[1] -eq '1'); if ($p[1] -ne '1') { [void][A2Macro]::ToutArreter($null) } }
                    'panic' { $v = $p[1].Split(','); [A2Macro]::PanicVk = [int]$v[0]; [A2Macro]::PanicMods = [int]$v[1] }
                }
            }
        }
        elseif ($Test -and $line -match '^(down|up) (\d+)$') { [void][A2Macro]::Simuler([int]$Matches[2], $Matches[1] -eq 'down') }
        elseif ($Test -and $line.StartsWith('wait ')) { Start-Sleep -Milliseconds ([int]$line.Substring(5)) }
        elseif ($Test -and $line -eq 'journal') {
            $j = [string]::Join(' ', [A2Macro]::Journal.ToArray())
            [A2Macro]::Ecrire('{"type":"journal","j":"' + $j + '"}')
            [A2Macro]::Journal.Clear()
        }
    }
    catch {
        $ex = $_.Exception; while ($ex.InnerException) { $ex = $ex.InnerException }
        [A2Macro]::Ecrire('{"type":"err","message":"' + ($ex.Message -replace '\\', '\\\\' -replace '"', '\"') + '"}')
    }
}
