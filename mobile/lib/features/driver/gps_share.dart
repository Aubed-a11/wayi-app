import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/api.dart';

/// Partage de la position du livreur avec le serveur.
/// Android : service avec notification "WAYI Livreur en ligne", la position
/// continue d'etre envoyee ecran eteint ou appli en arriere-plan.
class GpsShare {
  StreamSubscription<Position>? _sub;
  DateTime _lastSent = DateTime.fromMillisecondsSinceEpoch(0);
  Position? last;
  bool get active => _sub != null;

  /// Verifie la localisation et l'autorisation. Renvoie un message d'erreur, ou null si tout va bien.
  static Future<String?> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return 'Active la localisation (GPS) de ton téléphone.';
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied) return 'WAYI a besoin de ta position pour te proposer des courses.';
    if (perm == LocationPermission.deniedForever) return 'Position refusée : autorise WAYI dans les réglages du téléphone.';
    return null;
  }

  static Future<Position?> current() async {
    try {
      return await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
    } catch (_) {
      return Geolocator.getLastKnownPosition();
    }
  }

  LocationSettings _settings() {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        intervalDuration: const Duration(seconds: 5),
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'WAYI Livreur en ligne',
          notificationText: 'Ta position est partagée avec le client et le restaurant pendant la course.',
          enableWakeLock: true,
          setOngoing: true,
        ),
      );
    }
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        activityType: ActivityType.automotiveNavigation,
        pauseLocationUpdatesAutomatically: false,
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: true,
      );
    }
    return const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10);
  }

  Future<String?> start(void Function(Position p) onPosition) async {
    if (active) return null;
    final err = await ensurePermission();
    if (err != null) return err;
    _sub = Geolocator.getPositionStream(locationSettings: _settings()).listen((p) {
      last = p;
      onPosition(p);
      final now = DateTime.now();
      if (now.difference(_lastSent) < const Duration(seconds: 4)) return;
      _lastSent = now;
      Api.instance.put('/drivers/location', {'lat': p.latitude, 'lng': p.longitude}).catchError((_) => <String, dynamic>{});
    }, onError: (_) {});
    return null;
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }
}
