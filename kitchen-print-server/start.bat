@echo off
echo Starting Kitchen Print Server...
cd /d "%~dp0"

:: Check if node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo ERROR: Node.js is not installed.
  echo Download it from https://nodejs.org
  pause
  exit /b 1
)

:: Install dependencies if needed
if not exist node_modules (
  echo Installing dependencies...
  npm install
)

set RENDER_URL=https://mise-en-place-ibie.onrender.com
echo.
echo Kitchen Print Server starting on http://localhost:3001
echo Heartbeat to Render every 10 minutes
echo.
node index.js
pause
