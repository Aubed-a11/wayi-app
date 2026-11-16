@echo off
chcp 65001 >nul
title WAYI en local
cd /d "%~dp0front"
where node >nul 2>nul || (echo Node.js n'est pas installe : https://nodejs.org & pause & exit /b 1)
if not exist "node_modules\concurrently" (
  echo === Premiere fois : installation des dependances, quelques minutes... ===
  call npm run installer || (echo Echec de l'installation & pause & exit /b 1)
)
echo.
echo === WAYI demarre ===
echo   Appli client         : http://localhost:5173
echo   Restaurant et admin  : http://localhost:5175
echo   Appli livreur        : http://localhost:5174
echo   Serveur (API)        : http://localhost:3001/health
echo   Ctrl + C pour tout arreter.
echo.
start "" http://localhost:5173
call npm run dev
pause
