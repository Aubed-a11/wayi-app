@echo off
cd /d "%~dp0"
set IP=76.13.37.17
title WAYI - recuperation du backend du VPS
echo Ce script copie le backend et les donnees de ton VPS sur ton PC.
echo Rien n'est modifie ni supprime sur le serveur.
echo.
echo === 1/3 Envoi du petit script de recuperation (mot de passe du VPS demande) ===
scp serveur\recup-vps.sh root@%IP%:/root/recup-vps.sh
if errorlevel 1 goto erreur
echo.
echo === 2/3 Recuperation sur le serveur (mot de passe demande a nouveau) ===
ssh root@%IP% "sed -i 's/\r$//' /root/recup-vps.sh && bash /root/recup-vps.sh"
if errorlevel 1 goto erreur
echo.
echo === 3/3 Telechargement sur ton PC (mot de passe demande une derniere fois) ===
if not exist "%~dp0recuperation" mkdir "%~dp0recuperation"
scp root@%IP%:/root/wayi-recup.tgz "%~dp0recuperation\wayi-recup.tgz"
if errorlevel 1 goto erreur
echo.
echo Termine. Le fichier est ici : recuperation\wayi-recup.tgz
echo Envoie-moi ce fichier dans la conversation.
echo Il contient tes donnees (clients, commandes) : ne le partage avec personne d'autre.
explorer "%~dp0recuperation"
pause
exit /b 0
:erreur
echo.
echo ERREUR : copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
