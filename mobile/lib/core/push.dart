import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'api.dart';
import 'config.dart';

/// Notifications push : arrivent meme quand l'appli est fermee
/// (nouvelle commande pour le restaurant, nouvelle course pour le livreur, suivi pour le client).
class Push {
  static bool enabled = false;
  static String? _token;
  static StreamSubscription<String>? _refresh;

  /// Messages affiches pendant que l'appli est ouverte
  static final messengerKey = GlobalKey<ScaffoldMessengerState>();
  /// Appele quand l'utilisateur touche une notification (type, orderId)
  static void Function(String type, String? orderId)? onOpen;

  static Future<void> init() async {
    if (firebaseApiKey.isEmpty || firebaseAppId.isEmpty) return;
    try {
      await Firebase.initializeApp(
        options: const FirebaseOptions(apiKey: firebaseApiKey, appId: firebaseAppId, messagingSenderId: firebaseSenderId, projectId: firebaseProjectId),
      );
      enabled = true;
      FirebaseMessaging.onMessage.listen((m) {
        final n = m.notification;
        if (n == null) return;
        messengerKey.currentState?.showSnackBar(SnackBar(content: Text('${n.title ?? ''}\n${n.body ?? ''}'.trim()), duration: const Duration(seconds: 6)));
      });
      FirebaseMessaging.onMessageOpenedApp.listen(_opened);
      final first = await FirebaseMessaging.instance.getInitialMessage();
      if (first != null) Future.delayed(const Duration(seconds: 2), () => _opened(first));
    } catch (_) {
      enabled = false;
    }
  }

  static void _opened(RemoteMessage m) => onOpen?.call((m.data['type'] ?? '').toString(), m.data['orderId']?.toString());

  /// Enregistre ce telephone pour le compte connecte
  static Future<void> register() async {
    if (!enabled) return;
    try {
      final fm = FirebaseMessaging.instance;
      await fm.requestPermission(alert: true, badge: true, sound: true);
      _token = await fm.getToken();
      if (_token != null) await Api.instance.post('/devices', {'token': _token});
      await _refresh?.cancel();
      _refresh = fm.onTokenRefresh.listen((t) {
        _token = t;
        Api.instance.post('/devices', {'token': t}).catchError((_) => <String, dynamic>{});
      });
    } catch (_) {}
  }

  /// A la deconnexion : ce telephone ne recoit plus les alertes de ce compte
  static Future<void> unregister() async {
    final t = _token;
    _token = null;
    if (!enabled || t == null) return;
    try {
      await _refresh?.cancel();
      await Api.instance.delete('/devices?token=${Uri.encodeQueryComponent(t)}');
    } catch (_) {}
  }
}
