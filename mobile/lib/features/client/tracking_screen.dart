import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import 'kkiapay_screen.dart';
import 'map_widgets.dart';

/// Suivi d'une commande : etapes, livreur en direct sur la carte, paiement, note
class TrackingScreen extends StatefulWidget {
  final String orderId;
  const TrackingScreen({super.key, required this.orderId});
  @override
  State<TrackingScreen> createState() => _TrackingScreenState();
}

class _TrackingScreenState extends State<TrackingScreen> {
  Map<String, dynamic>? _o;
  String? _error;
  Timer? _timer;
  final _map = MapController();
  bool _fitted = false;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_o == null || activeStatuses.contains(_o!['status'])) _load();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await Api.instance.get('/orders/${widget.orderId}');
      if (!mounted) return;
      setState(() { _o = d; _error = null; });
      _fit();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Map<String, dynamic> get _t => ((_o?['tracking'] as Map?) ?? const {}).cast<String, dynamic>();

  LatLng? _pt(dynamic m) {
    if (m is! Map) return null;
    final a = asDouble(m['lat']);
    final b = asDouble(m['lng']);
    return a == null || b == null ? null : LatLng(a, b);
  }

  List<LatLng> get _points => [_pt(_t['restaurant']), _pt(_t['delivery']), _pt(_t['driver'])].whereType<LatLng>().toList();

  void _fit() {
    final pts = _points;
    if (pts.isEmpty) return;
    try {
      if (pts.length == 1) {
        _map.move(pts.first, 15);
      } else if (!_fitted || _o?['status'] == 'on_the_way') {
        _map.fitCamera(CameraFit.bounds(bounds: LatLngBounds.fromPoints(pts), padding: const EdgeInsets.all(50)));
      }
      _fitted = true;
    } catch (_) {}
  }

  Future<void> _cancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Annuler la commande ?', style: h3()),
        content: Text("Le restaurant ne l'a pas encore acceptée, tu peux l'annuler.", style: body()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Non')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: Text('Oui, annuler', style: font(weight: FontWeight.w700, color: C.danger))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.instance.delete('/orders/${widget.orderId}');
      _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _claimManual() async {
    final ref = TextEditingController();
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (c) => Padding(
        padding: EdgeInsets.fromLTRB(24, 0, 24, MediaQuery.of(c).viewInsets.bottom + 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text("J'ai envoyé l'argent", style: h2()),
          const SizedBox(height: 8),
          Text('Indique la référence du message de confirmation Mobile Money, WAYI vérifie et lance ta commande.', style: body(C.muted)),
          const SizedBox(height: 16),
          Field(label: 'Référence de la transaction', icon: Ic.hash, controller: ref, hint: 'Ex : 1234567890'),
          const SizedBox(height: 18),
          PrimaryButton(label: 'Confirmer', onPressed: () => Navigator.pop(c, true)),
        ]),
      ),
    );
    if (sent != true) return;
    try {
      final r = await Api.instance.post('/payments/manual-claim', {'orderId': widget.orderId, 'reference': ref.text.trim()});
      if (mounted) toast(context, (r['message'] ?? 'Merci !').toString());
      _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _payKkiapay() async {
    try {
      final m = await Api.instance.get('/payments/methods');
      final k = (m['kkiapay'] as Map?) ?? const {};
      if (!mounted) return;
      final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
        builder: (_) => KkiapayScreen(
          orderId: widget.orderId, amount: asNum(_o?['total']), phone: asStr(_o?['paymentFromPhone']),
          method: asStr(_o?['paymentMethod'], 'mtn_momo'), publicKey: asStr(k['publicKey']), sandbox: k['sandbox'] == true,
        ),
      ));
      if (ok == true && mounted) toast(context, 'Paiement reçu, merci !');
      _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _rate() async {
    int stars = 5;
    final review = TextEditingController();
    final send = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Padding(
          padding: EdgeInsets.fromLTRB(24, 0, 24, MediaQuery.of(c).viewInsets.bottom + 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Comment était ta commande ?', style: h2()),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  iconSize: 34,
                  onPressed: () => set(() => stars = i),
                  icon: Icon(Ic.star, color: i <= stars ? C.brand : C.line),
                ),
            ]),
            const SizedBox(height: 10),
            Field(label: 'Un commentaire (facultatif)', icon: Ic.info, controller: review, hint: 'Le plat, la livraison...'),
            const SizedBox(height: 18),
            PrimaryButton(label: 'Envoyer ma note', onPressed: () => Navigator.pop(c, true)),
          ]),
        ),
      ),
    );
    if (send != true) return;
    try {
      await Api.instance.put('/orders/${widget.orderId}/rate', {'dishRating': stars, 'serviceRating': stars, 'review': review.text.trim()});
      if (mounted) toast(context, 'Merci pour ta note !');
      _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = _o;
    if (o == null) {
      return Scaffold(
        appBar: AppBar(leading: IconButton(icon: const Icon(Ic.back), onPressed: () => Navigator.pop(context))),
        body: Center(child: _error != null ? Padding(padding: const EdgeInsets.all(24), child: Notice(_error!)) : const CircularProgressIndicator(color: C.brand)),
      );
    }
    final status = asStr(o['status']);
    final steps = (o['steps'] as List? ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
    final driver = (_t['driver'] as Map?)?.cast<String, dynamic>();
    final trail = (_t['trail'] as List? ?? []).whereType<List>().where((p) => p.length >= 2).map((p) => LatLng(asNum(p[0]).toDouble(), asNum(p[1]).toDouble())).toList();
    final restaurant = _pt(_t['restaurant']);
    final delivery = _pt(_t['delivery']);
    final driverPos = _pt(driver);
    final items = (o['items'] as List? ?? []).map((e) => (e as Map)).toList();
    final payStatus = asStr(o['paymentStatus']);

    return Scaffold(
      body: CustomScrollView(slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 330,
          automaticallyImplyLeading: false,
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          leading: Padding(padding: const EdgeInsets.all(6), child: RoundIcon(Ic.back, onTap: () => Navigator.pop(context))),
          flexibleSpace: FlexibleSpaceBar(
            background: _points.isEmpty
                ? Container(color: C.surface, alignment: Alignment.center, child: Text('Carte indisponible', style: small()))
                : FlutterMap(
                    mapController: _map,
                    options: MapOptions(initialCenter: _points.first, initialZoom: 14, onMapReady: _fit, interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate)),
                    children: [
                      osmTiles(),
                      if (trail.length > 1) PolylineLayer(polylines: [Polyline(points: trail, strokeWidth: 5, color: C.brand)]),
                      MarkerLayer(markers: [
                        if (restaurant != null) Marker(point: restaurant, width: 38, height: 38, child: const MapPin(icon: Ic.store, color: C.ink)),
                        if (delivery != null) Marker(point: delivery, width: 38, height: 38, child: const MapPin(icon: Ic.home, color: C.brand)),
                        if (driverPos != null) Marker(point: driverPos, width: 44, height: 44, child: const MapPin(icon: Ic.bike, color: C.success)),
                      ]),
                    ],
                  ),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(22, 20, 22, 40),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(asStr(o['restaurantName']), style: small()),
              const SizedBox(height: 4),
              Text(orderStatusLabels[status] ?? status, style: h1()),
              if (activeStatuses.contains(status) && o['estimatedDelivery'] != null) ...[
                const SizedBox(height: 6),
                Text('Arrivée prévue vers ${hourOf(o['estimatedDelivery']?.toString())}', style: body(C.muted)),
              ],
              if (status == 'on_the_way' && asNum(_t['traveledKm']) > 0) ...[
                const SizedBox(height: 4),
                Text('${asNum(_t['traveledKm']).toStringAsFixed(1)} km parcourus depuis le restaurant', style: small(C.brandDark)),
              ],
              const SizedBox(height: 18),
              if (payStatus == 'awaiting_payment' && asStr(o['paymentProvider']) == 'manual') ...[
                Notice('Envoie ${fcfa(asNum(o['total']))} au ${asStr(o['paymentTo'])} (${asStr(o['paymentPayeeName'])}) puis confirme ici.', error: false),
                const SizedBox(height: 10),
                PrimaryButton(label: "J'ai envoyé l'argent", dark: false, onPressed: _claimManual),
                const SizedBox(height: 18),
              ],
              if (payStatus == 'awaiting_payment' && asStr(o['paymentProvider']) == 'kkiapay') ...[
                const Notice("Ta commande attend le paiement pour partir au restaurant.", error: false),
                const SizedBox(height: 10),
                PrimaryButton(label: 'Payer maintenant', dark: false, onPressed: _payKkiapay),
                const SizedBox(height: 18),
              ],
              if (payStatus == 'claimed') ...[const Notice('Paiement signalé : WAYI vérifie la réception.', error: false), const SizedBox(height: 18)],
              if (driver != null && activeStatuses.contains(status)) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(R.md)),
                  child: Row(children: [
                    Container(width: 46, height: 46, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: const Icon(Ic.bike, color: C.success, size: 22)),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(asStr(driver['name'], 'Ton livreur'), style: h3()),
                      Text([asStr(driver['vehicle']), asStr(driver['plate'])].where((x) => x.isNotEmpty).join(' · '), style: small()),
                    ])),
                    if (asStr(driver['phone']).isNotEmpty)
                      RoundIcon(Ic.phone, bg: C.ink, onTap: () => launchUrl(Uri.parse('tel:${asStr(driver['phone']).replaceAll(' ', '')}'))),
                  ]),
                ),
                const SizedBox(height: 22),
              ],
              for (var i = 0; i < steps.length; i++) _Step(step: steps[i], last: i == steps.length - 1, current: steps[i]['key'] == status),
              const SizedBox(height: 18),
              const Divider(),
              const SizedBox(height: 14),
              Text('Ta commande', style: h3()),
              const SizedBox(height: 10),
              for (final it in items)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(children: [
                    Text('${it['qty']} ×', style: font(weight: FontWeight.w700)),
                    const SizedBox(width: 10),
                    Expanded(child: Text(asStr(it['name']), style: body())),
                    Text(fcfa(asNum(it['price']) * asNum(it['qty'], 1)), style: font(weight: FontWeight.w700)),
                  ]),
                ),
              const SizedBox(height: 8),
              Row(children: [Text('Livraison', style: body(C.muted)), const Spacer(), Text(fcfa(asNum(o['deliveryFee'])), style: font(weight: FontWeight.w700))]),
              const SizedBox(height: 6),
              Row(children: [Text('Total', style: h3()), const Spacer(), Text(fcfa(asNum(o['total'])), style: h3())]),
              const SizedBox(height: 24),
              if (status == 'pending') GhostButton(label: 'Annuler la commande', icon: Ic.close, onPressed: _cancel),
              if (status == 'delivered' && o['rating'] == null) PrimaryButton(label: 'Noter ma commande', icon: Ic.star, onPressed: _rate),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _Step extends StatelessWidget {
  final Map<String, dynamic> step;
  final bool last;
  final bool current;
  const _Step({required this.step, required this.last, required this.current});
  @override
  Widget build(BuildContext context) {
    final done = step['done'] == true;
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Column(children: [
          Container(
            width: 24, height: 24,
            decoration: BoxDecoration(color: done ? C.ink : Colors.white, shape: BoxShape.circle, border: Border.all(color: done ? C.ink : C.line, width: 2)),
            child: done ? const Icon(Ic.check, size: 13, color: Colors.white) : null,
          ),
          if (!last) Expanded(child: Container(width: 2, color: done ? C.ink : C.line)),
        ]),
        const SizedBox(width: 14),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(asStr(step['label']), style: font(size: 15, weight: current || done ? FontWeight.w700 : FontWeight.w500, color: done || current ? C.ink : C.muted)),
              if (current || done) Text(asStr(step['sub']), style: small()),
            ]),
          ),
        ),
      ]),
    );
  }
}
