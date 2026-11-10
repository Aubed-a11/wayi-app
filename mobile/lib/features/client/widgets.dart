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

/// Carte verticale (carrousel)
class TallCard extends StatelessWidget {
  final Dish dish;
  final double width;
  const TallCard({super.key, required this.dish, this.width = 210});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => openDish(context, dish),
        child: SizedBox(
          width: width,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Stack(children: [
              AspectRatio(aspectRatio: 1, child: Photo(dish.image, radius: R.md)),
              Positioned(right: 10, bottom: 10, child: AddButton(dish: dish)),
            ]),
            const SizedBox(height: 10),
            Text(dish.name, style: h3(), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 3),
            Text(dish.restaurantName, style: small(), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 6),
            Text(fcfa(dish.price), style: font(size: 14, weight: FontWeight.w800)),
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
            Photo(dish.image, width: 96, height: 96, radius: R.md),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(dish.name, style: h3(), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text(dish.desc, style: small(), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 8),
                Row(children: [
                  Text(fcfa(dish.price), style: font(size: 14, weight: FontWeight.w800)),
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
  const AddButton({super.key, required this.dish});
  @override
  Widget build(BuildContext context) {
    final qty = context.select<Cart, int>((c) => c.qtyOf(dish.id));
    return Material(
      color: qty > 0 ? C.brand : C.ink,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () {
          context.read<Cart>().add(dish);
          toast(context, '${dish.name} ajouté au panier');
        },
        child: SizedBox(
          width: 38, height: 38,
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
      decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(999)),
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
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 26, 12, 12),
        child: Row(children: [
          Expanded(child: Text(title, style: h2())),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!, style: font(size: 13.5, weight: FontWeight.w700, color: C.brandDark))),
        ]),
      );
}
