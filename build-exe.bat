@echo off
cd /d "%~dp0"
echo Running release build (same as: npm run build:exe^)...
echo.
node "%~dp0scripts\build-exe.mjs"
exit /b %ERRORLEVEL%
