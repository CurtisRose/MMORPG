@echo off
setlocal

cd /d "%~dp0"

echo Working directory: %CD%

set "MULTIPLAYER_PORT_ARG=%~1"
if "%MULTIPLAYER_PORT_ARG%"=="" set "MULTIPLAYER_PORT_ARG=2567"

set "TUNNEL_NAME=%~2"
if "%TUNNEL_NAME%"=="" set "TUNNEL_NAME=runescape"

where npm >nul 2>&1
if errorlevel 1 (
	echo ERROR: npm was not found in PATH in this console.
	echo Open PowerShell in this folder and run: npm run start:server
	pause
	exit /b 1
)

set "PORT_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%MULTIPLAYER_PORT_ARG% .*LISTENING"') do (
	set "PORT_PID=%%P"
	goto :port_check_done
)

:port_check_done
if defined PORT_PID (
	echo Port %MULTIPLAYER_PORT_ARG% is in use by PID %PORT_PID%. Stopping it...
	taskkill /F /PID %PORT_PID% >nul 2>&1
	timeout /t 1 /nobreak >nul
)

where cloudflared >nul 2>&1
if errorlevel 1 (
	echo WARNING: cloudflared was not found in PATH. Skipping tunnel startup.
) else (
	echo Starting Cloudflared tunnel "%TUNNEL_NAME%"...
	start "Cloudflared Tunnel (%TUNNEL_NAME%)" cmd /k "cloudflared tunnel run %TUNNEL_NAME%"
	timeout /t 1 /nobreak >nul
)

echo Starting multiplayer server on port %MULTIPLAYER_PORT_ARG%...
set "MULTIPLAYER_PORT=%MULTIPLAYER_PORT_ARG%"
call npm run start:server
set "START_EXIT=%ERRORLEVEL%"

echo.
if not "%START_EXIT%"=="0" (
	echo Server failed to start (exit code %START_EXIT%).
) else (
	echo Server process exited normally.
)
echo Press any key to close.
pause >nul

endlocal