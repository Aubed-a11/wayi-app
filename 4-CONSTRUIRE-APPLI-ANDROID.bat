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

echo === 1/4 Preparation du projet Android ===
if not exist android (
  call flutter create --platforms=android --org com.wayibenin --project-name wayi . || goto erreur
)
call dart run tool/patch_platforms.dart || goto erreur

echo.
echo === 2/4 Installation des paquets ===
call flutter pub get || goto erreur

echo.
echo === 3/4 Notifications Firebase (facultatif) ===
set FB=
if exist google-services.json call dart run tool/firebase_config.dart
if exist firebase.json (
  set "FB=--dart-define-from-file=firebase.json"
  echo Firebase active.
) else (
  echo Pas de google-services.json dans le dossier mobile : appli sans notifications appli fermee.
)

echo.
echo === 4/4 Fabrication de l'APK (quelques minutes la premiere fois) ===
call flutter build apk --release %FB% || goto erreur

if not exist "%~dp0APK" mkdir "%~dp0APK"
copy /y build\app\outputs\flutter-apk\app-release.apk "%~dp0APK\WAYI.apk" >nul
echo.
echo Termine. L'appli est dans le dossier APK : WAYI.apk
echo Envoie-la sur ton telephone (WhatsApp, cable...) et ouvre-la pour l'installer.
explorer "%~dp0APK"
pause
exit /b 0
:erreur
echo.
echo ERREUR : copie le message ci-dessus et envoie-le moi.
pause
exit /b 1
