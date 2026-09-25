@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-direct-print.ps1" -Url "https://oushadikkmpos.vercel.app"
if errorlevel 1 pause
