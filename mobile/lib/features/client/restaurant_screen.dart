import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/menu.dart';
import 'cart_screen.dart';
import 'widgets.dart';

/// Rubriques de la carte d'un restaurant
class _Section {
  final String id, title, sub;
  const _Section(this.id, this.title, this.sub);
}

const _sections = [
  _Section('plats_locaux', 'Spécialités africaines', 'Les recettes de chez nous, mijotées comme à la maison'),
  _Section('grillades', 'Grillades et braises', 'Cuit au feu, servi bien chaud'),
  _Section('healthy', 'Salades et fraîcheur', 'Léger et plein de saveurs'),
  _Section('burgers', 'Fast-food', 'Burgers, chawarmas et pizzas'),
  _Section('douceurs', 'Douceurs et boissons', 'Pour finir en beauté'),
];

String _sectionOf(Dish d) => (d.taste == 'sucre' || d.category == 'boissons') ? 'douceurs' : (d.category.isEmpty ? 'plats_locaux' : d.category);

/// Separe la description et la liste d'accompagnements
(String, String?) _splitDesc(String desc) {
  final i = desc.indexOf('Accompagnement au choix');
  if (i < 0) return (desc.trim(), null);
  return (desc.substring(0, i).trim(), desc.substring(i));
}

void openRestaurant(BuildContext context, {required String id, required String name, String? logo, String? tagline}) =>
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => RestaurantScreen(id: id, name: name, logo: logo, tagline: tagline)));

/// Carte d'un restaurant : couverture, incontournables, menu range par rubriques
class RestaurantScreen extends StatefulWidget {
  final String id, name;
  final String? logo, tagline;
  const RestaurantScreen({super.key, required this.id, required this.name, this.logo, this.tagline});
  @override
  State<RestaurantScreen> createState() => _RestaurantScreenState();
}

class _RestaurantScreenState extends State<RestaurantScreen> {
  final _keys = <String, GlobalKey>{};
  String? _tab;

  void _goTo(String id) {
    setState(() => _tab = id);
    final ctx = _keys[id]?.currentContext;
    if (ctx != null) Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 450), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final menu = context.watch<Menu>();
    final cart = context.watch<Cart>();
    final dishes = menu.dishes.where((d) => d.restaurantId == widget.id).toList();
    final groups = <_Section, List<Dish>>{};
    for (final s in _sections) {
      final items = dishes.where((d) => _sectionOf(d) == s.id).toList();
      if (items.isNotEmpty) groups[s] = items;
    }
    // Les incontournables : le plat le plus copieux de chaque rubrique salee
    final stars = <Dish>[];
    for (final s in _sections.where((s) => s.id != 'douceurs')) {
      final items = [...?groups[s]]..sort((a, b) => b.price.compareTo(a.price));
      if (items.isNotEmpty) stars.add(items.first);
    }
    for (final d in ([...dishes.where((d) => _sectionOf(d) != 'douceurs')]..sort((a, b) => b.price.compareTo(a.price)))) {
      if (stars.length >= 3) break;
      if (!stars.contains(d)) stars.add(d);
    }
    final shownStars = stars.take(3).toList();
    final cover = shownStars.isNotEmpty ? shownStars.first.image : null;
    final prep = dishes.isNotEmpty ? dishes.first.prepTime : '25-35';
    final tagline = widget.tagline ?? (dishes.isNotEmpty ? dishes.first.restaurantTagline : null);
    final mine = cart.items.where((i) => i.restaurantId == widget.id);
    final count = mine.fold<int>(0, (s, i) => s + i.qty);
    final total = mine.fold<num>(0, (s, i) => s + i.price * i.qty);

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(children: [
        CustomScrollView(slivers: [
          SliverToBoxAdapter(
            child: Stack(clipBehavior: Clip.none, children: [
              SizedBox(height: 250, width: double.infinity, child: Photo(cover, radius: 0)),
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [Colors.black.withValues(alpha: 0.28), Colors.black.withValues(alpha: 0), Colors.black.withValues(alpha: 0.35)],
                      stops: const [0, 0.4, 1],
                    ),
                  ),
                ),
              ),
              Positioned(left: 14, top: MediaQuery.of(context).padding.top + 10, child: const RetourBtn()),
            ]),
          ),
          SliverToBoxAdapter(
            child: Transform.translate(
              offset: const Offset(0, -36),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(18, 50, 18, 18),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: const Color(0xFFEEF0F3)),
                      boxShadow: softShadow,
                    ),
                    child: Column(children: [
                      Text(widget.name, textAlign: TextAlign.center, style: h2()),
                      if (tagline != null && tagline.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(tagline, textAlign: TextAlign.center, style: small(C.ink2)),
                      ],
                      const SizedBox(height: 14),
                      Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
                        _MetaChip(Ic.clock, '$prep min'),
                        const _MetaChip(Ic.bike, '75 F / km'),
                        _MetaChip(Ic.utensils, '${dishes.length} plats'),
                      ]),
                    ]),
                  ),
                  Positioned(
                    top: -40,
                    child: Container(
                      decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 4), boxShadow: softShadow),
                      child: RestoLogo(url: widget.logo, name: widget.name, size: 78),
                    ),
                  ),
                ]),
              ),
            ),
          ),
          if (menu.loading && dishes.isEmpty)
            const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())))
          else if (dishes.isEmpty)
            SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.all(30), child: Text('Pas de plat disponible pour le moment.', textAlign: TextAlign.center, style: body(C.muted)))),
          if (shownStars.isNotEmpty) ...[
            SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 12), child: Text('Les incontournables', style: h2()))),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 250,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: shownStars.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => _StarCard(dish: shownStars[i], signature: i == 0),
                ),
              ),
            ),
          ],
          if (groups.length > 1)
            SliverPersistentHeader(
              pinned: true,
              delegate: _TabsHeader(
                sections: groups.entries.map((e) => (e.key.id, e.key.title, e.value.length)).toList(),
                selected: _tab ?? groups.keys.first.id,
                onTap: _goTo,
              ),
            ),
          for (final e in groups.entries)
            SliverToBoxAdapter(
              child: Padding(
                key: _keys.putIfAbsent(e.key.id, () => GlobalKey()),
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(e.key.title, style: h2()),
                  const SizedBox(height: 4),
                  Text(e.key.sub, style: small()),
                  for (var i = 0; i < e.value.length; i++) ...[
                    _DishLine(dish: e.value[i]),
                    if (i < e.value.length - 1) const Divider(height: 1, color: Color(0xFFF1F2F4)),
                  ],
                ]),
              ),
            ),
          SliverToBoxAdapter(child: SizedBox(height: count > 0 ? 120 : 40)),
        ]),
        if (count > 0)
          Positioned(
            left: 16, right: 16, bottom: MediaQuery.of(context).padding.bottom + 16,
            child: GestureDetector(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CartScreen())),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  gradient: buttonGradient,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [BoxShadow(color: C.brandDark.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 10))],
                ),
                child: Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(999)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Ic.bag, size: 16, color: Colors.white),
                      const SizedBox(width: 6),
                      Text('$count', style: font(size: 13, weight: FontWeight.w800, color: Colors.white)),
                    ]),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Text('Voir mon panier', style: font(size: 15, weight: FontWeight.w800, color: Colors.white))),
                  Text(fcfa(total), style: font(size: 15, weight: FontWeight.w800, color: Colors.white)),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

class _MetaChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MetaChip(this.icon, this.label);
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: const Color(0xFFFFF4EB), borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: C.brandDark),
          const SizedBox(width: 6),
          Text(label, style: font(size: 12.5, weight: FontWeight.w700, color: C.brandDark)),
        ]),
      );
}

/// Bouton + (ou - 2 +) pour ajouter un plat sans quitter la carte
class _AddButton extends StatelessWidget {
  final Dish dish;
  const _AddButton({required this.dish});
  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    final q = cart.qtyOf(dish.id);
    if (q == 0) {
      return GestureDetector(
        onTap: () => context.read<Cart>().add(dish),
        child: Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            gradient: buttonGradient, shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [BoxShadow(color: C.brandDark.withValues(alpha: 0.35), blurRadius: 12, offset: const Offset(0, 5))],
          ),
          child: const Icon(Ic.plus, size: 18, color: Colors.white),
        ),
      );
    }
    Widget btn(IconData i, VoidCallback f) => GestureDetector(
          onTap: f,
          child: Container(width: 30, height: 30, decoration: const BoxDecoration(color: C.brandSoft, shape: BoxShape.circle), child: Icon(i, size: 15, color: C.brandDark)),
        );
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999), boxShadow: softShadow),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        btn(Ic.minus, () => context.read<Cart>().setQty(dish.id, q - 1)),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('$q', style: font(size: 14, weight: FontWeight.w800))),
        btn(Ic.plus, () => context.read<Cart>().add(dish)),
      ]),
    );
  }
}

class _StarCard extends StatelessWidget {
  final Dish dish;
  final bool signature;
  const _StarCard({required this.dish, required this.signature});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => openDish(context, dish),
        child: SizedBox(
          width: 210,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(
              height: 170,
              child: Stack(children: [
                Positioned.fill(child: Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(20), boxShadow: softShadow), child: Photo(dish.image, radius: 20))),
                Positioned(
                  left: 10, top: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.95), borderRadius: BorderRadius.circular(999)),
                    child: Text(signature ? 'Le plat signature' : 'Très demandé', style: font(size: 11.5, weight: FontWeight.w800, color: C.brandDark)),
                  ),
                ),
                Positioned(right: 10, bottom: 10, child: _AddButton(dish: dish)),
              ]),
            ),
            const SizedBox(height: 10),
            Text(dish.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: font(size: 15, weight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(fcfa(dish.price), style: font(size: 14.5, weight: FontWeight.w800, color: C.brand)),
          ]),
        ),
      );
}

class _DishLine extends StatelessWidget {
  final Dish dish;
  const _DishLine({required this.dish});
  @override
  Widget build(BuildContext context) {
    final (text, side) = _splitDesc(dish.desc);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => openDish(context, dish),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(dish.name, style: font(size: 15.5, weight: FontWeight.w800)),
              if (text.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: small(C.ink2)),
              ],
              if (side != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: const Color(0xFFE9F7EF), borderRadius: BorderRadius.circular(999)),
                  child: Text('Accompagnement au choix', style: font(size: 11.5, weight: FontWeight.w700, color: const Color(0xFF1E7D4B))),
                ),
              ],
              const SizedBox(height: 8),
              Text(fcfa(dish.price), style: font(size: 14.5, weight: FontWeight.w800, color: C.brand)),
            ]),
          ),
          const SizedBox(width: 14),
          SizedBox(
            width: 118, height: 118,
            child: Stack(clipBehavior: Clip.none, children: [
              Positioned.fill(child: Container(decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), boxShadow: softShadow), child: Photo(dish.image, radius: 18))),
              Positioned(right: -6, bottom: -6, child: _AddButton(dish: dish)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Onglets des rubriques, colles en haut pendant le defilement
class _TabsHeader extends SliverPersistentHeaderDelegate {
  final List<(String, String, int)> sections;
  final String selected;
  final void Function(String) onTap;
  _TabsHeader({required this.sections, required this.selected, required this.onTap});

  @override
  double get minExtent => 64;
  @override
  double get maxExtent => 64;
  @override
  bool shouldRebuild(covariant _TabsHeader old) => old.selected != selected || old.sections.length != sections.length;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => Container(
        color: Colors.white,
        alignment: Alignment.center,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          itemCount: sections.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final (id, title, n) = sections[i];
            final on = id == selected;
            return GestureDetector(
              onTap: () => onTap(id),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: on ? buttonGradient : null,
                  color: on ? null : Colors.white,
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: on ? Colors.transparent : const Color(0xFFEEF0F3)),
                ),
                child: Text('$title  $n', style: font(size: 13, weight: FontWeight.w700, color: on ? Colors.white : C.ink)),
              ),
            );
          },
        ),
      );
}
