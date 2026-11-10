import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/actions.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../client/map_widgets.dart';
import '../espaces/account_sheet.dart';
import 'gps_share.dart';

/// Espace livreur : en ligne / hors ligne, courses proposees, course en cours, gains
class DriverHome extends StatefulWidget {
  const DriverHome({super.key});
  @override
  State<DriverHome> createState() => _DriverHomeState();
}

class _DriverHomeState extends State<DriverHome> with WidgetsBindingObserver {
  final _gps = GpsShare();
  Map<String, dynamic>? _d;
  String? _error;
  String? _gpsError;
  bool _busy = false;
  Timer? _poll;
  Timer? _tick;
  String? _lastPingId;
  LatLng? _me;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) => _load());
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_ping != null && mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _tick?.cancel();
    _gps.stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Map<String, dynamic> get _driver => ((_d?['driver'] as Map?) ?? const {}).cast<String, dynamic>();
  Map<String, dynamic> get _stats => ((_d?['stats'] as Map?) ?? const {}).cast<String, dynamic>();
  Map<String, dynamic>? get _ping => (_d?['incomingPing'] as Map?)?.cast<String, dynamic>();
  Map<String, dynamic>? get _active => (_d?['activeDelivery'] as Map?)?.cast<String, dynamic>();
  String get _status => asStr(_driver['status'], 'offline');
  bool get _online => _status == 'available' || _status == 'busy';

  Future<void> _load() async {
    try {
      final d = await Api.instance.get('/drivers/dashboard');
      if (!mounted) return;
      final ping = (d['incomingPing'] as Map?)?['orderId']?.toString();
      if (ping != null && ping != _lastPingId) {
        HapticFeedback.heavyImpact();
        SystemSound.play(SystemSoundType.alert);
      }
      _lastPingId = ping;
      setState(() { _d = d; _error = null; });
      final status = asStr((d['driver'] as Map?)?['status']);
      if ((status == 'available' || status == 'busy') && !_gps.active) _startGps();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _startGps() async {
    final err = await _gps.start((p) {
      if (mounted) setState(() => _me = LatLng(p.latitude, p.longitude));
    });
    if (mounted) setState(() => _gpsError = err);
  }

  Future<void> _toggleOnline() async {
    if (_busy) return;
    setState(() { _busy = true; _gpsError = null; });
    try {
      if (!_online) {
        final err = await GpsShare.ensurePermission();
        if (err != null) { setState(() => _gpsError = err); return; }
        final p = await GpsShare.current();
        if (p == null) { setState(() => _gpsError = 'Position GPS introuvable. Sors un peu à découvert et réessaie.'); return; }
        await Api.instance.put('/drivers/status', {'status': 'available', 'lat': p.latitude, 'lng': p.longitude});
        _me = LatLng(p.latitude, p.longitude);
        await _startGps();
      } else {
        await Api.instance.put('/drivers/status', {'status': 'offline'});
        await _gps.stop();
      }
      await _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _act(String path, String ok) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await Api.instance.put(path);
      if (mounted) toast(context, ok);
      await _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
      await _load();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    try { await Api.instance.put('/drivers/status', {'status': 'offline'}); } catch (_) {}
    await _gps.stop();
    if (mounted) await context.read<Session>().logout();
  }

  @override
  Widget build(BuildContext context) {
    if (_d == null) {
      return Scaffold(body: Center(child: _error != null ? Padding(padding: const EdgeInsets.all(24), child: Notice(_error!)) : const CircularProgressIndicator(color: C.brand)));
    }
    final v = (_driver['vehicle'] as Map?) ?? const {};
    final pending = _driver['pendingApproval'] == true;
    final suspended = _driver['suspended'] == true;
    final recent = ((_d?['recentDeliveries'] as List?) ?? []).whereType<Map>().toList();
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          color: C.brand,
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.fromLTRB(20, 14, 20, 40), children: [
            Row(children: [
              Container(
                width: 50, height: 50, alignment: Alignment.center,
                decoration: const BoxDecoration(color: C.brandSoft, shape: BoxShape.circle),
                child: Text(asStr(_driver['name']).isEmpty ? 'L' : asStr(_driver['name']).substring(0, 1).toUpperCase(), style: h3(C.brandDark)),
              ),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(asStr(_driver['name']), style: h3(), overflow: TextOverflow.ellipsis),
                Text([_vehicleLabel(asStr(v['type'])), asStr(v['plate'])].where((x) => x.isNotEmpty).join(' · '), style: small()),
              ])),
              Row(children: [
                const Icon(Ic.star, size: 15, color: C.brand),
                const SizedBox(width: 4),
                Text(asNum(_stats['rating'], 5).toStringAsFixed(1), style: font(weight: FontWeight.w700)),
              ]),
              IconButton(
                icon: const Icon(Ic.user, color: C.ink2),
                onPressed: () => showAccountSheet(context, passwordPath: '/drivers/me/password', onLogout: _logout),
              ),
            ]),
            const SizedBox(height: 20),
            _OnlineCard(online: _online, busy: _busy, status: _status, disabled: suspended, onTap: _toggleOnline),
            if (_gpsError != null) ...[const SizedBox(height: 10), Notice(_gpsError!)],
            if (suspended) ...[
              const SizedBox(height: 12),
              Notice(pending
                  ? "Ton compte est en attente de validation par l'équipe WAYI. Tu pourras passer en ligne dès qu'il sera activé."
                  : "Ton compte est suspendu pour le moment. Contacte l'équipe WAYI."),
            ],
            if (_ping != null && _active == null) ...[const SizedBox(height: 18), _pingCard(_ping!)],
            if (_active != null) ...[const SizedBox(height: 18), _activeCard(_active!)],
            if (_active == null && _ping == null && _online) ...[
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(R.md)),
                child: Row(children: [
                  const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: C.brand)),
                  const SizedBox(width: 14),
                  Expanded(child: Text("En attente d'une course. Garde l'appli ouverte ou en arrière-plan, on te prévient.", style: body())),
                ]),
              ),
            ],
            const SizedBox(height: 24),
            Text("Aujourd'hui", style: h3()),
            const SizedBox(height: 12),
            Row(children: [
              _Tile(value: '${asNum(_stats['todayDeliveries']).toInt()}', label: 'Courses'),
              const SizedBox(width: 10),
              _Tile(value: fcfa(asNum(_stats['todayEarnings'])), label: 'Gains'),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              _Tile(value: fcfa(asNum(_stats['monthlyEarnings'])), label: 'Ce mois'),
              const SizedBox(width: 10),
              _Tile(value: '${asNum(_stats['totalDeliveries']).toInt()}', label: 'Courses au total'),
            ]),
            if (recent.isNotEmpty) ...[
              const SizedBox(height: 24),
              Text('Dernières livraisons', style: h3()),
              const SizedBox(height: 8),
              for (final o in recent)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(width: 40, height: 40, decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(12)), child: const Icon(Ic.check, size: 18, color: C.success)),
                  title: Text(asStr(o['restaurantName']), style: font(size: 14.5, weight: FontWeight.w700)),
                  subtitle: Text(dateOf(asStr(o['deliveredAt'], asStr(o['createdAt']))), style: small()),
                  trailing: Text('+${fcfa((asNum(o['deliveryFee']) * 0.8).round())}', style: font(weight: FontWeight.w800, color: C.success)),
                ),
            ],
          ]),
        ),
      ),
    );
  }

  String _vehicleLabel(String t) => {'moto': 'Moto', 'velo': 'Vélo', 'voiture': 'Voiture', 'tricycle': 'Tricycle'}[t] ?? t;

  Widget _pingCard(Map<String, dynamic> p) {
    final exp = DateTime.tryParse(asStr(p['expiresAt']));
    final left = exp?.difference(DateTime.now()).inSeconds.clamp(0, 999);
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: C.ink, borderRadius: BorderRadius.circular(R.lg)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('Nouvelle course', style: h3(Colors.white)),
          const Spacer(),
          if (left != null) Text('${left}s', style: font(size: 15, weight: FontWeight.w800, color: C.brand)),
        ]),
        const SizedBox(height: 14),
        _Line(icon: Ic.store, text: asStr(p['restaurantName']), light: true),
        _Line(icon: Ic.pin, text: [asStr(p['address']), asStr(p['landmark'])].where((x) => x.isNotEmpty).join(' · '), light: true),
        const SizedBox(height: 10),
        Text('Tu gagnes ${fcfa(asNum(p['estimatedEarnings']))}', style: h2(Colors.white)),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: _busy ? null : () => _act('/drivers/orders/${p['orderId']}/decline', 'Course refusée'),
              style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white24), minimumSize: const Size.fromHeight(52), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.md))),
              child: Text('Refuser', style: font(weight: FontWeight.w700, color: Colors.white)),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: FilledButton(
              onPressed: _busy ? null : () => _act('/drivers/orders/${p['orderId']}/accept', 'Course acceptée'),
              style: FilledButton.styleFrom(backgroundColor: C.brand, minimumSize: const Size.fromHeight(52), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.md))),
              child: Text('Accepter', style: font(weight: FontWeight.w800, color: Colors.white)),
            ),
          ),
        ]),
      ]),
    );
  }

  LatLng? _pt(dynamic m) {
    if (m is! Map) return null;
    final a = asDouble(m['lat']);
    final b = asDouble(m['lng']);
    return a == null || b == null ? null : LatLng(a, b);
  }

  Widget _activeCard(Map<String, dynamic> o) {
    final t = ((o['tracking'] as Map?) ?? const {}).cast<String, dynamic>();
    final resto = _pt(t['restaurant']);
    final dest = _pt(t['delivery']);
    final status = asStr(o['status']);
    final picked = status == 'on_the_way';
    final customer = (o['customer'] as Map?) ?? const {};
    final items = ((o['items'] as List?) ?? []).whereType<Map>().toList();
    final cash = asStr(o['paymentMethod']) == 'cash';
    final pts = [resto, dest, _me].whereType<LatLng>().toList();
    final target = picked ? dest : resto;
    final label = switch (status) {
      'pending' => 'En attente du restaurant',
      'confirmed' || 'preparing' => 'Le restaurant prépare la commande',
      'ready' => 'Commande prête : va la récupérer',
      'on_the_way' => 'En route vers le client',
      _ => status,
    };
    return Container(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(R.lg), border: Border.all(color: C.line)),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (pts.isNotEmpty)
          SizedBox(
            height: 210,
            child: FlutterMap(
              options: MapOptions(
                initialCameraFit: pts.length > 1 ? CameraFit.bounds(bounds: LatLngBounds.fromPoints(pts), padding: const EdgeInsets.all(40)) : null,
                initialCenter: pts.first,
                initialZoom: 15,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
              ),
              children: [
                osmTiles(),
                MarkerLayer(markers: [
                  if (resto != null) Marker(point: resto, width: 38, height: 38, child: const MapPin(icon: Ic.store, color: C.ink)),
                  if (dest != null) Marker(point: dest, width: 38, height: 38, child: const MapPin(icon: Ic.home, color: C.brand)),
                  if (_me != null) Marker(point: _me!, width: 40, height: 40, child: const MapPin(icon: Ic.bike, color: C.success)),
                ]),
              ],
            ),
          ),
        Padding(
          padding: const EdgeInsets.all(18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: h2()),
            const SizedBox(height: 12),
            _Line(icon: Ic.store, text: asStr(o['restaurantName'])),
            _Line(icon: Ic.user, text: asStr(customer['name'], 'Client')),
            _Line(icon: Ic.pin, text: [asStr(o['address']), asStr(o['landmark'])].where((x) => x.isNotEmpty).join(' · ')),
            _Line(icon: Ic.bag, text: items.map((i) => '${i['qty']} × ${i['name']}').join(', ')),
            const SizedBox(height: 8),
            if (cash)
              Notice('Paiement en espèces : encaisse ${fcfa(asNum(o['total']))} à la livraison.', error: false)
            else
              Text('Déjà payé en ligne. Rien à encaisser.', style: small(C.success)),
            const SizedBox(height: 14),
            Row(children: [
              if (target != null)
                Expanded(child: GhostButton(label: picked ? 'Vers le client' : 'Vers le resto', icon: Ic.navigation, onPressed: () => openDirections(target.latitude, target.longitude))),
              if (target != null && asStr(customer['phone']).isNotEmpty) const SizedBox(width: 10),
              if (asStr(customer['phone']).isNotEmpty)
                Expanded(child: GhostButton(label: 'Appeler', icon: Ic.phone, onPressed: () => callPhone(asStr(customer['phone'])))),
            ]),
            const SizedBox(height: 10),
            if (status == 'pending' || status == 'confirmed')
              const PrimaryButton(label: 'En attente du restaurant', onPressed: null)
            else if (!picked)
              PrimaryButton(label: "J'ai récupéré la commande", icon: Ic.check, loading: _busy, onPressed: () => _act('/drivers/orders/${o['id']}/pickup', 'Bonne route !'))
            else
              PrimaryButton(label: 'Commande livrée', icon: Ic.check, dark: false, loading: _busy, onPressed: () => _confirmDelivered(o)),
          ]),
        ),
      ]),
    );
  }

  Future<void> _confirmDelivered(Map<String, dynamic> o) async {
    final cash = asStr(o['paymentMethod']) == 'cash';
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Commande remise au client ?', style: h3()),
        content: Text(cash ? 'Confirme que tu as encaissé ${fcfa(asNum(o['total']))}.' : 'Le client a bien reçu sa commande.', style: body()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Pas encore')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: Text('Oui, livrée', style: font(weight: FontWeight.w800, color: C.brandDark))),
        ],
      ),
    );
    if (ok == true) await _act('/drivers/orders/${o['id']}/complete', 'Livraison terminée, bravo !');
  }
}

class _OnlineCard extends StatelessWidget {
  final bool online, busy, disabled;
  final String status;
  final VoidCallback onTap;
  const _OnlineCard({required this.online, required this.busy, required this.status, required this.onTap, this.disabled = false});
  @override
  Widget build(BuildContext context) => AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: online ? C.success : C.surface, borderRadius: BorderRadius.circular(R.lg)),
        child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(online ? (status == 'busy' ? 'En course' : 'Tu es en ligne') : 'Hors ligne', style: h2(online ? Colors.white : C.ink)),
            const SizedBox(height: 4),
            Text(online ? 'Ta position est partagée, les courses arrivent ici.' : 'Passe en ligne pour recevoir des courses.', style: small(online ? Colors.white70 : C.muted)),
          ])),
          const SizedBox(width: 12),
          busy
              ? SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.4, color: online ? Colors.white : C.brand))
              : Switch(
                  value: online,
                  onChanged: (disabled || status == 'busy') ? null : (_) => onTap(),
                  activeThumbColor: Colors.white,
                  activeTrackColor: Colors.white24,
                ),
        ]),
      );
}

class _Tile extends StatelessWidget {
  final String value, label;
  const _Tile({required this.value, required this.label});
  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(R.md)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(value, style: h3(), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Text(label, style: small()),
          ]),
        ),
      );
}

class _Line extends StatelessWidget {
  final IconData icon;
  final String text;
  final bool light;
  const _Line({required this.icon, required this.text, this.light = false});
  @override
  Widget build(BuildContext context) => text.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, size: 16, color: light ? Colors.white60 : C.muted),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: font(size: 14, weight: FontWeight.w600, color: light ? Colors.white : C.ink2, height: 1.4))),
          ]),
        );
}
