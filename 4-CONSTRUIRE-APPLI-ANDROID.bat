@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0mobile"
title WAYI - appli Android (Flutter)

REM Une seule appli WAYI : clients, restaurants, livreurs.
REM Prerequis (une seule fois) : Flutter + Android Studio. Voir LISEZ-MOI.txt.

where flutter >nul 2>nul
if errorlevel 1 (
  echo Flutter n'est pas installe ou pas dans le PATH.
  echo Installe-le : https://docs.flutter.dev/get-started/install/windows
  echo puis ferme et rouvre cette fenetre.
  pause & exit /b 1
)

echo === 1/3 Preparation du projet Android ===
if not exist android (
  call flutter create --platforms=android --org com.wayibenin --project-name wayi . || goto erreur
)
call dart run tool/patch_platforms.dart || goto erreur

echo.
echo === 2/3 Installation des paquets ===
call flutter pub get || goto erreur

echo.
echo === Signature Play Store ===
if exist "%~dp0cles\wayi.keystore" (
  call "%~dp0cles\mots-de-passe.bat"
  copy /y "%~dp0cles\wayi.keystore" android\app\upload.keystore >nul
  > android\key.properties (
    echo storePassword=%WAYI_KEYSTORE_PASSWORD%
    echo keyPassword=%WAYI_KEY_PASSWORD%
    echo keyAlias=%WAYI_KEY_ALIAS%
    echo storeFile=upload.keystore
  )
  echo Appli signee avec la cle WAYI.
) else (
  if exist android\key.properties del android\key.properties
  echo Pas de cle : lance 5-CREER-CLE-PLAY-STORE.bat pour une version Play Store.
)
for /f %%i in ('powershell -NoProfile -Command "[int]((Get-Date).ToUniversalTime() - [datetime]'2026-01-01').TotalMinutes"') do set BUILD=%%i

echo.
echo === 3/3 Fabrication de l'APK et de l'AAB (quelques minutes la premiere fois) ===
call flutter build apk --release --build-number=%BUILD% || goto erreur
call flutter build appbundle --release --build-number=%BUILD% || goto erreur

if not exist "%~dp0APK" mkdir "%~dp0APK"
copy /y build\app\outputs\flutter-apk\app-release.apk "%~dp0APK\WAYI.apk" >nul
copy /y build\app\outputs\bundle\release\app-release.aab "%~dp0APK\WAYI.aab" >nul
echo.
echo Termine. Dans le dossier APK :
echo   WAYI.apk : a installer sur un telephone Android
echo   WAYI.aab : a envoyer sur le Google Play Store
explorer "%~dp0APK"
pause
exit /b 0
:erreur
echo.
echo ERREUR : copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
