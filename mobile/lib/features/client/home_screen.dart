import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/menu.dart';
import 'client_shell.dart';
import 'widgets.dart';

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

    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: C.brand,
        onRefresh: () => menu.load(force: true),
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(Ic.pin, size: 16, color: C.brandDark),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(def != null ? '${def['label'] ?? 'Livraison'} · ${def['address'] ?? ''}' : 'Cotonou, Abomey-Calavi',
                        style: font(size: 13, weight: FontWeight.w600, color: C.ink2), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ]),
                const SizedBox(height: 18),
                Text('${_hello()}${session.firstName.isNotEmpty ? ' ${session.firstName}' : ''},', style: font(size: 16, weight: FontWeight.w600, color: C.muted)),
                const SizedBox(height: 4),
                Text("Qu'est-ce qu'on mange aujourd'hui ?", style: h1()),
                const SizedBox(height: 18),
                GestureDetector(
                  onTap: () => ClientShell.goTab(context, 1),
                  child: Container(
                    height: 52,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(R.md)),
                    child: Row(children: [
                      const Icon(Ic.search, size: 19, color: C.muted),
                      const SizedBox(width: 12),
                      Text('Un plat, un restaurant...', style: font(size: 14.5, color: C.muted)),
                    ]),
                  ),
                ),
              ]),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 64,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                children: [
                  for (final p in menu.periods)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: Chip2(label: p.label, icon: periodIcon(p.id), selected: period == p.id, onTap: () => setState(() => _period = p.id)),
                    ),
                ],
              ),
            ),
          ),
          if (menu.loading && menu.dishes.isEmpty)
            const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator(color: C.brand)))
          else if (menu.error != null && menu.dishes.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: EmptyState(icon: Ic.alert, title: 'Menu indisponible', text: menu.error!, action: GhostButton(label: 'Réessayer', icon: Ic.refresh, onPressed: () => menu.load(force: true))),
            )
          else ...[
            if (featured != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                  child: FeatureCard(dish: featured, tag: period == menu.currentPeriod ? 'Servi maintenant' : menu.periodLabel(period)),
                ),
              ),
            if (list.length > 1) ...[
              SliverToBoxAdapter(child: SectionTitle(menu.periodLabel(period).isEmpty ? 'Au menu' : 'Au ${menu.periodLabel(period).toLowerCase()}', action: 'Tout voir', onAction: () => ClientShell.goTab(context, 1))),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 300,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    itemCount: list.length - 1,
                    separatorBuilder: (_, __) => const SizedBox(width: 14),
                    itemBuilder: (_, i) => TallCard(dish: list[i + 1]),
                  ),
                ),
              ),
            ],
            if (list.isEmpty)
              const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(20), child: Notice('Pas de plat sur ce créneau pour le moment.', error: false))),
            SliverToBoxAdapter(child: SectionTitle('Toute la journée')),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 110),
              sliver: SliverList.separated(
                itemCount: _others(menu, period).length,
                separatorBuilder: (_, __) => const Divider(),
                itemBuilder: (_, i) => DishRow(dish: _others(menu, period)[i]),
              ),
            ),
          ],
        ]),
      ),
    );
  }

  List<Dish> _others(Menu m, String? period) => m.dishes.where((d) => d.period != period).toList();
}
