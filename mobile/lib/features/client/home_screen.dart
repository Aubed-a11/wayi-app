import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/menu.dart';
import 'client_shell.dart';
import 'top_restaurants.dart';
import 'widgets.dart';

/// Couleurs des tuiles de service (icone, fond)
const _tiles = <String, (Color, Color)>{
  'petit_dejeuner': (Color(0xFFE59A00), Color(0xFFFFF4D9)),
  'dejeuner': (C.brand, C.brandSoft),
  'gouter': (Color(0xFFD9467A), Color(0xFFFDEBF2)),
  'diner': (Color(0xFF5B55D6), Color(0xFFEDECFD)),
};

String _short(String label) => switch (label) {
      'Petit-déjeuner' => 'Petit-déj',
      _ => label,
    };

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String? _period;

  String _hello() {
    final h = DateTime.now().toUtc().add(const Duration(hours: 1)).hour; // heure du Benin
    return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  }

  @override
  Widget build(BuildContext context) {
    final menu = context.watch<Menu>();
    final session = context.watch<Session>();
    final period = _period ?? menu.currentPeriod;
    final list = menu.forPeriod(period);
    final featured = list.isNotEmpty ? list.first : (menu.dishes.isNotEmpty ? menu.dishes.first : null);
    final addresses = (session.user?['addresses'] as List?) ?? const [];
    Map? def;
    for (final a in addresses) {
      if (a is Map && a['isDefault'] == true) def = a;
    }
    def ??= addresses.isNotEmpty && addresses.first is Map ? addresses.first as Map : null;
    final others = _others(menu, period);

    return RefreshIndicator(
      color: C.brand,
      onRefresh: () => menu.load(force: true),
      child: CustomScrollView(slivers: [
        SliverToBoxAdapter(child: _Header(hello: _hello(), name: session.firstName, address: def)),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: CardBox(
              padding: const EdgeInsets.fromLTRB(12, 16, 12, 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(padding: const EdgeInsets.only(left: 6, bottom: 14), child: Text('Nos services', style: h3())),
                Row(children: [
                  for (final p in menu.periods.take(4))
                    Expanded(
                      child: ServiceTile(
                        icon: periodIcon(p.id),
                        label: _short(p.label),
                        color: (_tiles[p.id] ?? (C.brand, C.brandSoft)).$1,
                        tint: (_tiles[p.id] ?? (C.brand, C.brandSoft)).$2,
                        selected: period == p.id,
                        onTap: () => setState(() => _period = p.id),
                      ),
                    ),
                ]),
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(child: ServiceTile(icon: Ic.grid, label: 'Tout le menu', color: const Color(0xFF2F7BE5), tint: const Color(0xFFE8F1FD), onTap: () => ClientShell.goTab(context, 1))),
                  Expanded(child: ServiceTile(icon: Ic.yivi, label: 'Yivi', color: const Color(0xFF8B4FD8), tint: const Color(0xFFF3ECFC), onTap: () => ClientShell.goTab(context, 2))),
                  Expanded(child: ServiceTile(icon: Ic.receipt, label: 'Commandes', color: C.success, tint: C.successSoft, onTap: () => ClientShell.goTab(context, 3))),
                  Expanded(child: ServiceTile(icon: Ic.user, label: 'Mon compte', color: C.ink2, tint: C.surface, onTap: () => ClientShell.goTab(context, 4))),
                ]),
              ]),
            ),
          ),
        ),
        const SliverToBoxAdapter(child: TopRestaurants()),
        if (menu.loading && menu.dishes.isEmpty)
          const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator(color: C.brand))))
        else if (menu.error != null && menu.dishes.isEmpty)
          SliverToBoxAdapter(
            child: EmptyState(icon: Ic.alert, title: 'Menu indisponible', text: menu.error!, action: GhostButton(label: 'Réessayer', icon: Ic.refresh, onPressed: () => menu.load(force: true))),
          )
        else ...[
          if (featured != null) ...[
            SectionTitle(period == menu.currentPeriod ? 'Servi maintenant' : (menu.periodLabel(period).isEmpty ? 'À la une' : 'Au ${menu.periodLabel(period).toLowerCase()}')).sliver,
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: FeatureCard(dish: featured, tag: menu.periodLabel(period).isEmpty ? 'À la une' : menu.periodLabel(period)),
              ),
            ),
          ],
          if (list.length > 1) ...[
            SectionTitle('Aussi au menu', action: 'Tout voir', onAction: () => ClientShell.goTab(context, 1)).sliver,
            SliverToBoxAdapter(
              child: SizedBox(
                height: 262,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  clipBehavior: Clip.none,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  itemCount: list.length - 1,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => TallCard(dish: list[i + 1]),
                ),
              ),
            ),
          ],
          if (list.isEmpty)
            const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.fromLTRB(16, 16, 16, 0), child: Notice('Pas de plat sur ce créneau pour le moment.', error: false))),
          if (others.isNotEmpty) ...[
            const SectionTitle('Toute la journée').sliver,
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: CardBox(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                  child: Column(children: [
                    for (var i = 0; i < others.length; i++) ...[
                      if (i > 0) const Divider(),
                      DishRow(dish: others[i]),
                    ],
                  ]),
                ),
              ),
            ),
          ],
          const SliverToBoxAdapter(child: SizedBox(height: 110)),
        ],
      ]),
    );
  }

  List<Dish> _others(Menu m, String? period) => m.dishes.where((d) => d.period != period).toList();
}

/// Bandeau orange en haut : adresse, salutation, recherche
class _Header extends StatelessWidget {
  final String hello;
  final String name;
  final Map? address;
  const _Header({required this.hello, required this.name, required this.address});

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    final where = address != null ? '${address!['address'] ?? address!['label'] ?? ''}' : 'Cotonou, Abomey-Calavi';
    return Container(
      padding: EdgeInsets.fromLTRB(20, top + 14, 20, 22),
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFF8A2B), C.brand, Color(0xFFB8402A)]),
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: GestureDetector(
              onTap: () => ClientShell.goTab(context, 4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Livrer à', style: font(size: 12, weight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.8))),
                const SizedBox(height: 2),
                Row(children: [
                  const Icon(Ic.pin, size: 15, color: Colors.white),
                  const SizedBox(width: 5),
                  Flexible(child: Text(where, maxLines: 1, overflow: TextOverflow.ellipsis, style: font(size: 14.5, weight: FontWeight.w700, color: Colors.white))),
                  const SizedBox(width: 2),
                  const Icon(Ic.chevronDown, size: 17, color: Colors.white),
                ]),
              ]),
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: () => ClientShell.goTab(context, 4),
            child: Container(
              width: 42, height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.35))),
              child: name.isNotEmpty
                  ? Text(name.substring(0, 1).toUpperCase(), style: font(size: 16, weight: FontWeight.w800, color: Colors.white))
                  : const Icon(Ic.user, size: 19, color: Colors.white),
            ),
          ),
        ]),
        const SizedBox(height: 20),
        Text('$hello${name.isNotEmpty ? ' $name' : ''}', style: font(size: 15, weight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9))),
        const SizedBox(height: 4),
        Text("Qu'est-ce qu'on mange ?", style: h1(Colors.white)),
        const SizedBox(height: 18),
        GestureDetector(
          onTap: () => ClientShell.goTab(context, 1),
          child: Container(
            height: 50,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), boxShadow: const [BoxShadow(color: Color(0x22000000), blurRadius: 14, offset: Offset(0, 5))]),
            child: Row(children: [
              const Icon(Ic.search, size: 19, color: C.brand),
              const SizedBox(width: 12),
              Text('Un plat, un restaurant...', style: font(size: 14.5, color: C.muted)),
            ]),
          ),
        ),
      ]),
    );
  }
}
