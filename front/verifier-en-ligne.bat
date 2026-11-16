@echo off
cd /d "%~dp0"
node deploy-front.mjs all --verify-only
echo.
pause
