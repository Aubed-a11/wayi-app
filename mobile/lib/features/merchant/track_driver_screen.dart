import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../core/actions.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../client/map_widgets.dart';

/// Le restaurant suit le livreur en direct (du retrait jusqu'au client)
class TrackDriverScreen extends StatefulWidget {
  final String orderId;
  const TrackDriverScreen({super.key, required this.orderId});
  @override
  State<TrackDriverScreen> createState() => _TrackDriverScreenState();
}

class _TrackDriverScreenState extends State<TrackDriverScreen> {
  Map<String, dynamic>? _t;
  Timer? _timer;
  final _map = MapController();
  bool _fitted = false;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  LatLng? _pt(dynamic m) {
    if (m is! Map) return null;
    final a = asDouble(m['lat']);
    final b = asDouble(m['lng']);
    return a == null || b == null ? null : LatLng(a, b);
  }

  Future<void> _load() async {
    try {
      final t = await Api.instance.get('/merchants/orders/${widget.orderId}/tracking');
      if (!mounted) return;
      setState(() => _t = t);
      final pts = [_pt(t['restaurant']), _pt(t['delivery']), _pt(t['driver'])].whereType<LatLng>().toList();
      if (pts.length > 1 && !_fitted) {
        try {
          _map.fitCamera(CameraFit.bounds(bounds: LatLngBounds.fromPoints(pts), padding: const EdgeInsets.all(60)));
          _fitted = true;
        } catch (_) {}
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final t = _t;
    final resto = _pt(t?['restaurant']);
    final dest = _pt(t?['delivery']);
    final driver = (t?['driver'] as Map?);
    final me = _pt(driver);
    final trail = ((t?['trail'] as List?) ?? []).whereType<List>().where((p) => p.length >= 2).map((p) => LatLng(asNum(p[0]).toDouble(), asNum(p[1]).toDouble())).toList();
    return Scaffold(
      body: Stack(children: [
        FlutterMap(
          mapController: _map,
          options: MapOptions(initialCenter: resto ?? cotonou, initialZoom: 14, interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate)),
          children: [
            osmTiles(),
            if (trail.length > 1) PolylineLayer(polylines: [Polyline(points: trail, strokeWidth: 5, color: C.brand)]),
            MarkerLayer(markers: [
              if (resto != null) Marker(point: resto, width: 38, height: 38, child: const MapPin(icon: Ic.store, color: C.ink)),
              if (dest != null) Marker(point: dest, width: 38, height: 38, child: const MapPin(icon: Ic.home, color: C.brand)),
              if (me != null) Marker(point: me, width: 44, height: 44, child: const MapPin(icon: Ic.bike, color: C.success)),
            ]),
          ],
        ),
        SafeArea(child: Padding(padding: const EdgeInsets.all(12), child: RoundIcon(Ic.back, onTap: () => Navigator.pop(context)))),
        Positioned(
          left: 16, right: 16, bottom: MediaQuery.of(context).padding.bottom + 16,
          child: Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(R.lg), boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 16)]),
            child: t == null
                ? const Center(child: CircularProgressIndicator(color: C.brand))
                : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(orderStatusLabels[asStr(t['status'])] ?? asStr(t['status']), style: h2()),
                    const SizedBox(height: 6),
                    Text(asStr((t['delivery'] as Map?)?['address']), style: small()),
                    if (asNum(t['traveledKm']) > 0) Text('${asNum(t['traveledKm']).toStringAsFixed(1)} km parcourus', style: small(C.brandDark)),
                    if (driver != null) ...[
                      const SizedBox(height: 12),
                      Row(children: [
                        const Icon(Ic.bike, color: C.success),
                        const SizedBox(width: 10),
                        Expanded(child: Text(asStr(driver['name']), style: h3())),
                        if (asStr(driver['phone']).isNotEmpty) RoundIcon(Ic.phone, bg: C.ink, onTap: () => callPhone(asStr(driver['phone']))),
                      ]),
                      if (me == null) Text("Position du livreur pas encore reçue.", style: small()),
                    ],
                  ]),
          ),
        ),
      ]),
    );
  }
}
