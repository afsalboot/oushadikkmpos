@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-direct-print.ps1" -Url "http://localhost:3000"
if errorlevel 1 pause
