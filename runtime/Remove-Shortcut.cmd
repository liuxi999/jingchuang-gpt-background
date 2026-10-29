@echo off
powershell.exe -NoProfile -File "%~dp0Bootstrap.ps1" -Action RemoveShortcut
if errorlevel 1 pause
