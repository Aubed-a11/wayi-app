import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

/// Chiffres du restaurant : ventes, net apres commission, plats qui marchent
class StatsTab extends StatefulWidget {
  const StatsTab({super.key});
  @override
  State<StatsTab> createState() => _StatsTabState();
}

class _StatsTabState extends State<StatsTab> {
  Map<String, dynamic>? _dash;
  Map<String, dynamic>? _an;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([Api.instance.get('/merchants/dashboard'), Api.instance.get('/merchants/analytics')]);
      if (mounted) setState(() { _dash = r[0]; _an = r[1]; _error = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ((_dash?['stats'] as Map?) ?? const {});
    final rev = ((_an?['revenue'] as Map?) ?? const {});
    final top = ((_an?['dishEarnings'] as List?) ?? []).whereType<Map>().toList();
    final best = top.isEmpty ? 0 : top.map((d) => asNum(d['revenue'])).reduce((a, b) => a > b ? a : b);
    final maxRev = best > 0 ? best : 1;
    return SafeArea(
      child: RefreshIndicator(
        color: C.brand,
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 14, 20, 30), children: [
          Text('Chiffres', style: h1()),
          const SizedBox(height: 18),
          if (_error != null) Notice(_error!),
          if (_dash == null && _error == null) const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator(color: C.brand))),
          if (_dash != null) ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: C.ink, borderRadius: BorderRadius.circular(R.lg)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text("Aujourd'hui", style: small(Colors.white70)),
                const SizedBox(height: 6),
                Text(fcfa(asNum(s['todayRevenue'])), style: h1(Colors.white)),
                const SizedBox(height: 4),
                Text('${asNum(s['todayOrders']).toInt()} commande${asNum(s['todayOrders']) > 1 ? 's' : ''}', style: small(Colors.white70)),
              ]),
            ),
            const SizedBox(height: 12),
            Row(children: [
              _Box(value: fcfa(asNum(rev['net'])), label: 'Net encaissé (après ${asStr(rev['commissionRate'], '15%')})'),
              const SizedBox(width: 10),
              _Box(value: fcfa(asNum((_an?['orders'] as Map?)?['avgBasket'])), label: 'Panier moyen'),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              _Box(value: '${asNum(s['totalOrders']).toInt()}', label: 'Commandes au total'),
              const SizedBox(width: 10),
              _Box(value: s['rating'] == null ? '-' : asNum(s['rating']).toStringAsFixed(1), label: 'Note moyenne'),
            ]),
            const SizedBox(height: 14),
            Notice(asStr(_dash?['message']), error: false),
            const SizedBox(height: 24),
            Text('Ce qui se vend', style: h3()),
            const SizedBox(height: 12),
            if (top.isEmpty) Text('Les ventes par plat apparaîtront après tes premières livraisons.', style: small()),
            for (final d in top.take(8))
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(asStr(d['name']), style: font(size: 14.5, weight: FontWeight.w700))),
                    Text('${asNum(d['qty']).toInt()} vendus · ${fcfa(asNum(d['net']))}', style: small(C.ink2)),
                  ]),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(value: (asNum(d['revenue']) / maxRev).toDouble(), minHeight: 8, backgroundColor: C.surface, color: C.brand),
                  ),
                ]),
              ),
          ],
        ]),
      ),
    );
  }
}

class _Box extends StatelessWidget {
  final String value, label;
  const _Box({required this.value, required this.label});
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
