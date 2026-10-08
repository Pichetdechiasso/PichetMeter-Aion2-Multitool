# Installation de PichetMeter
# 1. télécharge le moteur Electron officiel (github.com/electron/electron) et vérifie son empreinte SHA-256 ;
# 2. installe PichetMeter.exe dans %LOCALAPPDATA%\Programs\PichetMeter ;
# 3. copie l'application, crée les raccourcis Bureau et menu Démarrer, l'entrée « Applications installées »,
#    puis lance l'application.
# Relancer ce script met l'application à jour sans retélécharger le moteur.
# Une installation de l'ancienne version « Aion 2 Companion HUD » est reprise (moteur, réglages) puis retirée.
param(
    [string]$Destination = '',
    [string]$RuntimeZip = '',
    [switch]$NoShortcuts,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ElectronVersion = 'v44.5.1'
$AppVersion = '1.7.0'
$AppName = 'PichetMeter'
$ExeName = 'PichetMeter.exe'
$Icone = 'PichetMeter.ico'
$Auteur = '@atomedims'
$AncienNom = 'Aion 2 Companion HUD'
$AncienExe = 'Aion2CompanionHUD.exe'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$zipName = "electron-$ElectronVersion-win32-x64.zip"
$base = "https://github.com/electron/electron/releases/download/$ElectronVersion"
$surWindows = ($IsWindows -ne $false)

function Etape([string]$texte) { Write-Host ''; Write-Host "> $texte" -ForegroundColor Cyan }
function DossiersRaccourcis {
    if (-not $surWindows) { return @() }
    return @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) | Where-Object { $_ }
}

try {
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
    if (-not $Destination) {
        if (-not $env:LOCALAPPDATA) { throw 'Dossier %LOCALAPPDATA% introuvable.' }
        $Destination = Join-Path $env:LOCALAPPDATA 'Programs\PichetMeter'
    }
    Write-Host "Installation de $AppName $AppVersion" -ForegroundColor Green
    Write-Host "Dossier : $Destination"

    # Sources : paquet de version (fichiers\app, fichiers\PichetMeter.ico)
    # ou code source du dépôt GitHub (app\ et icon.ico à la racine, installeur dans setup\fichiers)
    $source = Join-Path $here 'app'
    $iconeSource = Join-Path $here $Icone
    $notice = Join-Path (Split-Path -Parent $here) 'LISEZ-MOI.txt'
    if (-not (Test-Path -LiteralPath (Join-Path $source 'main.js'))) {
        $racine = Split-Path -Parent (Split-Path -Parent $here)
        if (Test-Path -LiteralPath (Join-Path $racine 'app\main.js')) {
            $source = Join-Path $racine 'app'
            $iconeSource = Join-Path $racine 'icon.ico'
            $notice = Join-Path $racine 'LISEZ-MOI.txt'
        }
    }
    # Le paquet doit être complet (zip entièrement décompressé)
    foreach ($f in @((Join-Path $source 'main.js'), (Join-Path $source 'ui.html'), (Join-Path $source 'preload.js'), (Join-Path $source 'package.json'), $iconeSource)) {
        if (-not (Test-Path -LiteralPath $f)) {
            throw "Fichier manquant : $f. Décompresse tout le zip (clic droit > Extraire tout), puis relance Installer.cmd depuis le dossier extrait."
        }
    }

    $ouvert = Get-Process -Name 'PichetMeter', 'Aion2CompanionHUD' -ErrorAction SilentlyContinue
    if ($ouvert) {
        Etape "Fermeture de l'application ouverte..."
        $ouvert | Stop-Process -Force
        Start-Sleep -Seconds 2
    }

    # Ancienne version « Aion 2 Companion HUD » : le moteur déjà téléchargé est réutilisé, puis l'ancien dossier est retiré
    $ancien = ''
    if ($env:LOCALAPPDATA) { $ancien = Join-Path $env:LOCALAPPDATA 'Programs\Aion2CompanionHUD' }
    if ($ancien -and ($ancien -ne $Destination) -and (Test-Path -LiteralPath $ancien)) {
        Etape "Ancienne version « $AncienNom » trouvée : passage au nom $AppName (tes réglages sont conservés)..."
        if (-not (Test-Path -LiteralPath $Destination)) {
            try {
                Move-Item -LiteralPath $ancien -Destination $Destination
                $vieilExe = Join-Path $Destination $AncienExe
                if (Test-Path -LiteralPath $vieilExe) { Move-Item -LiteralPath $vieilExe -Destination (Join-Path $Destination $ExeName) -Force }
                Remove-Item -LiteralPath (Join-Path $Destination 'Aion2CompanionHUD.ico') -Force -ErrorAction SilentlyContinue
                Write-Host '  Moteur repris, pas de nouveau téléchargement.'
            }
            catch { Write-Host ("  Reprise impossible (" + $_.Exception.Message + ") : installation complète.") -ForegroundColor DarkYellow }
        }
        if (Test-Path -LiteralPath $ancien) { Remove-Item -LiteralPath $ancien -Recurse -Force -ErrorAction SilentlyContinue }
        foreach ($dossier in (DossiersRaccourcis)) { Remove-Item -LiteralPath (Join-Path $dossier "$AncienNom.lnk") -Force -ErrorAction SilentlyContinue }
    }

    $marqueur = Join-Path $Destination 'moteur.txt'
    $installe = ''
    if (Test-Path -LiteralPath $marqueur) { $installe = (Get-Content -LiteralPath $marqueur -Raw).Trim() }
    if ($installe -ne $ElectronVersion -or -not (Test-Path -LiteralPath (Join-Path $Destination $ExeName))) {
        $zip = $RuntimeZip
        if (-not $zip) {
            $zip = Join-Path ([IO.Path]::GetTempPath()) $zipName
            Etape "Téléchargement du moteur Electron $ElectronVersion depuis GitHub (environ 150 Mo, une seule fois)..."
            Invoke-WebRequest -Uri "$base/$zipName" -OutFile $zip -UseBasicParsing
        }

        Etape "Vérification de l'empreinte SHA-256 officielle..."
        $sommes = (Invoke-WebRequest -Uri "$base/SHASUMS256.txt" -UseBasicParsing).Content
        if ($sommes -is [byte[]]) { $sommes = [Text.Encoding]::UTF8.GetString($sommes) }
        $ligne = ($sommes -split "`r?`n") | Where-Object { $_ -match ([regex]::Escape($zipName) + '\s*$') } | Select-Object -First 1
        if (-not $ligne) { throw "Empreinte officielle introuvable pour $zipName." }
        $attendu = ($ligne.Trim() -split '\s+')[0].ToLowerInvariant()
        $obtenu = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($obtenu -ne $attendu) {
            if (-not $RuntimeZip) { Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue }
            throw "Le téléchargement est incomplet ou corrompu (empreinte différente). Relance l'installation."
        }
        Write-Host '  Empreinte conforme.'

        Etape 'Installation du moteur...'
        if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
        New-Item -ItemType Directory -Path $Destination -Force | Out-Null
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $Destination)
        if (-not $RuntimeZip) { Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue }
        Move-Item -LiteralPath (Join-Path $Destination 'electron.exe') -Destination (Join-Path $Destination $ExeName) -Force
        Remove-Item -LiteralPath (Join-Path (Join-Path $Destination 'resources') 'default_app.asar') -Force -ErrorAction SilentlyContinue
        $langues = @('fr.pak', 'en-US.pak', 'en-GB.pak')
        Get-ChildItem -LiteralPath (Join-Path $Destination 'locales') -File | Where-Object { $langues -notcontains $_.Name } | Remove-Item -Force
        Set-Content -LiteralPath $marqueur -Value $ElectronVersion -Encoding ASCII
    }
    else {
        Etape "Moteur Electron $ElectronVersion déjà installé : mise à jour de l'application seulement."
    }

    $rcedit = Join-Path $here 'rcedit-x64.exe'
    if ($surWindows -and (Test-Path -LiteralPath $rcedit)) {
        Etape "Nom et icône de l'exécutable..."
        try {
            & $rcedit (Join-Path $Destination $ExeName) --set-icon $iconeSource `
                --set-version-string ProductName $AppName --set-version-string FileDescription $AppName `
                --set-version-string OriginalFilename $ExeName --set-version-string InternalName $AppName `
                --set-version-string CompanyName $Auteur --set-version-string LegalCopyright "$Auteur - GNU GPL-3.0" `
                --set-file-version $AppVersion --set-product-version $AppVersion
            if ($LASTEXITCODE -ne 0) { Write-Host '  Icône non appliquée (sans conséquence sur le fonctionnement).' -ForegroundColor DarkYellow }
        }
        catch { Write-Host '  Icône non appliquée (sans conséquence sur le fonctionnement).' -ForegroundColor DarkYellow }
    }

    Etape "Copie de l'application..."
    $appDest = Join-Path (Join-Path $Destination 'resources') 'app'
    if (Test-Path -LiteralPath $appDest) { Remove-Item -LiteralPath $appDest -Recurse -Force }
    Copy-Item -LiteralPath $source -Destination $appDest -Recurse -Force
    Copy-Item -LiteralPath $iconeSource -Destination (Join-Path $Destination $Icone) -Force
    Copy-Item -LiteralPath (Join-Path $here 'desinstaller.ps1') -Destination $Destination -Force
    if (Test-Path -LiteralPath $notice) { Copy-Item -LiteralPath $notice -Destination $Destination -Force }
    if (-not (Test-Path -LiteralPath (Join-Path $appDest 'main.js'))) { throw "La copie de l'application a échoué ($appDest)." }
    # Retire la marque « téléchargé depuis Internet » (sans effet hors Windows).
    if ($surWindows) { try { Get-ChildItem -LiteralPath $Destination -Recurse -File | Unblock-File -ErrorAction SilentlyContinue } catch { } }

    if (-not $NoShortcuts -and $surWindows) {
        Etape 'Raccourcis sur le Bureau et dans le menu Démarrer...'
        $shell = New-Object -ComObject WScript.Shell
        foreach ($dossier in (DossiersRaccourcis)) {
            $lnk = $shell.CreateShortcut((Join-Path $dossier "$AppName.lnk"))
            $lnk.TargetPath = Join-Path $Destination $ExeName
            $lnk.WorkingDirectory = $Destination
            $lnk.IconLocation = (Join-Path $Destination $Icone) + ',0'
            $lnk.Description = "$AppName - compagnon pour Aion 2"
            $lnk.Save()
        }
        # Entrée dans Paramètres > Applications installées (désinstallation depuis Windows)
        try {
            $cle = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PichetMeter'
            New-Item -Path $cle -Force | Out-Null
            $taille = [int]((Get-ChildItem -LiteralPath $Destination -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB)
            $valeurs = @{
                DisplayName = $AppName; DisplayVersion = $AppVersion; Publisher = $Auteur; InstallLocation = $Destination
                DisplayIcon = (Join-Path $Destination $Icone); URLInfoAbout = 'https://discord.gg/KrkJrjrDJt'
                UninstallString = ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $Destination 'desinstaller.ps1') + '" -Destination "' + $Destination + '"')
            }
            foreach ($k in $valeurs.Keys) { New-ItemProperty -Path $cle -Name $k -Value $valeurs[$k] -PropertyType String -Force | Out-Null }
            New-ItemProperty -Path $cle -Name 'NoModify' -Value 1 -PropertyType DWord -Force | Out-Null
            New-ItemProperty -Path $cle -Name 'NoRepair' -Value 1 -PropertyType DWord -Force | Out-Null
            New-ItemProperty -Path $cle -Name 'EstimatedSize' -Value $taille -PropertyType DWord -Force | Out-Null
        }
        catch { Write-Host '  Entrée « Applications installées » non créée (sans conséquence).' -ForegroundColor DarkYellow }
    }

    Write-Host ''
    Write-Host 'Installation terminée.' -ForegroundColor Green
    Write-Host "Lance « $AppName » depuis le raccourci du Bureau. Alt + C affiche ou masque l'overlay."
    if (-not $NoLaunch) { Start-Process -FilePath (Join-Path $Destination $ExeName) -WorkingDirectory $Destination }
    exit 0
}
catch {
    Write-Host ''
    Write-Host ('Erreur : ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
