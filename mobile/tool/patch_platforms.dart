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
    'android.permission.VIBRATE',
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

  // Android 6 minimum
  for (final name in ['android/app/build.gradle.kts', 'android/app/build.gradle']) {
    final g = File(name);
    if (!g.existsSync()) continue;
    var t = g.readAsStringSync();
    t = t.replaceAll(RegExp(r'minSdk\s*=\s*flutter\.minSdkVersion'), 'minSdk = 23');
    t = t.replaceAll(RegExp(r'minSdkVersion\s+flutter\.minSdkVersion'), 'minSdkVersion 23');
    g.writeAsStringSync(t);
  }

  // Signature Play Store : si android/key.properties existe (cree par
  // 4-CONSTRUIRE-APPLI-ANDROID.bat ou par GitHub), l'appli est signee avec la cle WAYI.
  final app = File('android/app/build.gradle.kts');
  if (app.existsSync()) {
    var t = app.readAsStringSync();
    if (!t.contains('keystoreProperties')) {
      t = 'import java.io.FileInputStream\nimport java.util.Properties\n\n$t';
      t = t.replaceFirst(RegExp(r'\nandroid \{'), '\n'
          'val keystoreProperties = Properties()\n'
          'val keystorePropertiesFile = rootProject.file("key.properties")\n'
          'if (keystorePropertiesFile.exists()) keystoreProperties.load(FileInputStream(keystorePropertiesFile))\n'
          '\nandroid {');
      t = t.replaceFirst('    buildTypes {', '    signingConfigs {\n'
          '        create("release") {\n'
          '            if (keystorePropertiesFile.exists()) {\n'
          '                keyAlias = keystoreProperties["keyAlias"] as String\n'
          '                keyPassword = keystoreProperties["keyPassword"] as String\n'
          '                storeFile = file(keystoreProperties["storeFile"] as String)\n'
          '                storePassword = keystoreProperties["storePassword"] as String\n'
          '            }\n'
          '        }\n'
          '    }\n'
          '    buildTypes {');
      t = t.replaceFirst('signingConfig = signingConfigs.getByName("debug")',
          'signingConfig = if (keystorePropertiesFile.exists()) signingConfigs.getByName("release") else signingConfigs.getByName("debug")');
      app.writeAsStringSync(t);
    }
  }

  // L'analyse "lintVital" d'Android plante sur certains modules (image_picker) :
  // elle ne sert qu'aux avertissements, on la desactive pour la compilation.
  const marker = '// WAYI: lintVital desactive';
  for (final name in ['android/build.gradle.kts', 'android/build.gradle']) {
    final g = File(name);
    if (!g.existsSync()) continue;
    final t = g.readAsStringSync();
    if (t.contains(marker)) continue;
    g.writeAsStringSync('$t\n$marker\nsubprojects {\n    tasks.matching { it.name.startsWith("lintVital") }.configureEach { enabled = false }\n}\n');
  }

  // Notifications du telephone (flutter_local_notifications) : desugaring Java requis
  for (final name in ['android/app/build.gradle.kts', 'android/app/build.gradle']) {
    final g = File(name);
    if (!g.existsSync()) continue;
    var t = g.readAsStringSync();
    if (t.contains('desugar_jdk_libs')) continue;
    final kts = name.endsWith('.kts');
    t = t.replaceFirst('compileOptions {', kts ? 'compileOptions {\n        isCoreLibraryDesugaringEnabled = true' : 'compileOptions {\n        coreLibraryDesugaringEnabled true');
    t += kts
        ? '\ndependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n}\n'
        : '\ndependencies {\n    coreLibraryDesugaring "com.android.tools:desugar_jdk_libs:2.1.4"\n}\n';
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
  // Pas de chiffrement propre : evite la question "export compliance" a chaque envoi
  if (!s.contains('ITSAppUsesNonExemptEncryption')) {
    s = s.replaceFirst('<dict>', '<dict>\n\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>');
  }
  // Icones WAYI (tool/ios_icons) a la place de l'icone Flutter
  final icons = Directory('tool/ios_icons');
  final set = Directory('ios/Runner/Assets.xcassets/AppIcon.appiconset');
  if (icons.existsSync() && set.existsSync()) {
    for (final e in icons.listSync().whereType<File>()) {
      e.copySync('${set.path}/${e.uri.pathSegments.last}');
    }
  }
  f.writeAsStringSync(s);
  stdout.writeln('iOS : autorisations, nom et icone OK');
}
