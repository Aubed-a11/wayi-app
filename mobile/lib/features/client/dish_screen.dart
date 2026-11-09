import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/menu.dart';
import 'widgets.dart';

/// Fiche d'un plat : grande photo, composition, ajout au panier
class DishScreen extends StatefulWidget {
  final Dish dish;
  const DishScreen({super.key, required this.dish});
  @override
  State<DishScreen> createState() => _DishScreenState();
}

class _DishScreenState extends State<DishScreen> {
  int _qty = 1;

  @override
  Widget build(BuildContext context) {
    final d = widget.dish;
    final menu = context.read<Menu>();
    final sameResto = menu.dishes.where((x) => x.restaurantId == d.restaurantId && x.id != d.id).take(6).toList();
    final h = MediaQuery.of(context).size.height;
    return Scaffold(
      body: CustomScrollView(slivers: [
        SliverAppBar(
          expandedHeight: h * 0.44,
          pinned: true,
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          automaticallyImplyLeading: false,
          leading: Padding(padding: const EdgeInsets.all(6), child: RoundIcon(Ic.back, onTap: () => Navigator.of(context).pop())),
          flexibleSpace: FlexibleSpaceBar(background: Photo(d.image, radius: 0)),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(22, 22, 22, 140),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(d.name, style: h1()),
              const SizedBox(height: 10),
              Row(children: [
                const Icon(Ic.store, size: 15, color: C.muted),
                const SizedBox(width: 6),
                Flexible(child: Text(d.restaurantName, style: font(size: 14, weight: FontWeight.w600, color: C.ink2), overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 14),
                const Icon(Ic.clock, size: 15, color: C.muted),
                const SizedBox(width: 6),
                Text('${d.prepTime} min', style: font(size: 14, weight: FontWeight.w600, color: C.ink2)),
              ]),
              const SizedBox(height: 16),
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (d.tasteLabel.isNotEmpty) _Tag(d.tasteLabel),
                if (menu.periodLabel(d.period).isNotEmpty) _Tag(menu.periodLabel(d.period)),
                if (d.demo) const _Tag("Plat d'exemple"),
              ]),
              const SizedBox(height: 18),
              Text(fcfa(d.price), style: h2(C.brandDark)),
              if (d.desc.isNotEmpty) ...[const SizedBox(height: 16), Text(d.desc, style: body())],
              if (d.composition.isNotEmpty) ...[
                const SizedBox(height: 26),
                Text("Dans l'assiette", style: h3()),
                const SizedBox(height: 10),
                for (final c in d.composition) _Line(c),
              ],
              if (d.advantages.isNotEmpty) ...[
                const SizedBox(height: 22),
                Text('Pourquoi on l\'aime', style: h3()),
                const SizedBox(height: 10),
                for (final c in d.advantages) _Line(c),
              ],
              if (d.restaurantTagline != null && d.restaurantTagline!.isNotEmpty) ...[
                const SizedBox(height: 22),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(R.md)),
                  child: Row(children: [
                    Container(width: 44, height: 44, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)), child: const Icon(Ic.store, size: 20, color: C.brandDark)),
                    const SizedBox(width: 14),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(d.restaurantName, style: h3()),
                      Text(d.restaurantTagline!, style: small()),
                    ])),
                  ]),
                ),
              ],
              if (sameResto.isNotEmpty) ...[
                const SizedBox(height: 26),
                Text('Du même restaurant', style: h3()),
                const SizedBox(height: 12),
                SizedBox(
                  height: 270,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: sameResto.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 14),
                    itemBuilder: (_, i) => TallCard(dish: sameResto[i], width: 170),
                  ),
                ),
              ],
            ]),
          ),
        ),
      ]),
      bottomSheet: Container(
        padding: EdgeInsets.fromLTRB(20, 14, 20, MediaQuery.of(context).padding.bottom + 14),
        decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: C.line))),
        child: Row(children: [
          QtyStepper(qty: _qty, onChanged: (v) => setState(() => _qty = v.clamp(1, 50).toInt())),
          const SizedBox(width: 14),
          Expanded(
            child: PrimaryButton(
              label: 'Ajouter · ${fcfa(d.price * _qty)}',
              onPressed: () {
                context.read<Cart>().add(d, _qty);
                toast(context, '${d.name} ajouté au panier');
                Navigator.of(context).pop();
              },
            ),
          ),
        ]),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  final String text;
  const _Tag(this.text);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(999)),
        child: Text(text, style: font(size: 12.5, weight: FontWeight.w600, color: C.ink2)),
      );
}

class _Line extends StatelessWidget {
  final String text;
  const _Line(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(margin: const EdgeInsets.only(top: 8, right: 12), width: 6, height: 6, decoration: const BoxDecoration(color: C.brand, shape: BoxShape.circle)),
          Expanded(child: Text(text, style: body())),
        ]),
      );
}
