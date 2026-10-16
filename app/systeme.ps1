# PichetMeter — mesures système pour le widget de ping
# Utilisation du GPU (compteurs Windows « GPU Engine », ou nvidia-smi), températures (nvidia-smi pour le GPU,
# zones thermiques ACPI de Windows pour le CPU), mémoire utilisée par le jeu, niveau sonore du lecteur vidéo.
# Aucune lecture de la mémoire du jeu : seulement les compteurs publics de Windows.
# Protocole : une commande JSON par ligne sur l'entrée standard, une réponse JSON par ligne en sortie.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class PMSysteme
{
    static Dictionary<string, PerformanceCounter> moteurs = new Dictionary<string, PerformanceCounter>();
    static DateTime liste = DateTime.MinValue;

    // Somme de l'utilisation des moteurs 3D de toutes les applications (comme le Gestionnaire des tâches)
    public static double Gpu()
    {
        try
        {
            if ((DateTime.Now - liste).TotalSeconds > 10)
            {
                liste = DateTime.Now;
                PerformanceCounterCategory cat = new PerformanceCounterCategory("GPU Engine");
                Dictionary<string, bool> vus = new Dictionary<string, bool>();
                foreach (string n in cat.GetInstanceNames())
                {
                    if (n.IndexOf("engtype_3D", StringComparison.OrdinalIgnoreCase) < 0) continue;
                    vus[n] = true;
                    if (!moteurs.ContainsKey(n))
                    {
                        PerformanceCounter c = new PerformanceCounter("GPU Engine", "Utilization Percentage", n, true);
                        c.NextValue();
                        moteurs[n] = c;
                    }
                }
                List<string> retirer = new List<string>();
                foreach (string k in moteurs.Keys) if (!vus.ContainsKey(k)) retirer.Add(k);
                foreach (string k in retirer) { moteurs[k].Dispose(); moteurs.Remove(k); }
            }
            double total = 0;
            foreach (PerformanceCounter c in moteurs.Values) { try { total += c.NextValue(); } catch { } }
            return Math.Min(100.0, total);
        }
        catch { return -1; }
    }

    public static long RamProcessus(int pid)
    {
        if (pid <= 0) return -1;
        try { using (Process p = Process.GetProcessById(pid)) { return p.WorkingSet64; } }
        catch { return -1; }
    }
}

// Niveau sonore d'une application (VLC, lecteur intégré) : crête des sessions audio de Windows (Core Audio),
// comme les vumètres du mélangeur de volume. Lecture seule : rien n'est modifié.
public static class PMSon
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int flux, int etats, out IntPtr appareils);
        [PreserveSig] int GetDefaultAudioEndpoint(int flux, int role, out IMMDevice appareil);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int contexte, IntPtr parametres, [MarshalAs(UnmanagedType.IUnknown)] out object objet);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int n);
        [PreserveSig] int GetSession(int i, out IAudioSessionControl2 session);
    }

    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int etat);
        [PreserveSig] int GetDisplayName(out IntPtr nom);
        [PreserveSig] int SetDisplayName(IntPtr a, IntPtr b);
        [PreserveSig] int GetIconPath(out IntPtr chemin);
        [PreserveSig] int SetIconPath(IntPtr a, IntPtr b);
        [PreserveSig] int GetGroupingParam(out Guid groupe);
        [PreserveSig] int SetGroupingParam(IntPtr a, IntPtr b);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr a);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr a);
        [PreserveSig] int GetSessionIdentifier(out IntPtr id);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
        [PreserveSig] int GetProcessId(out uint pid);
    }

    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioMeterInformation
    {
        [PreserveSig] int GetPeakValue(out float crete);
    }

    static List<KeyValuePair<uint, IAudioMeterInformation>> compteurs = new List<KeyValuePair<uint, IAudioMeterInformation>>();
    static DateTime liste = DateTime.MinValue;

    static void Lister()
    {
        compteurs.Clear();
        IMMDeviceEnumerator enumerateur = (IMMDeviceEnumerator)new MMDeviceEnumerator();
        IMMDevice appareil;
        if (enumerateur.GetDefaultAudioEndpoint(0, 1, out appareil) != 0 || appareil == null) return; // sortie, multimédia
        Guid iid = typeof(IAudioSessionManager2).GUID;
        object objet;
        if (appareil.Activate(ref iid, 23, IntPtr.Zero, out objet) != 0 || objet == null) return;
        IAudioSessionEnumerator sessions;
        if (((IAudioSessionManager2)objet).GetSessionEnumerator(out sessions) != 0 || sessions == null) return;
        int n;
        if (sessions.GetCount(out n) != 0) return;
        for (int i = 0; i < n; i++)
        {
            IAudioSessionControl2 session;
            if (sessions.GetSession(i, out session) != 0 || session == null) continue;
            uint pid;
            if (session.GetProcessId(out pid) < 0) continue;
            IAudioMeterInformation compteur = session as IAudioMeterInformation;
            if (compteur != null) compteurs.Add(new KeyValuePair<uint, IAudioMeterInformation>(pid, compteur));
        }
    }

    // Crête (0 à 1) des sessions audio des processus donnés ; -1 si Windows ne donne pas l'information
    public static double Niveau(int[] pids)
    {
        if ((DateTime.Now - liste).TotalSeconds > 2)
        {
            liste = DateTime.Now;
            try { Lister(); } catch { compteurs.Clear(); return -1; }
        }
        float max = 0;
        foreach (KeyValuePair<uint, IAudioMeterInformation> c in compteurs)
        {
            if (Array.IndexOf(pids, (int)c.Key) < 0) continue;
            try { float crete; if (c.Value.GetPeakValue(out crete) == 0 && crete > max) max = crete; } catch { }
        }
        return max;
    }
}
'@
Add-Type -TypeDefinition $source

function Send($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

$nvsmi = Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'
if (-not (Test-Path -LiteralPath $nvsmi)) {
    $nvsmi = Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe'
    if (-not (Test-Path -LiteralPath $nvsmi)) { $nvsmi = $null }
}
$cpuTemp = $null
$cpuTempLu = [DateTime]::MinValue

function Nvidia {
    if (-not $nvsmi) { return $null }
    try {
        $l = & $nvsmi --query-gpu=temperature.gpu,utilization.gpu,name --format=csv,noheader,nounits 2>$null | Select-Object -First 1
        if (-not $l) { return $null }
        $p = $l -split ',\s*'
        return @{ temp = [double]$p[0]; usage = [double]$p[1]; nom = ($p[2]).Trim() }
    }
    catch { return $null }
}

# Zones thermiques ACPI (sans droits administrateur sur Windows 10 / 11) : proche de la température du processeur
function TempCpu {
    if (([DateTime]::Now - $script:cpuTempLu).TotalSeconds -lt 5) { return $script:cpuTemp }
    $script:cpuTempLu = [DateTime]::Now
    $t = $null
    try {
        $zones = Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction Stop
        foreach ($z in $zones) {
            $k = $null
            if ($z.HighPrecisionTemperature) { $k = [double]$z.HighPrecisionTemperature / 10 } elseif ($z.Temperature) { $k = [double]$z.Temperature }
            if ($k -and $k -gt 250) { $c = $k - 273.15; if ($null -eq $t -or $c -gt $t) { $t = $c } }
        }
    }
    catch { }
    if ($null -eq $t) {
        try {
            foreach ($z in (Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop)) {
                $c = [double]$z.CurrentTemperature / 10 - 273.15
                if ($c -gt 0 -and ($null -eq $t -or $c -gt $t)) { $t = $c }
            }
        }
        catch { }
    }
    if ($null -ne $t) { $t = [math]::Round($t) }
    $script:cpuTemp = $t
    return $t
}

Send @{ type = 'ready'; nvidia = ($null -ne $nvsmi) }

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    if ($line.Trim() -eq '') { continue }
    $cmd = $null
    try {
        $cmd = $line | ConvertFrom-Json
        switch ($cmd.cmd) {
            'sys' {
                $out = @{ type = 'sys'; id = $cmd.id; gpu = $null; gpuTemp = $null; gpuNom = $null; cpuTemp = $null; jeuRam = $null }
                $nv = Nvidia
                if ($nv) { $out.gpu = $nv.usage; $out.gpuTemp = $nv.temp; $out.gpuNom = $nv.nom }
                else { $g = [PMSysteme]::Gpu(); if ($g -ge 0) { $out.gpu = [math]::Round($g) } }
                if ($cmd.temp) { $out.cpuTemp = TempCpu }
                if ($cmd.pid) { $r = [PMSysteme]::RamProcessus([int]$cmd.pid); if ($r -ge 0) { $out.jeuRam = $r } }
                Send $out
            }
            'audio' {
                $pids = [int[]]@($cmd.pids | ForEach-Object { [int]$_ })
                Send @{ type = 'audio'; id = $cmd.id; niveau = [math]::Round([PMSon]::Niveau($pids), 3) }
            }
            'quit' { exit 0 }
            default { Send @{ type = 'error'; id = $cmd.id; error = 'Commande inconnue' } }
        }
    }
    catch {
        $id = $null
        if ($cmd) { $id = $cmd.id }
        Send @{ type = 'error'; id = $id; error = $_.Exception.Message }
    }
}
