import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import 'client_shell.dart';
import 'tracking_screen.dart';

/// Mes commandes : en cours puis historique
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Map<String, dynamic>> _orders = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await Api.instance.get('/orders');
      _orders = (d['orders'] as List? ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      _error = null;
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final active = _orders.where((o) => activeStatuses.contains(o['status'])).toList();
    final past = _orders.where((o) => !activeStatuses.contains(o['status'])).toList();
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: C.brand,
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 14, 20, 110), children: [
          Text('Commandes', style: h1()),
          const SizedBox(height: 18),
          if (_loading)
            const Padding(padding: EdgeInsets.only(top: 80), child: Center(child: CircularProgressIndicator(color: C.brand)))
          else if (_error != null)
            Notice(_error!)
          else if (_orders.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 40),
              child: EmptyState(icon: Ic.receipt, title: 'Aucune commande', text: 'Tes commandes et leur suivi en direct apparaîtront ici.',
                  action: GhostButton(label: 'Voir le menu', onPressed: () => ClientShell.goTab(context, 0))),
            )
          else ...[
            if (active.isNotEmpty) ...[
              Text('En cours', style: h3()),
              const SizedBox(height: 10),
              for (final o in active) _OrderCard(order: o, onBack: _load),
              const SizedBox(height: 18),
            ],
            if (past.isNotEmpty) ...[
              Text('Historique', style: h3()),
              const SizedBox(height: 10),
              for (final o in past) _OrderCard(order: o, onBack: _load),
            ],
          ],
        ]),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  final VoidCallback onBack;
  const _OrderCard({required this.order, required this.onBack});
  @override
  Widget build(BuildContext context) {
    final status = order['status']?.toString() ?? '';
    final active = activeStatuses.contains(status);
    final items = (order['items'] as List? ?? []).map((e) => (e as Map)).toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: active ? C.brandSoft : C.surface,
        borderRadius: BorderRadius.circular(R.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(R.md),
          onTap: () async {
            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TrackingScreen(orderId: order['id'].toString())));
            onBack();
          },
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(asStr(order['restaurantName'], 'Restaurant'), style: h3())),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                  child: Text(orderStatusLabels[status] ?? status, style: font(size: 12, weight: FontWeight.w700, color: active ? C.brandDark : C.ink2)),
                ),
              ]),
              const SizedBox(height: 6),
              Text(items.map((i) => '${i['qty']} × ${i['name']}').join(', '), style: small(), maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: 10),
              Row(children: [
                Text(dateOf(order['createdAt']?.toString()), style: small()),
                const Spacer(),
                Text(fcfa(asNum(order['total'])), style: font(size: 14.5, weight: FontWeight.w800)),
                const SizedBox(width: 6),
                const Icon(Ic.chevron, size: 18, color: C.muted),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}
