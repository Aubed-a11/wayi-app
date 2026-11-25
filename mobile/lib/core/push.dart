import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';

/// Notifications WAYI sans service exterieur : le serveur range chaque alerte
/// dans la boite du compte (sa propre base de donnees), l'appli la consulte
/// toutes les quelques secondes et l'affiche sur le telephone.
///   restaurant : nouvelle commande   livreur : nouvelle course
///   client     : acceptee, en route, livree, annulee
/// Le livreur en ligne garde l'appli active en arriere-plan (partage de position),
/// ses alertes arrivent ecran eteint.
class Push {
  static const _kSince = 'wayi.notif.since';
  static const _period = Duration(seconds: 10);

  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;
  static Timer? _timer;
  static bool _busy = false;
  static int _since = 0;

  /// Messages affiches pendant que l'appli est ouverte
  static final messengerKey = GlobalKey<ScaffoldMessengerState>();
  /// Appele quand l'utilisateur touche une notification (type, orderId)
  static void Function(String type, String? orderId)? onOpen;

  static Future<void> init() async {
    try {
      await _plugin.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
        ),
        onDidReceiveNotificationResponse: (r) => _openPayload(r.payload),
      );
      final launch = await _plugin.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp ?? false) {
        final payload = launch?.notificationResponse?.payload;
        Future.delayed(const Duration(seconds: 2), () => _openPayload(payload));
      }
      _ready = true;
    } catch (_) {
      _ready = false;
    }
  }

  static void _openPayload(String? payload) {
    if (payload == null || payload.isEmpty) return;
    final i = payload.indexOf('|');
    final type = i < 0 ? payload : payload.substring(0, i);
    final orderId = i < 0 ? null : payload.substring(i + 1);
    onOpen?.call(type, (orderId == null || orderId.isEmpty) ? null : orderId);
  }

  /// Compte connecte : demande l'autorisation et commence a ecouter
  static Future<void> register() async {
    try {
      await _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
      await _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.requestPermissions(alert: true, badge: true, sound: true);
    } catch (_) {}
    final p = await SharedPreferences.getInstance();
    _since = p.getInt(_kSince) ?? DateTime.now().millisecondsSinceEpoch;
    await p.setInt(_kSince, _since);
    _timer?.cancel();
    _timer = Timer.periodic(_period, (_) => check());
    check();
  }

  /// A la deconnexion : plus d'alertes pour ce compte sur ce telephone
  static Future<void> unregister() async {
    _timer?.cancel();
    _timer = null;
    final p = await SharedPreferences.getInstance();
    await p.remove(_kSince);
    try {
      await _plugin.cancelAll();
    } catch (_) {}
  }

  /// Va chercher les nouvelles alertes du compte sur le serveur
  static Future<void> check() async {
    if (_busy) return;
    _busy = true;
    try {
      final r = await Api.instance.get('/notifications', query: {'since': '$_since'});
      final list = (r['notifications'] as List?) ?? const [];
      for (final raw in list) {
        final n = (raw as Map).cast<String, dynamic>();
        final at = (n['at'] as num?)?.toInt() ?? 0;
        if (at > _since) _since = at;
        await _show(n);
      }
      if (list.isNotEmpty) {
        final p = await SharedPreferences.getInstance();
        await p.setInt(_kSince, _since);
      }
    } catch (_) {
      // Pas de reseau ou session expiree : on reessaie au prochain tour
    } finally {
      _busy = false;
    }
  }

  static Future<void> _show(Map<String, dynamic> n) async {
    final title = (n['title'] ?? '').toString();
    final body = (n['body'] ?? '').toString();
    final payload = '${n['type'] ?? ''}|${n['orderId'] ?? ''}';
    final inApp = WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    if (inApp) {
      messengerKey.currentState?.showSnackBar(SnackBar(content: Text('$title\n$body'.trim()), duration: const Duration(seconds: 6)));
    }
    if (!_ready) return;
    try {
      await _plugin.show(
        (n['id'] ?? title).hashCode & 0x7fffffff,
        title,
        body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'wayi_alertes',
            'Alertes WAYI',
            channelDescription: 'Nouvelles commandes, courses et suivi de commande',
            importance: Importance.max,
            priority: Priority.high,
            playSound: true,
            enableVibration: true,
          ),
          iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true),
        ),
        payload: payload,
      );
    } catch (_) {}
  }
}
