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

/// Degrade sombre pose sur les photos pour lire le texte
BoxDecoration _shade(double r) => BoxDecoration(
      borderRadius: BorderRadius.circular(r),
      gradient: LinearGradient(
        begin: Alignment.topCenter, end: Alignment.bottomCenter,
        colors: [Colors.black.withValues(alpha: 0), const Color(0xFF140802).withValues(alpha: 0.55), const Color(0xFF140802).withValues(alpha: 0.9)],
        stops: const [0.3, 0.62, 1],
      ),
    );

Widget _chip(String t, {bool small = false}) => Container(
      padding: EdgeInsets.symmetric(horizontal: small ? 9 : 12, vertical: small ? 4 : 6),
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.94), borderRadius: BorderRadius.circular(999)),
      child: Text(t, style: font(size: small ? 10.5 : 12, weight: FontWeight.w700)),
    );

Widget _price(Dish d, {bool small = false}) => Container(
      padding: EdgeInsets.symmetric(horizontal: small ? 10 : 14, vertical: small ? 5 : 8),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
      child: Text(fcfa(d.price), style: font(size: small ? 12.5 : 15, weight: FontWeight.w800, color: C.brandDark)),
    );

/// Fond des plats sans photo : couleurs WAYI et grande icone en filigrane
const _noPhoto = [
  [Color(0xFFFF9A3C), Color(0xFFF2690D), Color(0xFFA8321F)],
  [Color(0xFF3B2A6B), Color(0xFF5B3FA0), Color(0xFF2A1C4E)],
  [Color(0xFF1F7A55), Color(0xFF16935F), Color(0xFF0E4D36)],
];
Widget _cover(Dish d, double r, {int tone = 0, double icon = 90, bool tile = false}) {
  if (d.image != null && d.image!.isNotEmpty) return Photo(d.image, radius: r);
  return Container(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(r),
      gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: _noPhoto[tone % _noPhoto.length]),
    ),
    alignment: tile ? const Alignment(0.9, -0.2) : Alignment.topRight,
    padding: tile ? EdgeInsets.zero : const EdgeInsets.fromLTRB(0, 18, 16, 0),
    child: Icon(Ic.utensils, size: icon, color: Colors.white.withValues(alpha: 0.22)),
  );
}

List<BoxShadow> get _lift => [BoxShadow(color: const Color(0xFF3C1905).withValues(alpha: 0.18), blurRadius: 30, offset: const Offset(0, 14))];

/// Grande carte photo (plat vedette de la carte de la semaine)
class FeatureCard extends StatelessWidget {
  final Dish dish;
  final String tag;
  const FeatureCard({super.key, required this.dish, this.tag = 'Le plat du moment'});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => openDish(context, dish),
        child: Container(
          height: 310,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(26), boxShadow: _lift),
          child: Stack(children: [
            Positioned.fill(child: _cover(dish, 26, icon: 120)),
            Positioned.fill(child: DecoratedBox(decoration: _shade(26))),
            Positioned(left: 14, top: 14, child: _chip(tag)),
            Positioned(
              left: 18, right: 18, bottom: 16,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(dish.name, style: font(size: 24, weight: FontWeight.w800, color: Colors.white, height: 1.12, spacing: -0.3), maxLines: 2, overflow: TextOverflow.ellipsis),
                if (dish.desc.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(dish.desc, style: font(size: 13, weight: FontWeight.w500, color: Colors.white.withValues(alpha: 0.86), height: 1.4), maxLines: 2, overflow: TextOverflow.ellipsis),
                ],
                const SizedBox(height: 12),
                Row(children: [
                  _price(dish),
                  const SizedBox(width: 12),
                  Icon(Ic.clock, size: 14, color: Colors.white.withValues(alpha: 0.9)),
                  const SizedBox(width: 5),
                  Text('${dish.prepTime} min', style: font(size: 12.5, weight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9))),
                  const Spacer(),
                  AddButton(dish: dish, size: 50),
                ]),
              ]),
            ),
          ]),
        ),
      );
}

/// Plat en photo pleine carte (nom et prix poses sur la photo)
class PhotoTile extends StatelessWidget {
  final Dish dish;
  final String? tag;
  final double height;
  final bool wide;
  final int tone;
  const PhotoTile({super.key, required this.dish, this.tag, this.height = 220, this.wide = false, this.tone = 0});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => openDish(context, dish),
        child: Container(
          height: height,
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(22), boxShadow: _lift),
          child: Stack(children: [
            Positioned.fill(child: _cover(dish, 22, tone: tone, icon: 70, tile: true)),
            Positioned.fill(child: DecoratedBox(decoration: _shade(22))),
            if (tag != null && tag!.isNotEmpty) Positioned(left: 10, top: 10, child: _chip(tag!, small: true)),
            Positioned(right: 10, top: 10, child: AddButton(dish: dish, size: 38)),
            Positioned(
              left: 12, right: 12, bottom: 12,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(dish.name, style: font(size: wide ? 19 : 15.5, weight: FontWeight.w700, color: Colors.white, height: 1.2), maxLines: 2, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 8),
                _price(dish, small: true),
              ]),
            ),
          ]),
        ),
      );
}

/// Carte de la semaine : plat vedette puis les autres en photos, deux par ligne
class WeekMenu extends StatelessWidget {
  final List<Dish> dishes;
  final String heroTag;
  final String Function(String? period) tagOf;
  const WeekMenu({super.key, required this.dishes, required this.heroTag, required this.tagOf});
  @override
  Widget build(BuildContext context) {
    if (dishes.isEmpty) return const SizedBox.shrink();
    final rest = dishes.skip(1).toList();
    final rows = <Widget>[];
    for (var i = 0; i < rest.length; i += 2) {
      final last = i + 1 >= rest.length;
      rows.add(Padding(
        padding: const EdgeInsets.only(top: 12),
        child: last
            ? PhotoTile(dish: rest[i], tag: tagOf(rest[i].period), height: 190, wide: true, tone: i + 1)
            : Row(children: [
                Expanded(child: PhotoTile(dish: rest[i], tag: tagOf(rest[i].period), tone: i + 1)),
                const SizedBox(width: 12),
                Expanded(child: PhotoTile(dish: rest[i + 1], tag: tagOf(rest[i + 1].period), tone: i + 2)),
              ]),
      ));
    }
    return Column(children: [FeatureCard(dish: dishes.first, tag: heroTag), ...rows]);
  }
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
            SizedBox(
              width: 84, height: 84,
              child: Stack(children: [
                Positioned.fill(child: Photo(dish.image, radius: 14)),
              ]),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(dish.name, style: h3(), maxLines: 2, overflow: TextOverflow.ellipsis),
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
