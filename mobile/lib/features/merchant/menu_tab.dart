import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import 'dish_form_screen.dart';

const periodLabels = {'petit_dejeuner': 'Petit-déjeuner', 'dejeuner': 'Déjeuner', 'gouter': 'Goûter', 'diner': 'Dîner'};
const categoryLabels = {'plats_locaux': 'Plats locaux', 'healthy': 'Healthy', 'burgers': 'Burgers', 'grillades': 'Grillades', 'boissons': 'Boissons'};

/// Le menu du restaurant : ajouter, modifier, retirer des plats
class MenuTab extends StatefulWidget {
  const MenuTab({super.key});
  @override
  State<MenuTab> createState() => _MenuTabState();
}

class _MenuTabState extends State<MenuTab> {
  List<Map<String, dynamic>> _dishes = [];
  int? _max;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await Api.instance.get('/merchants/dishes');
      _dishes = (d['dishes'] as List? ?? []).map((e) => (e as Map).cast<String, dynamic>()).toList();
      _max = d['maxDishes'] is num ? (d['maxDishes'] as num).toInt() : null;
      _error = null;
    } on ApiException catch (e) {
      _error = e.message;
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _open([Map<String, dynamic>? dish]) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => DishFormScreen(dish: dish)));
    if (changed == true) _load();
  }

  Future<void> _delete(Map d) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Retirer « ${d['name']} » ?', style: h3()),
        content: Text('Le plat ne sera plus proposé aux clients.', style: body()),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Garder')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: Text('Retirer', style: font(weight: FontWeight.w700, color: C.danger))),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await Api.instance.delete('/merchants/dishes/${d['id']}');
      _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final full = _max != null && _dishes.length >= _max!;
    return Scaffold(
      floatingActionButton: full
          ? null
          : FloatingActionButton.extended(
              onPressed: () => _open(),
              backgroundColor: C.ink,
              icon: const Icon(Ic.plus, color: Colors.white),
              label: Text('Ajouter un plat', style: font(weight: FontWeight.w700, color: Colors.white)),
            ),
      body: SafeArea(
        child: RefreshIndicator(
          color: C.brand,
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.fromLTRB(20, 14, 20, 100), children: [
            Text('Mon menu', style: h1()),
            const SizedBox(height: 4),
            Text('${_dishes.length} plat${_dishes.length > 1 ? 's' : ''}${_max != null ? ' sur $_max possibles avec ton abonnement' : ''}', style: small()),
            const SizedBox(height: 16),
            if (full) ...[const Notice("Tu as atteint la limite de plats de ton abonnement.", error: false), const SizedBox(height: 12)],
            if (_loading) const Padding(padding: EdgeInsets.only(top: 60), child: Center(child: CircularProgressIndicator(color: C.brand))),
            if (_error != null) Notice(_error!),
            if (!_loading && _dishes.isEmpty)
              const Padding(padding: EdgeInsets.only(top: 30), child: EmptyState(icon: Ic.utensils, title: 'Ton menu est vide', text: 'Ajoute tes plats avec une belle photo : ils apparaîtront dans le menu du jour de WAYI.')),
            for (final d in _dishes)
              InkWell(
                onTap: () => _open(d),
                borderRadius: BorderRadius.circular(R.md),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(children: [
                    Photo(d['image'] as String?, width: 76, height: 76, radius: R.sm),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(asStr(d['name']), style: h3(), maxLines: 2, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 3),
                      Text('${periodLabels[d['period']] ?? ''} · ${categoryLabels[d['category']] ?? ''}', style: small()),
                      const SizedBox(height: 4),
                      Text(fcfa(asNum(d['price'])), style: font(weight: FontWeight.w800, color: C.brandDark)),
                    ])),
                    IconButton(icon: const Icon(Ic.trash, size: 19, color: C.muted), onPressed: () => _delete(d)),
                  ]),
                ),
              ),
          ]),
        ),
      ),
    );
  }
}

/// Utilise pour les sections d'apercu
Dish dishFromMap(Map<String, dynamic> m) => Dish.fromJson(m);
