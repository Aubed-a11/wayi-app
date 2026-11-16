@echo off
cd /d "%~dp0"
node deploy-front.mjs client
echo.
pause
