import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../state/menu.dart';
import 'widgets.dart';

/// Carrousel "Nos restaurants favoris de la semaine" : classement mis a jour chaque lundi.
class TopRestaurants extends StatefulWidget {
  const TopRestaurants({super.key});
  @override
  State<TopRestaurants> createState() => _TopRestaurantsState();
}

class _TopRestaurantsState extends State<TopRestaurants> {
  final _page = PageController(viewportFraction: 0.86);
  List<Map<String, dynamic>> _list = [];
  Timer? _auto;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Api.instance.get('/menu/top-restaurants', query: {'limit': '8'});
      final list = ((r['restaurants'] as List?) ?? const []).whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
      if (!mounted) return;
      setState(() => _list = list);
      _auto?.cancel();
      if (list.length > 1) {
        _auto = Timer.periodic(const Duration(seconds: 4), (_) {
          if (!_page.hasClients) return;
          final next = (_index + 1) % _list.length;
          _page.animateToPage(next, duration: const Duration(milliseconds: 550), curve: Curves.easeOutCubic);
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _auto?.cancel();
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_list.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SectionTitle('Nos restaurants favoris de la semaine'),
      SizedBox(
        height: 206,
        child: PageView.builder(
          controller: _page,
          padEnds: false,
          itemCount: _list.length,
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (_, i) => Padding(
            padding: EdgeInsets.only(left: i == 0 ? 16 : 6, right: 6, bottom: 8),
            child: _Card(data: _list[i], rank: i + 1),
          ),
        ),
      ),
      const SizedBox(height: 4),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        for (var i = 0; i < _list.length; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 250),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: i == _index ? 18 : 6, height: 6,
            decoration: BoxDecoration(color: i == _index ? C.brand : C.line, borderRadius: BorderRadius.circular(6)),
          ),
      ]),
    ]);
  }
}

class _Card extends StatelessWidget {
  final Map<String, dynamic> data;
  final int rank;
  const _Card({required this.data, required this.rank});

  @override
  Widget build(BuildContext context) {
    final r = (data['restaurant'] as Map?)?.cast<String, dynamic>() ?? const {};
    final top = (data['topDish'] as Map?)?.cast<String, dynamic>() ?? const {};
    final sold = asNum(data['dishesSold']).toInt();
    final name = asStr(r['name'], 'Restaurant');
    final rating = asNum(r['rating']);
    final badge = sold > 0 ? '$sold plat${sold > 1 ? 's' : ''} vendu${sold > 1 ? 's' : ''}' : (rank <= 3 ? 'Coup de cœur' : 'À découvrir');
    return GestureDetector(
      onTap: () => _openRestaurant(context, asStr(r['id']), name, r['logo'] as String?, asStr(r['tagline'])),
      child: Container(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(R.lg), boxShadow: softShadow),
        clipBehavior: Clip.antiAlias,
        child: Stack(fit: StackFit.expand, children: [
          Photo(top['image'] as String?, radius: 0),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0x10000000), Color(0x33000000), Color(0xD98E2318)], stops: [0, 0.45, 1]),
            ),
          ),
          Positioned(
            left: 12, top: 12,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(gradient: buttonGradient, borderRadius: BorderRadius.circular(999)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Ic.flame, size: 13, color: Colors.white),
                const SizedBox(width: 4),
                Text('#$rank · $badge', style: font(size: 11.5, weight: FontWeight.w800, color: Colors.white)),
              ]),
            ),
          ),
          if (rating > 0)
            Positioned(
              right: 12, top: 12,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Ic.star, size: 12, color: C.brand),
                  const SizedBox(width: 3),
                  Text(rating.toStringAsFixed(1), style: font(size: 12, weight: FontWeight.w800)),
                ]),
              ),
            ),
          Positioned(
            left: 14, right: 14, bottom: 14,
            child: Row(children: [
              RestoLogo(url: r['logo'] as String?, name: name, size: 46),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: h3(Colors.white)),
                  const SizedBox(height: 2),
                  Text(
                    top['name'] != null ? '${sold > 0 ? 'Le plus commandé' : 'Spécialité'} : ${top['name']}' : asStr(r['tagline']),
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: font(size: 12.5, weight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9)),
                  ),
                ]),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Les plats d'un restaurant, dans une feuille qui monte du bas
void _openRestaurant(BuildContext context, String id, String name, String? logo, String tagline) {
  final dishes = context.read<Menu>().dishes.where((d) => d.restaurantId == id).toList();
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (c) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.92,
      builder: (_, scroll) => ListView(controller: scroll, padding: const EdgeInsets.fromLTRB(20, 0, 20, 30), children: [
        Row(children: [
          RestoLogo(url: logo, name: name, size: 54),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: h2()),
            if (tagline.isNotEmpty) Text(tagline, style: small()),
          ])),
        ]),
        const SizedBox(height: 18),
        if (dishes.isEmpty) Text('Pas de plat disponible pour le moment.', style: body(C.muted)),
        for (var i = 0; i < dishes.length; i++) ...[
          if (i > 0) const Divider(),
          DishRow(dish: dishes[i]),
        ],
      ]),
    ),
  );
}
