@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM Cree UNE FOIS la cle qui signe les applis pour le Play Store.
REM A garder precieusement (et en copie ailleurs) : sans elle, impossible de mettre a jour les applis publiees.
if exist "cles\wayi.keystore" (echo La cle existe deja dans cles\wayi.keystore, on ne la remplace pas. & pause & exit /b 0)
if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
if not exist "%JAVA_HOME%\bin\keytool.exe" (echo Android Studio introuvable. Installe-le d'abord. & pause & exit /b 1)
mkdir cles 2>nul
set /p MDP=Choisis un mot de passe pour la cle (6 caracteres minimum, note-le bien) : 
"%JAVA_HOME%\bin\keytool.exe" -genkeypair -v -keystore cles\wayi.keystore -alias wayi -keyalg RSA -keysize 2048 -validity 10000 -storepass "%MDP%" -keypass "%MDP%" -dname "CN=WAYI BENIN, O=WAYI BENIN, L=Cotonou, C=BJ" || (echo Echec. & pause & exit /b 1)
(echo set WAYI_KEYSTORE_PASSWORD=%MDP%& echo set WAYI_KEY_PASSWORD=%MDP%& echo set WAYI_KEY_ALIAS=wayi) > cles\mots-de-passe.bat
powershell -NoProfile -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes('cles\wayi.keystore'))" > cles\wayi.keystore.base64.txt
echo.
echo Cle creee dans le dossier cles.
echo - 4-CONSTRUIRE-APPLI-ANDROID.bat produira maintenant une appli signee (.apk et .aab pour le Play Store).
echo - Pour GitHub : copie le contenu de cles\wayi.keystore.base64.txt dans le secret WAYI_KEYSTORE_BASE64.
echo Ne mets JAMAIS le dossier cles sur GitHub ni dans un zip partage.
pause
