import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/actions.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import 'track_driver_screen.dart';

/// Commandes du restaurant : accepter, preparer, plat pret, suivre le livreur
class OrdersTab extends StatefulWidget {
  const OrdersTab({super.key});
  @override
  State<OrdersTab> createState() => _OrdersTabState();
}

class _OrdersTabState extends State<OrdersTab> with WidgetsBindingObserver {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;
  Timer? _poll;
  final Set<String> _known = {};
  String? _working;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _poll = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _load();
  }

  Future<void> _load() async {
    try {
      final d = await Api.instance.get('/merchants/orders');
      final list = (d['orders'] as List? ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList()
        ..sort((a, b) => asStr(b['createdAt']).compareTo(asStr(a['createdAt'])));
      final fresh = list.where((o) => o['status'] == 'pending' && !_known.contains(o['id'])).toList();
      if (fresh.isNotEmpty && _known.isNotEmpty) {
        HapticFeedback.heavyImpact();
        SystemSound.play(SystemSoundType.alert);
      }
      _known.addAll(list.map((o) => o['id'].toString()));
      if (mounted) setState(() { _orders = list; _error = null; _loading = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.message; _loading = false; });
    }
  }

  Future<void> _run(String id, Future<void> Function() action, String ok) async {
    setState(() => _working = id);
    try {
      await action();
      if (mounted) toast(context, ok);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    } finally {
      if (mounted) setState(() => _working = null);
      _load();
    }
  }

  Future<void> _status(Map o, String status, String ok) =>
      _run(o['id'].toString(), () => Api.instance.put('/merchants/orders/${o['id']}/status', {'status': status}), ok);

  Future<void> _reject(Map o) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Refuser cette commande ?', style: h3()),
        content: Text('Le client sera prévenu que tu ne peux pas la préparer.', style: body()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Retour')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: Text('Refuser', style: font(weight: FontWeight.w700, color: C.danger))),
        ],
      ),
    );
    if (yes == true) await _status(o, 'cancelled', 'Commande refusée');
  }

  Future<void> _chooseDriver(Map o) async {
    List<Map> drivers = [];
    try {
      final d = await Api.instance.get('/merchants/orders/${o['id']}/available-drivers');
      drivers = (d['drivers'] as List? ?? []).whereType<Map>().toList();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
      return;
    }
    if (!mounted) return;
    final chosen = await showModalBottomSheet<Map>(
      context: context,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Livreurs disponibles', style: h2()),
            const SizedBox(height: 6),
            Text("WAYI propose aussi la course automatiquement au plus proche.", style: small()),
            const SizedBox(height: 12),
            if (drivers.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Text('Aucun livreur en ligne pour le moment.', style: body(C.muted))),
            for (final d in drivers)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Ic.bike, color: C.success),
                title: Text(asStr(d['name']), style: font(size: 15, weight: FontWeight.w700)),
                subtitle: Text([if (d['distanceKm'] != null) '${d['distanceKm']} km', if (d['rating'] != null) 'note ${d['rating']}'].join(' · '), style: small()),
                trailing: const Icon(Ic.chevron, color: C.muted),
                onTap: () => Navigator.pop(c, d),
              ),
          ]),
        ),
      ),
    );
    if (chosen != null) {
      await _run(o['id'].toString(), () => Api.instance.put('/merchants/orders/${o['id']}/assign-driver', {'driverId': chosen['id']}), '${chosen['name']} va récupérer la commande');
    }
  }

  @override
  Widget build(BuildContext context) {
    final todo = _orders.where((o) => o['status'] == 'pending').toList();
    final cooking = _orders.where((o) => o['status'] == 'preparing' || o['status'] == 'confirmed').toList();
    final out = _orders.where((o) => o['status'] == 'ready' || o['status'] == 'on_the_way').toList();
    final done = _orders.where((o) => !activeStatuses.contains(o['status'])).take(15).toList();
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: C.brand,
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 14, 20, 30), children: [
          Text('Commandes', style: h1()),
          const SizedBox(height: 4),
          Text('Mise à jour automatique toutes les quelques secondes.', style: small()),
          const SizedBox(height: 18),
          if (_loading) const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator(color: C.brand))),
          if (_error != null) Notice(_error!),
          if (!_loading && _orders.isEmpty)
            const Padding(padding: EdgeInsets.only(top: 40), child: EmptyState(icon: Ic.receipt, title: 'Pas encore de commande', text: 'Les nouvelles commandes apparaissent ici, avec une alerte.')),
          if (todo.isNotEmpty) ...[_section('À accepter', todo.length, C.brand), for (final o in todo) _card(o)],
          if (cooking.isNotEmpty) ...[_section('En préparation', cooking.length, C.ink), for (final o in cooking) _card(o)],
          if (out.isNotEmpty) ...[_section('Prêtes et en route', out.length, C.success), for (final o in out) _card(o)],
          if (done.isNotEmpty) ...[_section('Terminées', done.length, C.muted), for (final o in done) _card(o, compact: true)],
        ]),
      ),
    );
  }

  Widget _section(String t, int n, Color c) => Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 10),
        child: Row(children: [
          Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text('$t ($n)', style: h3()),
        ]),
      );

  Widget _card(Map<String, dynamic> o, {bool compact = false}) {
    final status = asStr(o['status']);
    final items = ((o['items'] as List?) ?? []).whereType<Map>().toList();
    final driver = (o['driver'] as Map?);
    final pay = asStr(o['paymentStatus']);
    final payToMe = asStr(o['paymentProvider']) == 'manual' && asStr(o['paymentPayee']) == 'restaurant' && (pay == 'awaiting_payment' || pay == 'claimed');
    final waitingWayi = asStr(o['paymentProvider']) == 'manual' && asStr(o['paymentPayee']) != 'restaurant' && (pay == 'awaiting_payment' || pay == 'claimed');
    final working = _working == o['id'];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: status == 'pending' ? C.brandSoft : (compact ? C.surface : Colors.white),
        borderRadius: BorderRadius.circular(R.md),
        border: Border.all(color: status == 'pending' ? C.brand.withOpacity(0.35) : C.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('${asStr(o['customerName'], 'Client')} · ${hourOf(asStr(o['createdAt']))}', style: h3())),
          Text(fcfa(asNum(o['subtotal'])), style: font(size: 15, weight: FontWeight.w800)),
        ]),
        const SizedBox(height: 4),
        Text('${asStr(o['id'])} · ${orderStatusLabels[status] ?? status}', style: small()),
        if (!compact) ...[
          const SizedBox(height: 10),
          for (final i in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text('${i['qty']} × ${i['name']}', style: font(size: 14.5, weight: FontWeight.w600, color: C.ink2)),
            ),
          if (asStr(o['landmark']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Repère : ${asStr(o['landmark'])}', style: small())),
          const SizedBox(height: 12),
          if (status == 'pending' && payToMe) ...[
            Notice(pay == 'claimed'
                ? 'Le client dit avoir envoyé ${fcfa(asNum(o['total']))} sur ton numéro. Vérifie puis confirme.'
                : 'Paiement Mobile Money attendu sur ton numéro (${fcfa(asNum(o['total']))}).', error: false),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(child: GhostButton(label: 'Pas reçu', onPressed: working ? null : () => _run(o['id'].toString(), () => Api.instance.put('/merchants/orders/${o['id']}/payment', {'action': 'reject'}), 'Paiement signalé comme non reçu'))),
              const SizedBox(width: 10),
              Expanded(flex: 2, child: PrimaryButton(label: "J'ai reçu l'argent", loading: working, onPressed: () => _run(o['id'].toString(), () => Api.instance.put('/merchants/orders/${o['id']}/payment', {'action': 'confirm'}), 'Paiement confirmé'))),
            ]),
          ] else if (status == 'pending' && waitingWayi) ...[
            const Notice('Paiement en cours de vérification par WAYI. Tu pourras accepter juste après.', error: false),
          ] else if (status == 'pending') ...[
            Row(children: [
              Expanded(child: GhostButton(label: 'Refuser', onPressed: working ? null : () => _reject(o))),
              const SizedBox(width: 10),
              Expanded(flex: 2, child: PrimaryButton(label: 'Accepter', icon: Ic.check, loading: working, onPressed: () => _status(o, 'preparing', 'Commande acceptée, au fourneau !'))),
            ]),
          ],
          if (status == 'preparing' || status == 'confirmed') ...[
            if (driver != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text('Livreur : ${asStr(driver['name'])}', style: font(weight: FontWeight.w700, color: C.success))),
            Row(children: [
              if (driver == null) ...[Expanded(child: GhostButton(label: 'Livreur', icon: Ic.bike, onPressed: working ? null : () => _chooseDriver(o))), const SizedBox(width: 10)],
              Expanded(flex: 2, child: PrimaryButton(label: 'Plat prêt', icon: Ic.check, dark: false, loading: working, onPressed: () => _status(o, 'ready', 'Le livreur est prévenu'))),
            ]),
          ],
          if (status == 'ready' || status == 'on_the_way') ...[
            if (driver != null)
              Row(children: [
                const Icon(Ic.bike, size: 18, color: C.success),
                const SizedBox(width: 8),
                Expanded(child: Text(asStr(driver['name']), style: font(weight: FontWeight.w700))),
                if (asStr(driver['phone']).isNotEmpty) IconButton(icon: const Icon(Ic.phone, color: C.ink), onPressed: () => callPhone(asStr(driver['phone']))),
              ])
            else ...[
              Text('En attente d\'un livreur.', style: small()),
              const SizedBox(height: 8),
              GhostButton(label: 'Choisir un livreur', icon: Ic.bike, onPressed: working ? null : () => _chooseDriver(o)),
            ],
            if (driver != null) ...[
              const SizedBox(height: 8),
              GhostButton(label: 'Suivre le livreur', icon: Ic.navigation, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TrackDriverScreen(orderId: o['id'].toString())))),
            ],
          ],
        ],
      ]),
    );
  }
}
