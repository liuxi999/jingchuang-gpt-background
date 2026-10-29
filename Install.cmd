@echo off
powershell.exe -NoProfile -File "%~dp0runtime\Bootstrap.ps1" -Action InstallProfile
pause
