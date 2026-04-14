@echo off
cd /d "%~dp0"
echo Starting Vite dev server (npm run dev). Press Ctrl+C to stop.
echo.
call npm run dev
exit /b %ERRORLEVEL%
