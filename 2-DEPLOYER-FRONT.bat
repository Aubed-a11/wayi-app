@echo off
cd /d "%~dp0front"
echo.
echo Si Vercel propose un "upgrade", reponds n.
echo.
echo === 1/3 : application CLIENT (www.wayibenin.com) ===
call node deploy-front.mjs client
pause
echo.
echo === 2/3 : ADMIN et restaurants (admin.wayibenin.com) ===
call node deploy-front.mjs admin
pause
echo.
echo === 3/3 : application LIVREUR (driver.wayibenin.com) ===
call node deploy-front.mjs driver
echo.
echo Termine.
pause
