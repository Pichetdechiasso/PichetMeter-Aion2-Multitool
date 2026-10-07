# PichetMeter — lecture passive du trafic du jeu (DPS de groupe)
# Utilise Npcap (https://npcap.com), comme les DPS meters communautaires : les paquets envoyés
# par le serveur au client sont seulement lus, jamais modifiés, bloqués ni envoyés.
# Repérage du flux du jeu : motif « 0E 00 36 » des paquets de maintien de connexion
# (méthode documentée par RATmeter, github.com/Kuroukihime/AIon2-Dps-Meter, GPL-3.0).
# Commandes sur l'entrée standard : start | stop | quit
# Sortie : une ligne JSON par événement (etat, verrou, tcp, perdu, stats, erreur).

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$source = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class A2Capture
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool SetDllDirectory(string path);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern int pcap_findalldevs(ref IntPtr alldevs, StringBuilder errbuf);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern void pcap_freealldevs(IntPtr alldevs);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)] static extern IntPtr pcap_open_live(string device, int snaplen, int promisc, int toMs, StringBuilder errbuf);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)] static extern int pcap_compile(IntPtr p, IntPtr prog, string filter, int optimize, uint netmask);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern int pcap_setfilter(IntPtr p, IntPtr prog);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern void pcap_freecode(IntPtr prog);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern int pcap_next_ex(IntPtr p, out IntPtr header, out IntPtr data);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern int pcap_datalink(IntPtr p);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern void pcap_close(IntPtr p);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr pcap_geterr(IntPtr p);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern int pcap_setbuff(IntPtr p, int dim);
    [DllImport("wpcap", CallingConvention = CallingConvention.Cdecl)] static extern IntPtr pcap_lib_version();

    class Carte
    {
        public string Nom, Desc;
        public bool Boucle;
        public IntPtr H = IntPtr.Zero;
        public int Lien;
        public volatile bool Arret;
        public volatile string FiltreEnAttente;
        public Thread Fil;
    }

    static readonly byte[] Motif = { 0x0E, 0x00, 0x36 };
    const int Seuil = 5;
    const int GraceMs = 2000;
    const int VeilleMs = 60000;

    static readonly object verrou = new object();
    static readonly object sortie = new object();
    static List<Carte> cartes = new List<Carte>();
    static Dictionary<string, int> coups = new Dictionary<string, int>();
    static Dictionary<int, uint> attendu = new Dictionary<int, uint>();
    static bool actif, verrouille, grace;
    static DateTime finGrace, dernierControle, rouvrirA = DateTime.MaxValue, dernieresStats;
    static Carte gagnante;
    static int portVerrou;
    static long paquetsVeille, paquetsTotal, octetsTotal;
    static Timer minuteur;
    static bool windows = Environment.OSVersion.Platform == PlatformID.Win32NT;

    public static string Version = null;

    static void Emettre(string json)
    {
        lock (sortie) { Console.Out.WriteLine(json); Console.Out.Flush(); }
    }

    static string Js(string s)
    {
        StringBuilder b = new StringBuilder("\"");
        foreach (char c in s ?? "")
        {
            if (c == '"' || c == '\\') b.Append('\\').Append(c);
            else if (c < 32) b.Append("\\u").Append(((int)c).ToString("x4"));
            else b.Append(c);
        }
        return b.Append('"').ToString();
    }

    // Retourne null si tout va bien, sinon un message (« npcap » si Npcap est absent).
    public static string Demarrer()
    {
        lock (verrou)
        {
            if (actif) return null;
            try
            {
                if (windows) SetDllDirectory(Path.Combine(Environment.SystemDirectory, "Npcap"));
            }
            catch { }
            try { Version = Marshal.PtrToStringAnsi(pcap_lib_version()); }
            catch (DllNotFoundException) { return "npcap"; }
            catch (EntryPointNotFoundException) { return "npcap"; }
            catch (BadImageFormatException) { return "npcap"; }
            actif = true;
            string err = OuvrirToutes();
            if (err != null) { actif = false; return err; }
            minuteur = new Timer(Controle, null, 250, 250);
            return null;
        }
    }

    public static void Arreter()
    {
        lock (verrou)
        {
            if (!actif) return;
            actif = false;
            if (minuteur != null) { minuteur.Dispose(); minuteur = null; }
            foreach (Carte c in cartes) c.Arret = true;
            cartes = new List<Carte>();
            verrouille = false; grace = false; gagnante = null;
            rouvrirA = DateTime.MaxValue;
            coups.Clear();
            lock (attendu) attendu.Clear();
        }
        Emettre("{\"type\":\"etat\",\"etape\":\"arrete\"}");
    }

    public static string Vues = "";
    static List<Carte> Lister(out string erreur)
    {
        erreur = null;
        List<string> vues = new List<string>();
        List<Carte> liste = new List<Carte>();
        IntPtr tous = IntPtr.Zero;
        StringBuilder eb = new StringBuilder(512);
        if (pcap_findalldevs(ref tous, eb) != 0) { erreur = "Npcap : " + eb.ToString(); return liste; }
        try
        {
            for (IntPtr p = tous; p != IntPtr.Zero; p = Marshal.ReadIntPtr(p, 0))
            {
                string nom = Marshal.PtrToStringAnsi(Marshal.ReadIntPtr(p, IntPtr.Size)) ?? "";
                IntPtr d = Marshal.ReadIntPtr(p, IntPtr.Size * 2);
                string desc = d == IntPtr.Zero ? "" : (Marshal.PtrToStringAnsi(d) ?? "");
                uint drapeaux = (uint)Marshal.ReadInt32(p, IntPtr.Size * 4);
                string tout = (nom + " " + desc).ToLowerInvariant();
                vues.Add(desc.Length > 0 ? desc : nom);
                bool boucle = tout.Contains("loopback") || nom == "lo" || (drapeaux & 1) != 0;
                if (!boucle && (tout.Contains("hyper-v") || tout.Contains("vmware") || tout.Contains("virtualbox") || tout.Contains("tap-windows") || tout.Contains("wan miniport") || tout.Contains("bluetooth"))) continue;
                if (nom == "any" || tout.Contains("nflog") || tout.Contains("nfqueue") || tout.Contains("usbmon") || tout.Contains("dbus")) continue;
                Carte c = new Carte();
                c.Nom = nom; c.Desc = desc.Length > 0 ? desc : nom; c.Boucle = boucle;
                liste.Add(c);
            }
        }
        finally { pcap_freealldevs(tous); }
        Vues = string.Join(", ", vues.ToArray());
        return liste;
    }

    // Appelé sous verrou
    static string OuvrirToutes()
    {
        string erreur;
        List<Carte> liste = Lister(out erreur);
        if (erreur != null) return erreur;
        List<Carte> ouvertes = new List<Carte>();
        List<string> refus = new List<string>();
        foreach (Carte c in liste)
        {
            StringBuilder eb = new StringBuilder(512);
            IntPtr h = pcap_open_live(c.Nom, 65535, 0, 100, eb);
            if (h == IntPtr.Zero) { refus.Add(c.Desc + " : " + eb.ToString()); continue; }
            try { pcap_setbuff(h, 32 * 1024 * 1024); } catch { }
            c.H = h;
            c.Lien = pcap_datalink(h);
            if (!Filtrer(c, "tcp")) { pcap_close(h); c.H = IntPtr.Zero; refus.Add(c.Desc + " : filtre refusé"); continue; }
            ouvertes.Add(c);
        }
        if (ouvertes.Count == 0)
        {
            string detail = refus.Count > 0 ? string.Join(" | ", refus.ToArray()) : "aucune carte réseau trouvée";
            return "Impossible d'ouvrir une carte réseau avec Npcap (" + detail + "). Cartes vues : " + (Vues.Length > 0 ? Vues : "aucune") + ".";
        }
        cartes = ouvertes;
        verrouille = false; grace = false; gagnante = null; portVerrou = 0;
        coups.Clear();
        lock (attendu) attendu.Clear();
        foreach (Carte c in ouvertes)
        {
            Thread t = new Thread(Boucle);
            t.IsBackground = true;
            t.Name = "capture";
            c.Fil = t;
            t.Start(c);
        }
        Emettre("{\"type\":\"etat\",\"etape\":\"recherche\",\"cartes\":" + ouvertes.Count + ",\"refus\":" + refus.Count + ",\"version\":" + Js(Version) + "}");
        return null;
    }

    static bool Filtrer(Carte c, string filtre)
    {
        IntPtr prog = Marshal.AllocHGlobal(16);
        try
        {
            Marshal.WriteInt64(prog, 0, 0);
            Marshal.WriteInt64(prog, 8, 0);
            if (pcap_compile(c.H, prog, filtre, 1, 0xFFFFFFFF) != 0) return false;
            int r = pcap_setfilter(c.H, prog);
            pcap_freecode(prog);
            return r == 0;
        }
        catch { return false; }
        finally { Marshal.FreeHGlobal(prog); }
    }

    static void Boucle(object o)
    {
        Carte c = (Carte)o;
        int decalage = windows ? 8 : 16; // position de caplen dans pcap_pkthdr (timeval 32 bits sous Windows)
        int erreurs = 0;
        while (!c.Arret)
        {
            string f = c.FiltreEnAttente;
            if (f != null) { c.FiltreEnAttente = null; Filtrer(c, f); }
            IntPtr hdr, data;
            int r;
            try { r = pcap_next_ex(c.H, out hdr, out data); }
            catch { break; }
            if (r == 0) continue;
            if (r < 0)
            {
                if (r == -2 || ++erreurs > 40) break;
                Thread.Sleep(50);
                continue;
            }
            erreurs = 0;
            int caplen = Marshal.ReadInt32(hdr, decalage);
            if (caplen <= 0 || caplen > 262144) continue;
            byte[] trame = new byte[caplen];
            Marshal.Copy(data, trame, 0, caplen);
            try { Traiter(c, trame); } catch { }
        }
        try { pcap_close(c.H); } catch { }
        c.H = IntPtr.Zero;
    }

    static int DebutIp(int lien, byte[] t)
    {
        switch (lien)
        {
            case 1:
                {
                    if (t.Length < 14) return -1;
                    int et = (t[12] << 8) | t[13], o = 14;
                    while (et == 0x8100 || et == 0x88A8)
                    {
                        if (t.Length < o + 4) return -1;
                        et = (t[o + 2] << 8) | t[o + 3];
                        o += 4;
                    }
                    return (et == 0x0800 || et == 0x86DD) ? o : -1;
                }
            case 0: case 109: return 4;
            case 12: case 14: case 101: return 0;
            case 113: return 16;
            case 276: return 20;
            default: return -1;
        }
    }

    // Exposé pour les tests : traite une trame brute comme si elle venait de la carte « lien ».
    public static void Traiter(object carte, byte[] t)
    {
        Carte c = (Carte)carte;
        int ip = DebutIp(c.Lien, t);
        if (ip < 0 || ip >= t.Length) return;
        int v = t[ip] >> 4, tcp, fin;
        if (v == 4)
        {
            if (t.Length < ip + 20 || t[ip + 9] != 6) return;
            int ihl = (t[ip] & 0x0F) * 4;
            int total = (t[ip + 2] << 8) | t[ip + 3];
            tcp = ip + ihl;
            fin = total > 0 ? Math.Min(t.Length, ip + total) : t.Length;
        }
        else if (v == 6)
        {
            if (t.Length < ip + 40 || t[ip + 6] != 6) return;
            int charge = (t[ip + 4] << 8) | t[ip + 5];
            tcp = ip + 40;
            fin = charge > 0 ? Math.Min(t.Length, tcp + charge) : t.Length;
        }
        else return;
        if (fin < tcp + 20) return;
        int src = (t[tcp] << 8) | t[tcp + 1];
        int dst = (t[tcp + 2] << 8) | t[tcp + 3];
        uint seq = ((uint)t[tcp + 4] << 24) | ((uint)t[tcp + 5] << 16) | ((uint)t[tcp + 6] << 8) | t[tcp + 7];
        int debut = tcp + (t[tcp + 12] >> 4) * 4;
        byte drapeaux = t[tcp + 13];
        int n = fin - debut;
        if (n <= 0) return;
        if (!verrouille) { Detecter(c, src, t, debut, n); return; }
        if (c != gagnante || src != portVerrou) return;
        Interlocked.Increment(ref paquetsVeille);
        Interlocked.Increment(ref paquetsTotal);
        Interlocked.Add(ref octetsTotal, n);
        Flux(dst, seq, drapeaux, t, debut, n);
    }

    static bool Contient(byte[] t, int debut, int n)
    {
        int fin = debut + n - Motif.Length;
        for (int i = debut; i <= fin; i++)
            if (t[i] == Motif[0] && t[i + 1] == Motif[1] && t[i + 2] == Motif[2]) return true;
        return false;
    }

    static void Detecter(Carte c, int port, byte[] t, int debut, int n)
    {
        if (n < Motif.Length || !Contient(t, debut, n)) return;
        lock (verrou)
        {
            if (verrouille || !actif) return;
            int idx = cartes.IndexOf(c);
            if (idx < 0) return;
            string cle = idx + ":" + port;
            int h;
            coups.TryGetValue(cle, out h);
            coups[cle] = ++h;
            if (h >= Seuil && !grace) { grace = true; finGrace = DateTime.UtcNow.AddMilliseconds(GraceMs); }
        }
    }

    // Appelé sous verrou
    static void Choisir()
    {
        Carte meilleureBoucle = null, meilleurePhys = null;
        int portBoucle = 0, portPhys = 0, coupsBoucle = 0, coupsPhys = 0;
        foreach (KeyValuePair<string, int> kv in coups)
        {
            if (kv.Value < Seuil) continue;
            string[] p = kv.Key.Split(':');
            int idx = int.Parse(p[0]), port = int.Parse(p[1]);
            if (idx >= cartes.Count) continue;
            Carte c = cartes[idx];
            if (c.Boucle && kv.Value > coupsBoucle) { meilleureBoucle = c; portBoucle = port; coupsBoucle = kv.Value; }
            else if (!c.Boucle && kv.Value > coupsPhys) { meilleurePhys = c; portPhys = port; coupsPhys = kv.Value; }
        }
        Carte g = meilleureBoucle ?? meilleurePhys;
        int port2 = meilleureBoucle != null ? portBoucle : portPhys;
        grace = false;
        coups.Clear();
        if (g == null) return;
        gagnante = g;
        portVerrou = port2;
        lock (attendu) attendu.Clear();
        verrouille = true;
        g.FiltreEnAttente = "tcp src port " + port2;
        foreach (Carte c in cartes) if (c != g) c.Arret = true;
        paquetsVeille = 0;
        dernierControle = DateTime.UtcNow;
        Emettre("{\"type\":\"verrou\",\"carte\":" + Js(g.Desc) + ",\"boucle\":" + (g.Boucle ? "true" : "false") + ",\"port\":" + port2 + "}");
    }

    static void Controle(object etat)
    {
        lock (verrou)
        {
            if (!actif) return;
            DateTime maintenant = DateTime.UtcNow;
            if (rouvrirA != DateTime.MaxValue)
            {
                if (maintenant < rouvrirA) return;
                rouvrirA = DateTime.MaxValue;
                string err = OuvrirToutes();
                if (err != null) Emettre("{\"type\":\"erreur\",\"message\":" + Js(err) + "}");
                return;
            }
            if (grace && maintenant >= finGrace) Choisir();
            if (verrouille && (maintenant - dernierControle).TotalMilliseconds >= VeilleMs)
            {
                dernierControle = maintenant;
                if (Interlocked.Exchange(ref paquetsVeille, 0) == 0)
                {
                    // plus rien depuis une minute (changement de serveur, reconnexion) : on recherche à nouveau
                    verrouille = false;
                    gagnante = null;
                    foreach (Carte c in cartes) c.Arret = true;
                    cartes = new List<Carte>();
                    rouvrirA = maintenant.AddMilliseconds(600);
                    Emettre("{\"type\":\"perdu\"}");
                    return;
                }
            }
            if ((maintenant - dernieresStats).TotalMilliseconds >= 5000)
            {
                dernieresStats = maintenant;
                Emettre("{\"type\":\"stats\",\"paquets\":" + Interlocked.Read(ref paquetsTotal) + ",\"octets\":" + Interlocked.Read(ref octetsTotal) + "}");
            }
        }
    }

    // Reconstitution du flux TCP serveur → client (port du client = clé du flux)
    static void Flux(int port, uint seq, byte drapeaux, byte[] t, int debut, int n)
    {
        uint virt = (uint)n;
        if ((drapeaux & 0x02) != 0) virt++;
        if ((drapeaux & 0x01) != 0) virt++;
        uint suivant = seq + virt;
        bool trou = false;
        lock (attendu)
        {
            uint att;
            if (!attendu.TryGetValue(port, out att)) { attendu[port] = suivant; trou = true; }
            else
            {
                int ecart = (int)(seq - att);
                if (ecart < 0)
                {
                    if ((int)(suivant - att) <= 0) return; // doublon (retransmission)
                    int deja = -ecart;
                    if (deja >= n) return;
                    debut += deja; n -= deja;
                }
                else if (ecart > 0) trou = true; // paquet manquant : le lecteur se resynchronise
                attendu[port] = suivant;
            }
        }
        Emettre("{\"type\":\"tcp\",\"p\":" + port + ",\"g\":" + (trou ? 1 : 0) + ",\"d\":\"" + Convert.ToBase64String(t, debut, n) + "\"}");
    }

    // Pour les tests : carte fictive (lien Ethernet = 1)
    public static object CarteTest(int lien, bool boucle)
    {
        Carte c = new Carte();
        c.Nom = "test"; c.Desc = "test"; c.Lien = lien; c.Boucle = boucle;
        lock (verrou) { cartes = new List<Carte>(); cartes.Add(c); actif = true; }
        return c;
    }
    public static void ControleTest() { Controle(null); }
    public static void ForcerGrace() { lock (verrou) { finGrace = DateTime.UtcNow.AddMilliseconds(-1); } }
}
'@

Add-Type -TypeDefinition $source

# État de Npcap sur ce PC, pour expliquer un échec d'ouverture des cartes réseau
function Get-NpcapDiag {
    $d = @{ service = $null; demarrage = $null; adminOnly = $null; loopback = $null; dll = @(); version = [A2Capture]::Version; winpcapCompat = $null }
    try { $svc = Get-Service -Name npcap -ErrorAction Stop; $d.service = [string]$svc.Status } catch { $d.service = 'absent' }
    try {
        $p = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\npcap' -ErrorAction Stop
        $d.demarrage = [int]$p.Start
        $q = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\npcap\Parameters' -ErrorAction SilentlyContinue
        if ($q) { $d.adminOnly = [int]$q.AdminOnly; $d.loopback = [int]$q.LoopbackSupport; $d.winpcapCompat = [int]$q.WinPcapCompatible }
    } catch { }
    try {
        foreach ($m in [System.Diagnostics.Process]::GetCurrentProcess().Modules) {
            if ($m.ModuleName -match '^(wpcap|packet)\.dll$') { $d.dll += $m.FileName }
        }
    } catch { }
    return $d
}

[Console]::Out.WriteLine('{"type":"ready"}')
[Console]::Out.Flush()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line -or $line -eq 'quit') { [A2Capture]::Arreter(); break }
    try {
        if ($line -eq 'start') {
            $err = [A2Capture]::Demarrer()
            if ($err -eq 'npcap') { [Console]::Out.WriteLine('{"type":"erreur","code":"npcap","message":"Npcap n''est pas installé."}') }
            elseif ($err) { [Console]::Out.WriteLine((@{ type = 'erreur'; message = [string]$err; diag = (Get-NpcapDiag) } | ConvertTo-Json -Compress -Depth 4)) }
            [Console]::Out.Flush()
        }
        elseif ($line -eq 'stop') { [A2Capture]::Arreter() }
    }
    catch {
        [Console]::Out.WriteLine((@{ type = 'erreur'; message = $_.Exception.Message } | ConvertTo-Json -Compress))
        [Console]::Out.Flush()
    }
}
