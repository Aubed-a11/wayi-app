import 'package:url_launcher/url_launcher.dart';

/// Appeler un numero
Future<void> callPhone(String? phone) async {
  final p = (phone ?? '').replaceAll(RegExp(r'[^0-9+]'), '');
  if (p.isEmpty) return;
  await launchUrl(Uri.parse('tel:$p'));
}

/// Ouvrir l'itineraire dans Google Maps (ou l'appli de cartes du telephone)
Future<void> openDirections(double lat, double lng) async {
  final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}
