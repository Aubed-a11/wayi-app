import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

const cotonou = LatLng(6.3703, 2.3912);

TileLayer osmTiles() => TileLayer(
      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      userAgentPackageName: 'com.wayibenin.wayi',
      maxZoom: 19,
    );

/// Epingle de carte (rond colore + icone)
class MapPin extends StatelessWidget {
  final IconData icon;
  final Color color;
  const MapPin({super.key, required this.icon, this.color = C.ink});
  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(
          color: color, shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 3),
          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 8, offset: Offset(0, 3))],
        ),
        child: Icon(icon, size: 17, color: Colors.white),
      );
}

/// Position actuelle du telephone (avec demande d'autorisation)
Future<LatLng?> currentPosition(BuildContext context) async {
  try {
    if (!await Geolocator.isLocationServiceEnabled()) {
      if (context.mounted) toast(context, 'Active la localisation de ton téléphone.');
      return null;
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      if (context.mounted) toast(context, "WAYI n'a pas accès à ta position. Touche la carte à la place.");
      return null;
    }
    final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15)));
    return LatLng(p.latitude, p.longitude);
  } catch (_) {
    if (context.mounted) toast(context, 'Position introuvable pour le moment. Touche la carte à la place.');
    return null;
  }
}

/// Plein ecran : le client choisit son point de livraison sur la carte
class PickLocationScreen extends StatefulWidget {
  final LatLng? initial;
  const PickLocationScreen({super.key, this.initial});
  @override
  State<PickLocationScreen> createState() => _PickLocationScreenState();
}

class _PickLocationScreenState extends State<PickLocationScreen> {
  final _map = MapController();
  late LatLng _center = widget.initial ?? cotonou;
  bool _locating = false;

  Future<void> _locate() async {
    setState(() => _locating = true);
    final p = await currentPosition(context);
    if (!mounted) return;
    setState(() => _locating = false);
    if (p != null) {
      _map.move(p, 17);
      setState(() => _center = p);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: _center,
              initialZoom: widget.initial != null ? 17 : 13,
              interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
              onPositionChanged: (camera, _) => setState(() => _center = camera.center),
            ),
            children: [osmTiles()],
          ),
          // L'epingle reste au centre : on deplace la carte dessous
          const IgnorePointer(
            child: Center(
              child: Padding(
                padding: EdgeInsets.only(bottom: 34),
                child: SizedBox(width: 40, height: 40, child: MapPin(icon: Ic.pin, color: C.brand)),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                RoundIcon(Ic.back, onTap: () => Navigator.of(context).pop()),
                const SizedBox(width: 10),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(R.sm), boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 8)]),
                    child: Text('Déplace la carte pour placer l\'épingle à ta porte', style: font(size: 13, weight: FontWeight.w600)),
                  ),
                ),
              ]),
            ),
          ),
          Positioned(
            left: 16, right: 16, bottom: MediaQuery.of(context).padding.bottom + 16,
            child: Column(children: [
              Align(
                alignment: Alignment.centerRight,
                child: FloatingActionButton.small(
                  heroTag: 'locate',
                  backgroundColor: Colors.white,
                  onPressed: _locating ? null : _locate,
                  child: _locating ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Ic.locate, color: C.ink),
                ),
              ),
              const SizedBox(height: 12),
              PrimaryButton(label: 'Livrer ici', icon: Ic.check, onPressed: () => Navigator.of(context).pop(_center)),
            ]),
          ),
        ]),
      );
}
