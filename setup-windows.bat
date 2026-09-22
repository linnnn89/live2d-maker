@echo off
setlocal
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\setup-windows.ps1" %*
set "CODE=%ERRORLEVEL%"
if not "%CODE%"=="0" echo Setup failed with exit code %CODE%. See environment guide: environment.md
exit /b %CODE%
