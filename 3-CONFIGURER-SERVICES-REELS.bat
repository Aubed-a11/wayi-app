@echo off
chcp 65001 >nul
cd /d "%~dp0"
set IP=76.13.37.17
echo.
echo === WAYI : brancher les services reels sur le serveur ===
echo Lance d'abord 1-DEPLOYER-SERVEUR.bat (il envoie les outils de configuration).
echo L'assistant va te poser les questions service par service :
echo   Entree = garder la valeur actuelle, o = configurer, - = effacer.
echo Le mot de passe du VPS est demande une fois.
echo.
ssh -t root@%IP% "cd /home/wayi/wayi-backend && node scripts/configurer.js && chown wayi:wayi .env && chmod 600 .env && echo && echo === Verification des cles === && node scripts/verifier.js; wayi-pm2 restart wayi-backend >/dev/null && echo Serveur redemarre."
echo.
echo === Etat vu depuis Internet ===
curl -s https://api.wayibenin.com/health
echo.
pause
