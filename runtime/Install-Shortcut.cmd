@echo off
powershell.exe -NoProfile -File "%~dp0Bootstrap.ps1" -Action InstallShortcut
if errorlevel 1 pause
