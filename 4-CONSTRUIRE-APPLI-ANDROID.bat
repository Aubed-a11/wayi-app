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
echo.
echo === 3/3 Fabrication de l'APK (quelques minutes la premiere fois) ===
call flutter build apk --release || goto erreur

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
