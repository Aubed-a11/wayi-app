@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM Envoie l'appli Flutter WAYI sur https://github.com/Aubed-a11/wayi-app
REM GitHub compile ensuite l'APK tout seul (onglet Actions).
where git >nul 2>nul || (echo Git n'est pas installe : https://git-scm.com/download/win & pause & exit /b 1)
git push -u origin main
if errorlevel 1 (echo. & echo Echec de l'envoi : copie le message ci-dessus et envoie-le moi. & pause & exit /b 1)
echo.
echo Envoye. La compilation demarre : https://github.com/Aubed-a11/wayi-app/actions
start "" https://github.com/Aubed-a11/wayi-app/actions
pause
