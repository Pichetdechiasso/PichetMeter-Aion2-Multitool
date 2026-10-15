# PichetMeter — mesures système pour le widget de ping
# Utilisation du GPU (compteurs Windows « GPU Engine », ou nvidia-smi), températures (nvidia-smi pour le GPU,
# zones thermiques ACPI de Windows pour le CPU), mémoire utilisée par le jeu.
# Aucune lecture de la mémoire du jeu : seulement les compteurs publics de Windows.
# Protocole : une commande JSON par ligne sur l'entrée standard, une réponse JSON par ligne en sortie.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;

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
