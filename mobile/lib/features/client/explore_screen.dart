import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/menu.dart';
import 'widgets.dart';

/// Recherche et filtres (creneau, categorie)
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final _q = TextEditingController();
  String _query = '';
  String? _period;
  String? _category;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  String _norm(String s) {
    const from = 'àâäéèêëîïôöùûüç';
    const to = 'aaaeeeeiioouuuc';
    var out = s.toLowerCase();
    for (var i = 0; i < from.length; i++) {
      out = out.replaceAll(from[i], to[i]);
    }
    return out;
  }

  List<Dish> _filter(List<Dish> all) {
    final q = _norm(_query.trim());
    return all.where((d) {
      if (_period != null && d.period != _period) return false;
      if (_category != null && d.category != _category) return false;
      if (q.isEmpty) return true;
      return _norm('${d.name} ${d.desc} ${d.restaurantName} ${d.composition.join(' ')}').contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final menu = context.watch<Menu>();
    final results = _filter(menu.dishes);
    return SafeArea(
      bottom: false,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Explorer', style: h1()),
            const SizedBox(height: 14),
            TextField(
              controller: _q,
              onChanged: (v) {
                _debounce?.cancel();
                _debounce = Timer(const Duration(milliseconds: 250), () => setState(() => _query = v));
              },
              style: font(size: 15, weight: FontWeight.w600),
              decoration: InputDecoration(
                hintText: 'Attiéké, poulet, Chez Maman...',
                hintStyle: font(size: 14.5, color: C.muted),
                prefixIcon: const Icon(Ic.search, size: 19, color: C.muted),
                suffixIcon: _query.isEmpty ? null : IconButton(icon: const Icon(Ic.close, size: 18, color: C.muted), onPressed: () { _q.clear(); setState(() => _query = ''); }),
                filled: true, fillColor: C.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(R.md), borderSide: BorderSide.none),
              ),
            ),
          ]),
        ),
        SizedBox(
          height: 44,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 20), children: [
            Padding(padding: const EdgeInsets.only(right: 8), child: Chip2(label: 'Toute la journée', selected: _period == null, onTap: () => setState(() => _period = null))),
            for (final p in menu.periods)
              Padding(padding: const EdgeInsets.only(right: 8), child: Chip2(label: p.label, icon: periodIcon(p.id), selected: _period == p.id, onTap: () => setState(() => _period = _period == p.id ? null : p.id))),
          ]),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 44,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 20), children: [
            for (final c in menu.categories)
              Padding(padding: const EdgeInsets.only(right: 8), child: Chip2(label: c.label, icon: categoryIcon(c.id), selected: _category == c.id, onTap: () => setState(() => _category = _category == c.id ? null : c.id))),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
          child: Text('${results.length} plat${results.length > 1 ? 's' : ''}', style: small()),
        ),
        Expanded(
          child: results.isEmpty
              ? const EmptyState(icon: Ic.search, title: 'Rien trouvé', text: "Essaie un autre mot ou enlève un filtre. Yivi peut aussi t'aider à choisir.")
              : GridView.builder(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 110),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 18, crossAxisSpacing: 14, childAspectRatio: 0.66),
                  itemCount: results.length,
                  itemBuilder: (_, i) {
                    final d = results[i];
                    return GestureDetector(
                      onTap: () => openDish(context, d),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Expanded(child: Stack(children: [
                          Positioned.fill(child: Photo(d.image, radius: R.md)),
                          Positioned(right: 8, bottom: 8, child: AddButton(dish: d)),
                        ])),
                        const SizedBox(height: 10),
                        Text(d.name, style: font(size: 14.5, weight: FontWeight.w700), maxLines: 2, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 3),
                        Text(d.restaurantName, style: small(), maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 5),
                        Text(fcfa(d.price), style: font(size: 14, weight: FontWeight.w800)),
                      ]),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}
