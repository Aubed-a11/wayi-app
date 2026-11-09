// Prepare les dossiers android/ et ios/ generes par "flutter create" :
// autorisations (internet, position), nom de l'appli, icone WAYI.
// Usage : dart run tool/patch_platforms.dart
import 'dart:io';

void main() {
  _android();
  _ios();
  stdout.writeln('Plateformes preparees pour WAYI.');
}

void _android() {
  final f = File('android/app/src/main/AndroidManifest.xml');
  if (!f.existsSync()) {
    stdout.writeln('android/ absent : lance d\'abord flutter create (voir LISEZ-MOI).');
    return;
  }
  var s = f.readAsStringSync();
  const perms = [
    'android.permission.INTERNET',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    // Livreur : position partagee meme ecran eteint (service avec notification)
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.WAKE_LOCK',
  ];
  for (final p in perms) {
    if (!s.contains(p)) {
      s = s.replaceFirst('<application', '<uses-permission android:name="$p" />\n    <application');
    }
  }
  s = s.replaceFirst(RegExp(r'android:label="[^"]*"'), 'android:label="WAYI"');
  // Serveur local en http pendant les tests (l'appli en ligne utilise https)
  if (!s.contains('usesCleartextTraffic')) {
    s = s.replaceFirst('<application', '<application\n        android:usesCleartextTraffic="true"');
  }
  // url_launcher (Android 11+) : declarer les liens ouverts (telephone, navigateur)
  if (!s.contains('<queries>')) {
    s = s.replaceFirst('</manifest>', '''    <queries>
        <intent><action android:name="android.intent.action.DIAL" /><data android:scheme="tel" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>
</manifest>''');
  }
  f.writeAsStringSync(s);

  // Firebase (notifications) demande Android 6 minimum
  for (final name in ['android/app/build.gradle.kts', 'android/app/build.gradle']) {
    final g = File(name);
    if (!g.existsSync()) continue;
    var t = g.readAsStringSync();
    t = t.replaceAll(RegExp(r'minSdk\s*=\s*flutter\.minSdkVersion'), 'minSdk = 23');
    t = t.replaceAll(RegExp(r'minSdkVersion\s+flutter\.minSdkVersion'), 'minSdkVersion 23');
    g.writeAsStringSync(t);
  }

  // Icone : reprise des icones WAYI deja generees
  const dens = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
  for (final d in dens) {
    final src = File('assets/android_icons/ic_launcher-$d.png');
    final dst = File('android/app/src/main/res/mipmap-$d/ic_launcher.png');
    if (src.existsSync() && dst.parent.existsSync()) src.copySync(dst.path);
  }
  stdout.writeln('Android : autorisations, nom et icone OK');
}

void _ios() {
  final f = File('ios/Runner/Info.plist');
  if (!f.existsSync()) return;
  var s = f.readAsStringSync();
  if (!s.contains('NSLocationWhenInUseUsageDescription')) {
    s = s.replaceFirst('<dict>', '''<dict>
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>WAYI utilise ta position pour te livrer au bon endroit et, pour les livreurs, pour la partager pendant la course.</string>
	<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
	<string>En mode livreur, WAYI partage ta position pendant la course, meme appli en arriere-plan.</string>
	<key>UIBackgroundModes</key>
	<array>
		<string>location</string>
	</array>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>Pour ajouter la photo de tes plats.</string>
	<key>NSCameraUsageDescription</key>
	<string>Pour photographier tes plats.</string>''');
  }
  s = s.replaceFirst(RegExp(r'<key>CFBundleDisplayName</key>\s*<string>[^<]*</string>'), '<key>CFBundleDisplayName</key>\n\t<string>WAYI</string>');
  f.writeAsStringSync(s);
  stdout.writeln('iOS : autorisation de position et nom OK');
}
