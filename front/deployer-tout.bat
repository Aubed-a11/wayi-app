@echo off
cd /d "%~dp0"
echo.
echo === Mise en ligne des 3 applications WAYI (client, admin, livreur) ===
node deploy-front.mjs client
node deploy-front.mjs admin
node deploy-front.mjs driver
echo.
echo === Verification finale ===
node deploy-front.mjs all --verify-only
echo.
pause
