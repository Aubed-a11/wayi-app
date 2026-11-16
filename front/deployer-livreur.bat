@echo off
cd /d "%~dp0"
node deploy-front.mjs driver
echo.
pause
