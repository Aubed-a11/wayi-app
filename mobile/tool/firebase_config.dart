// Fabrique firebase.json (valeurs pour --dart-define-from-file) a partir de
// google-services.json telecharge depuis la console Firebase.
// Usage : dart run tool/firebase_config.dart
import 'dart:convert';
import 'dart:io';

void main() {
  final src = File('google-services.json');
  if (!src.existsSync()) {
    stdout.writeln('google-services.json absent : appli construite sans notifications appli fermee.');
    return;
  }
  final j = jsonDecode(src.readAsStringSync()) as Map<String, dynamic>;
  final info = j['project_info'] as Map<String, dynamic>;
  final clients = (j['client'] as List).cast<Map<String, dynamic>>();
  final c = clients.firstWhere(
    (c) => c['client_info']?['android_client_info']?['package_name'] == 'com.wayibenin.wayi',
    orElse: () => clients.first,
  );
  final out = {
    'FIREBASE_API_KEY': (c['api_key'] as List).first['current_key'],
    'FIREBASE_APP_ID': c['client_info']['mobilesdk_app_id'],
    'FIREBASE_SENDER_ID': info['project_number'],
    'FIREBASE_PROJECT_ID': info['project_id'],
  };
  File('firebase.json').writeAsStringSync(const JsonEncoder.withIndent('  ').convert(out));
  stdout.writeln('firebase.json cree pour le projet ${info['project_id']}.');
}
