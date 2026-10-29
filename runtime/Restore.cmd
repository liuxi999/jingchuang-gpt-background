@echo off
powershell.exe -NoProfile -File "%~dp0Bootstrap.ps1" -Action Restore
pause
