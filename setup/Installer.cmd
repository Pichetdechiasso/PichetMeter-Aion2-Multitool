@echo off
chcp 65001 >nul
title Installation de PichetMeter
if not exist "%~dp0fichiers\installer.ps1" (
  echo.
  echo Le dossier "fichiers" est introuvable.
  echo Decompresse d'abord tout le zip ^(clic droit ^> Extraire tout^), puis relance Installer.cmd depuis le dossier extrait.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fichiers\installer.ps1"
if errorlevel 1 (
  echo.
  echo L'installation n'a pas abouti. Le message d'erreur est affiche ci-dessus.
  echo.
  pause
  exit /b 1
)
timeout /t 6 >nul
