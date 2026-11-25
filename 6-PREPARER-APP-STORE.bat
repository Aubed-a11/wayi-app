@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM Cree UNE FOIS la cle privee qui sert a fabriquer le certificat Apple de WAYI.
REM A garder precieusement, comme la cle Play Store. Ne jamais la mettre sur GitHub.
if not exist cles mkdir cles
if exist "cles\cle-certificat-apple" (
  echo La cle existe deja : cles\cle-certificat-apple
) else (
  ssh-keygen -t rsa -b 2048 -m PEM -N "" -q -f "cles\cle-certificat-apple" || (echo Echec : OpenSSH manque sur ce PC. & pause & exit /b 1)
  echo Cle creee : cles\cle-certificat-apple
)
echo.
echo Sur GitHub (depot wayi-app, Settings, Secrets and variables, Actions), cree 4 secrets :
echo   CERTIFICATE_PRIVATE_KEY           tout le contenu du fichier cles\cle-certificat-apple
echo   APP_STORE_CONNECT_ISSUER_ID       App Store Connect, Utilisateurs et acces, Integrations
echo   APP_STORE_CONNECT_KEY_IDENTIFIER  l'ID de la cle API creee au meme endroit (role Admin)
echo   APP_STORE_CONNECT_PRIVATE_KEY     tout le contenu du fichier AuthKey_XXXX.p8 telecharge
echo Ensuite, Actions, "Appli iPhone WAYI", Run workflow : l'appli arrive sur TestFlight.
notepad "cles\cle-certificat-apple"
pause
