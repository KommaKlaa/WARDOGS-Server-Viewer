@echo off
setlocal
cd /d "%~dp0"
title WARDOGS Server Viewer

echo.
echo  ========================================
echo   WARDOGS Server Viewer  (local)
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  [ERROR] Node.js was not found.
  echo.
  echo  Install Node.js 22 LTS from:
  echo  https://nodejs.org/
  echo.
  echo  Then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo  First start: installing dependencies...
  echo.
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

set WARDOGS_DESKTOP=1
set HOST=127.0.0.1
set PORT=3030
set NODE_ENV=production

echo  Starting... your browser will open automatically.
echo  Close this window to stop the viewer.
echo.

node server.js
set EXITCODE=%ERRORLEVEL%

if not "%EXITCODE%"=="0" (
  echo.
  echo  [ERROR] Viewer stopped with code %EXITCODE%.
  echo  If port 3030 is already in use, close the other viewer window.
  echo.
  pause
)

endlocal
exit /b %EXITCODE%
