/// Adresse du serveur WAYI.
/// Par defaut : le serveur en ligne. Pour tester avec le serveur local :
///   flutter run --dart-define=API_URL=http://10.0.2.2:3001   (emulateur Android)
///   flutter run --dart-define=API_URL=http://192.168.1.20:3001 (telephone sur le meme Wi-Fi)
const String apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://api.wayibenin.com');

/// Backoffice web (administration), ouvert dans le navigateur
const String backofficeUrl = 'https://admin.wayibenin.com';

/// Notifications push (Firebase). Vide = notifications desactivees, l'appli marche quand meme.
/// Valeurs de la console Firebase > Parametres du projet > Vos applications (Android),
/// passees au lancement : flutter run --dart-define-from-file=firebase.json
const String firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
const String firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
const String firebaseSenderId = String.fromEnvironment('FIREBASE_SENDER_ID');
const String firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
