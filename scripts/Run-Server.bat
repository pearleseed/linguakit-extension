@echo off
title LinguaKit Translation Proxy Server
color 0b

:: Auto-navigate to the project root directory (one level up from this script's directory)
cd /d "%~dp0.."

echo ==========================================
echo    STARTING LINGUAKIT PROXY SERVER
echo ==========================================
echo.

:: Check if Bun is already installed and available in the PATH
where bun >nul 2>nul
if %errorlevel% neq 0 (
    :: Check if Bun exists in the default user directory (installed but not loaded in current PATH)
    if exist "%USERPROFILE%\.bun\bin\bun.exe" (
        set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    ) else (
        echo [*] Bun is not installed on this system.
        echo [*] Automatically downloading and installing Bun runtime...
        powershell -Command "irm https://bun.sh/install.ps1 | iex"
        set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    )
)

:: Re-verify if Bun is fully functional
where bun >nul 2>nul
if %errorlevel% eq 0 (
    echo [*] Detected Bun runtime.
    echo [*] Launching LinguaKit Translation Proxy...
    bun server/index.js
) else (
    echo [X] ERROR: Could not automatically install Bun.
    echo Please download and install Bun manually from https://bun.sh
    pause
)
