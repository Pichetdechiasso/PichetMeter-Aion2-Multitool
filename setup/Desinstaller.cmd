@echo off
chcp 65001 >nul
title Desinstallation de PichetMeter
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fichiers\desinstaller.ps1"
echo.
pause
