import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../state/cart.dart';
import 'kkiapay_screen.dart';
import 'map_widgets.dart';
import 'tracking_screen.dart';

/// Livraison et paiement : point de livraison a chaque commande, frais exacts, moyen de paiement
class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});
  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _landmark = TextEditingController();
  final _phone = TextEditingController();
  final _map = MapController();
  LatLng? _pos;
  String _address = '';
  Map<String, dynamic>? _quote;
  bool _quoting = false;
  List<Map<String, dynamic>> _methods = [];
  String _mode = 'test';
  Map<String, dynamic>? _kkiapay;
  String _method = 'cash';
  bool _loading = false;
  bool _locating = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final user = context.read<Session>().user;
    _phone.text = (user?['phone'] ?? '').toString();
    final addresses = (user?['addresses'] as List?) ?? const [];
    Map? def;
    for (final a in addresses) {
      if (a is Map && a['isDefault'] == true) def = a;
    }
    def ??= addresses.isNotEmpty && addresses.first is Map ? addresses.first as Map : null;
    if (def != null) {
      _address = (def['address'] ?? '').toString();
      final lat = asDouble(def['lat']);
      final lng = asDouble(def['lng']);
      if (lat != null && lng != null) _pos = LatLng(lat, lng);
    }
    _loadMethods();
    if (_pos != null) _loadQuote();
  }

  @override
  void dispose() {
    _landmark.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _loadMethods() async {
    try {
      final d = await Api.instance.get('/payments/methods');
      final list = (d['methods'] as List? ?? []).map((e) => (e as Map).cast<String, dynamic>()).where((m) => m['available'] == true).toList();
      _mode = (d['mode'] ?? 'test').toString();
      _kkiapay = (d['kkiapay'] as Map?)?.cast<String, dynamic>();
      // Carte : seulement via la fenetre Kkiapay
      list.removeWhere((m) => m['id'] == 'card' && _mode != 'kkiapay');
      list.removeWhere((m) => m['id'] == 'orange');
      setState(() => _methods = list);
    } catch (_) {
      setState(() => _methods = [{'id': 'cash', 'label': 'Espèces à la livraison'}]);
    }
  }

  Future<void> _loadQuote() async {
    if (_pos == null) return;
    setState(() => _quoting = true);
    try {
      final q = await Api.instance.post('/orders/quote', {'items': context.read<Cart>().toOrderItems(), 'lat': _pos!.latitude, 'lng': _pos!.longitude});
      if (mounted) setState(() => _quote = q);
    } catch (_) {
      if (mounted) setState(() => _quote = null);
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  void _setPos(LatLng p) {
    setState(() { _pos = p; _error = null; });
    try { _map.move(p, 16); } catch (_) {}
    _loadQuote();
  }

  Future<void> _useMyPosition() async {
    setState(() => _locating = true);
    final p = await currentPosition(context);
    if (mounted) setState(() => _locating = false);
    if (p != null) _setPos(p);
  }

  Future<void> _pickOnMap() async {
    final p = await Navigator.of(context).push<LatLng>(MaterialPageRoute(builder: (_) => PickLocationScreen(initial: _pos)));
    if (p != null) _setPos(p);
  }

  String _label(Map m) => switch (m['id']) {
        'cash' => 'Espèces à la livraison',
        'mtn_momo' => 'MTN MoMo',
        'moov' => 'Moov Money',
        'card' => 'Carte bancaire',
        _ => (m['label'] ?? '').toString(),
      };

  Future<void> _placeOrder() async {
    final cart = context.read<Cart>();
    if (_pos == null) { setState(() => _error = 'Indique où te livrer : ta position actuelle ou un point sur la carte.'); return; }
    if (_quote?['outOfZone'] == true) { setState(() => _error = (_quote?['outOfZoneMessage'] ?? 'Point hors zone de livraison.').toString()); return; }
    if ((_method == 'mtn_momo' || _method == 'moov') && _phone.text.replaceAll(RegExp(r'\D'), '').length < 8) {
      setState(() => _error = 'Entre le numéro Mobile Money qui va payer.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final created = await Api.instance.post('/orders', {
        'items': cart.toOrderItems(),
        'address': _address.isNotEmpty ? _address : 'Point choisi sur la carte',
        'landmark': _landmark.text.trim(),
        'mapsLink': 'https://www.google.com/maps?q=${_pos!.latitude.toStringAsFixed(6)},${_pos!.longitude.toStringAsFixed(6)}',
        'paymentMethod': _method,
        'lat': _pos!.latitude,
        'lng': _pos!.longitude,
      });
      final orders = (created['orders'] as List? ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      String message = 'Commande envoyée au restaurant. Tu paies en espèces à la livraison.';

      if (_method != 'cash') {
        for (final o in orders) {
          Map<String, dynamic> pay;
          try {
            pay = await Api.instance.post('/payments/initiate', {'orderId': o['id'], 'method': _method, 'amount': o['total'], 'phone': _phone.text.trim()});
          } on ApiException catch (e) {
            // Le paiement n'a pas demarre : on annule pour ne pas laisser une commande jamais payee
            for (final x in orders) {
              try { await Api.instance.delete('/orders/${x['id']}'); } catch (_) {}
            }
            throw ApiException("${e.message} Ta commande n'a pas été envoyée : réessaie ou choisis les espèces.", e.status);
          }
          if (pay['widget'] == true || _mode == 'kkiapay') {
            if (!mounted) return;
            final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(
              builder: (_) => KkiapayScreen(
                orderId: o['id'].toString(), amount: asNum(o['total']), phone: _phone.text.trim(), method: _method,
                publicKey: (_kkiapay?['publicKey'] ?? '').toString(), sandbox: _kkiapay?['sandbox'] == true,
              ),
            ));
            message = ok == true ? 'Paiement reçu, ta commande part au restaurant.' : "Commande enregistrée : règle le paiement depuis le suivi pour qu'elle parte.";
          } else if (pay['manual'] == true) {
            message = 'Commande enregistrée. Envoie ${fcfa(pay['amount'])} au ${pay['payTo']} (${pay['payeeName']}), puis confirme dans le suivi.';
          } else {
            message = _mode == 'test' ? 'Commande envoyée. Paiement de test : aucun argent prélevé.' : 'Commande envoyée. Valide le paiement sur ton téléphone.';
          }
        }
      }
      cart.clear();
      if (!mounted) return;
      toast(context, message);
      final nav = Navigator.of(context);
      nav.popUntil((r) => r.isFirst);
      if (orders.isNotEmpty) {
        nav.push(MaterialPageRoute(builder: (_) => TrackingScreen(orderId: orders.first['id'].toString())));
      }
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    final fee = _quote?['deliveryFee'];
    final outOfZone = _quote?['outOfZone'] == true;
    final total = _quote != null && !outOfZone ? asNum(_quote!['total']) : cart.subtotal;
    return Scaffold(
      appBar: AppBar(leading: IconButton(icon: const Icon(Ic.back), onPressed: () => Navigator.of(context).pop()), title: Text('Livraison et paiement', style: h3())),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 170), children: [
        Text('Où te livrer ?', style: h2()),
        const SizedBox(height: 6),
        Text('Choisis le point exact pour cette commande : il peut changer à chaque fois.', style: small()),
        const SizedBox(height: 14),
        ClipRRect(
          borderRadius: BorderRadius.circular(R.md),
          child: SizedBox(
            height: 190,
            child: Stack(children: [
              FlutterMap(
                mapController: _map,
                options: MapOptions(initialCenter: _pos ?? cotonou, initialZoom: _pos != null ? 16 : 12, interactionOptions: const InteractionOptions(flags: InteractiveFlag.none), onTap: (_, __) => _pickOnMap()),
                children: [
                  osmTiles(),
                  if (_pos != null) MarkerLayer(markers: [Marker(point: _pos!, width: 38, height: 38, child: const MapPin(icon: Ic.pin, color: C.brand))]),
                ],
              ),
              if (_pos == null)
                Positioned.fill(child: Container(color: Colors.white.withValues(alpha: 0.55), alignment: Alignment.center, child: Text('Aucun point choisi', style: h3()))),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: GhostButton(label: _locating ? 'Recherche...' : 'Ma position', icon: Ic.locate, onPressed: _locating ? null : _useMyPosition)),
          const SizedBox(width: 10),
          Expanded(child: GhostButton(label: 'Sur la carte', icon: Ic.pin, onPressed: _pickOnMap)),
        ]),
        const SizedBox(height: 14),
        Field(label: 'Repère pour le livreur', icon: Ic.navigation, controller: _landmark, hint: 'Portail bleu, à côté de la pharmacie...'),
        if (outOfZone) ...[const SizedBox(height: 14), Notice((_quote?['outOfZoneMessage'] ?? '').toString())],
        const SizedBox(height: 28),
        Text('Paiement', style: h2()),
        const SizedBox(height: 12),
        for (final m in _methods)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              borderRadius: BorderRadius.circular(R.md),
              onTap: () => setState(() => _method = m['id'].toString()),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _method == m['id'] ? Colors.white : C.surface,
                  borderRadius: BorderRadius.circular(R.md),
                  border: Border.all(color: _method == m['id'] ? C.ink : Colors.transparent, width: 1.6),
                ),
                child: Row(children: [
                  Icon(m['id'] == 'cash' ? Ic.wallet : Ic.phone, size: 20, color: C.ink2),
                  const SizedBox(width: 14),
                  Expanded(child: Text(_label(m), style: font(size: 15, weight: FontWeight.w700))),
                  Icon(_method == m['id'] ? Ic.check : null, size: 18, color: C.ink),
                ]),
              ),
            ),
          ),
        if (_method == 'mtn_momo' || _method == 'moov') ...[
          const SizedBox(height: 4),
          Field(label: 'Numéro qui paie', icon: Ic.phone, controller: _phone, hint: '01 97 00 00 00', keyboard: TextInputType.phone),
        ],
        if (_mode == 'test' && _method != 'cash') ...[const SizedBox(height: 12), const Notice('Mode test : le paiement est simulé, aucun argent n\'est prélevé.', error: false)],
        const SizedBox(height: 26),
        Text('Récapitulatif', style: h2()),
        const SizedBox(height: 12),
        _row('Sous-total', fcfa(cart.subtotal)),
        _row('Livraison', _pos == null ? 'Choisis un point' : _quoting ? 'Calcul...' : outOfZone ? 'Hors zone' : (_quote?['freeDelivery'] == true ? 'Offerte' : fcfa(fee))),
        const Divider(height: 24),
        _row('Total', fcfa(total), bold: true),
        if (_error != null) ...[const SizedBox(height: 18), Notice(_error!)],
      ]),
      bottomSheet: Container(
        padding: EdgeInsets.fromLTRB(20, 14, 20, MediaQuery.of(context).padding.bottom + 14),
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: C.line))),
        child: PrimaryButton(
          label: 'Commander · ${fcfa(total)}',
          loading: _loading,
          onPressed: (outOfZone || cart.isEmpty) ? null : _placeOrder,
        ),
      ),
    );
  }

  Widget _row(String a, String b, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(children: [
          Text(a, style: bold ? h3() : body(C.muted)),
          const Spacer(),
          Text(b, style: bold ? h3() : font(size: 14.5, weight: FontWeight.w700)),
        ]),
      );
}
