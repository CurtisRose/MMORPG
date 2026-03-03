@echo off
setlocal

cd /d "%~dp0"

echo [1/5] Stopping existing Node processes...
taskkill /F /IM node.exe >nul 2>&1

echo [2/5] Rebuilding project...
set "VITE_MULTIPLAYER_URL=ws://127.0.0.1:2567"
call npm run build
if errorlevel 1 (
  echo Build failed. Server/client were not restarted.
  pause
  exit /b 1
)

echo [3/5] Starting multiplayer server (ws://127.0.0.1:2567)...
start "Game Multiplayer Server" /D "%~dp0" cmd /k npm run dev:server

echo [4/5] Starting web client (http://127.0.0.1:5173)...
start "Game Client" /D "%~dp0" cmd /k "set VITE_MULTIPLAYER_URL=ws://127.0.0.1:2567&& npm run dev:client -- --host 127.0.0.1 --port 5173 --strictPort"

echo [5/5] Opening game in browser...
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5173/"

echo Done. Server and client were started in new terminal windows.
endlocal
