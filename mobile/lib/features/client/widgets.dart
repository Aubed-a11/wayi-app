import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import 'dish_screen.dart';

void openDish(BuildContext context, Dish d) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => DishScreen(dish: d)));

/// Grande carte photo (mise en avant)
class FeatureCard extends StatelessWidget {
  final Dish dish;
  final String tag;
  const FeatureCard({super.key, required this.dish, this.tag = 'Plat du moment'});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => openDish(context, dish),
        child: AspectRatio(
          aspectRatio: 4 / 3.4,
          child: Stack(children: [
            Positioned.fill(child: Photo(dish.image, radius: R.lg)),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(R.lg),
                  gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black.withValues(alpha: 0), Colors.black.withValues(alpha: 0.72)], stops: const [0.4, 1]),
                ),
              ),
            ),
            Positioned(
              left: 16, top: 16,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                child: Text(tag, style: font(size: 12, weight: FontWeight.w700)),
              ),
            ),
            Positioned(
              left: 18, right: 18, bottom: 18,
              child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(dish.name, style: h2(Colors.white), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 6),
                    Text('${dish.restaurantName}  ·  ${dish.prepTime} min', style: font(size: 13, color: Colors.white70)),
                  ]),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                  child: Text(fcfa(dish.price), style: font(size: 13.5, weight: FontWeight.w800)),
                ),
              ]),
            ),
          ]),
        ),
      );
}

/// Carte verticale (carrousel) : carte blanche, photo en haut
class TallCard extends StatelessWidget {
  final Dish dish;
  final double width;
  const TallCard({super.key, required this.dish, this.width = 176});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => openDish(context, dish),
        child: Container(
          width: width,
          decoration: cardBox(radius: R.lg),
          clipBehavior: Clip.antiAlias,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Stack(children: [
              AspectRatio(aspectRatio: 1.1, child: Photo(dish.image, radius: 0)),
              Positioned(
                left: 8, top: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Ic.clock, size: 12, color: C.ink2),
                    const SizedBox(width: 4),
                    Text('${dish.prepTime} min', style: font(size: 11, weight: FontWeight.w700, color: C.ink2)),
                  ]),
                ),
              ),
            ]),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 10, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(dish.name, style: font(size: 14.5, weight: FontWeight.w700), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Text(dish.restaurantName, style: small(), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: Text(fcfa(dish.price), style: font(size: 14, weight: FontWeight.w800, color: C.brandDark))),
                  AddButton(dish: dish, size: 32),
                ]),
              ]),
            ),
          ]),
        ),
      );
}

/// Ligne de liste (photo carree + infos)
class DishRow extends StatelessWidget {
  final Dish dish;
  const DishRow({super.key, required this.dish});
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: () => openDish(context, dish),
        borderRadius: BorderRadius.circular(R.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(children: [
            Photo(dish.image, width: 84, height: 84, radius: 14),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(dish.name, style: h3(), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text(dish.desc, style: small(), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 8),
                Row(children: [
                  Text(fcfa(dish.price), style: font(size: 14, weight: FontWeight.w800, color: C.brandDark)),
                  const SizedBox(width: 10),
                  const Icon(Ic.clock, size: 13, color: C.muted),
                  const SizedBox(width: 4),
                  Text('${dish.prepTime} min', style: small()),
                ]),
              ]),
            ),
            const SizedBox(width: 8),
            AddButton(dish: dish),
          ]),
        ),
      );
}

/// Petit bouton + (ajout au panier), affiche la quantite si deja dans le panier
class AddButton extends StatelessWidget {
  final Dish dish;
  final double size;
  const AddButton({super.key, required this.dish, this.size = 36});
  @override
  Widget build(BuildContext context) {
    final qty = context.select<Cart, int>((c) => c.qtyOf(dish.id));
    return Material(
      color: qty > 0 ? C.ink : C.brand,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () {
          context.read<Cart>().add(dish);
          toast(context, '${dish.name} ajouté au panier');
        },
        child: SizedBox(
          width: size, height: size,
          child: Center(child: qty > 0 ? Text('$qty', style: font(size: 14, weight: FontWeight.w800, color: Colors.white)) : const Icon(Ic.plus, size: 18, color: Colors.white)),
        ),
      ),
    );
  }
}

/// Selecteur de quantite
class QtyStepper extends StatelessWidget {
  final int qty;
  final ValueChanged<int> onChanged;
  final bool compact;
  const QtyStepper({super.key, required this.qty, required this.onChanged, this.compact = false});
  @override
  Widget build(BuildContext context) {
    final s = compact ? 32.0 : 44.0;
    Widget btn(IconData i, int v) => InkWell(
          customBorder: const CircleBorder(),
          onTap: () => onChanged(v),
          child: SizedBox(width: s, height: s, child: Icon(i, size: compact ? 15 : 18, color: C.ink)),
        );
    return Container(
      decoration: BoxDecoration(color: C.card, borderRadius: BorderRadius.circular(999), border: Border.all(color: C.line)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        btn(qty <= 1 && compact ? Ic.trash : Ic.minus, qty - 1),
        SizedBox(width: compact ? 22 : 30, child: Text('$qty', textAlign: TextAlign.center, style: font(size: compact ? 14 : 16, weight: FontWeight.w800))),
        btn(Ic.plus, qty + 1),
      ]),
    );
  }
}

/// Titre de section
class SectionTitle extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  const SectionTitle(this.title, {super.key, this.action, this.onAction});
  /// Version a placer directement dans un CustomScrollView
  Widget get sliver => SliverToBoxAdapter(child: this);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 10, 10),
        child: Row(children: [
          Expanded(child: Text(title, style: font(size: 18, weight: FontWeight.w800, spacing: -0.2))),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!, style: font(size: 13.5, weight: FontWeight.w700, color: C.brandDark))),
        ]),
      );
}
