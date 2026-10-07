# Désinstallation de PichetMeter (et de l'ancienne version « Aion 2 Companion HUD » si elle est encore présente)
param([string]$Destination = '')
$ErrorActionPreference = 'Stop'
$AppName = 'PichetMeter'
$AncienNom = 'Aion 2 Companion HUD'
try {
    if (-not $Destination) { $Destination = Join-Path $env:LOCALAPPDATA 'Programs\PichetMeter' }
    $ancien = Join-Path $env:LOCALAPPDATA 'Programs\Aion2CompanionHUD'
    Get-Process -Name 'PichetMeter', 'Aion2CompanionHUD' -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
    # Le script peut tourner depuis le dossier installé : on en sort avant de le supprimer
    Set-Location -LiteralPath $env:TEMP
    foreach ($dossier in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
        if (-not $dossier) { continue }
        foreach ($nom in @($AppName, $AncienNom)) { Remove-Item -LiteralPath (Join-Path $dossier "$nom.lnk") -Force -ErrorAction SilentlyContinue }
    }
    # Fichiers d'abord (quelques essais : un antivirus ou l'Explorateur peut garder un fichier ouvert un instant)
    foreach ($d in @($Destination, $ancien)) {
        for ($essai = 1; (Test-Path -LiteralPath $d) -and $essai -le 5; $essai++) {
            try { Remove-Item -LiteralPath $d -Recurse -Force -ErrorAction Stop }
            catch { if ($essai -eq 5) { throw "Impossible de supprimer $d : $($_.Exception.Message). Ferme PichetMeter et réessaie." }; Start-Sleep -Seconds 1 }
        }
    }
    # Entrée « Applications installées » en dernier : elle reste tant que les fichiers ne sont pas supprimés
    Remove-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PichetMeter' -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "$AppName est désinstallé." -ForegroundColor Green
    $reglages = @((Join-Path $env:APPDATA 'PichetMeter'), (Join-Path $env:APPDATA 'Aion2CompanionHUD')) | Where-Object { Test-Path -LiteralPath $_ }
    if ($reglages) {
        $reponse = Read-Host 'Supprimer aussi tes comptes, réglages et historique ? (o/N)'
        if ($reponse -match '^[oOyY]') { $reglages | ForEach-Object { Remove-Item -LiteralPath $_ -Recurse -Force }; Write-Host 'Réglages supprimés.' }
        else { Write-Host ('Réglages conservés dans ' + ($reglages -join ', ')) }
    }
    Start-Sleep -Seconds 2
    exit 0
}
catch {
    Write-Host ('Erreur : ' + $_.Exception.Message) -ForegroundColor Red
    Start-Sleep -Seconds 5
    exit 1
}
