@echo off
setlocal
title Oushadhi POS - Local Direct Print
if not exist "%~dp0scripts\start-direct-print.ps1" (
    echo The launcher script is missing.
    echo Copy the scripts folder beside this CMD file, then try again.
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-direct-print.ps1" -Url "http://localhost:3000"
set "receiptExitCode=%errorlevel%"
echo.
if not "%receiptExitCode%"=="0" echo POS could not open. Please send the error shown above.
echo This window stays open so you can read the launch result.
pause
exit /b %receiptExitCode%
