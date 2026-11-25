import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import '../../state/menu.dart';
import 'checkout_screen.dart';
import 'widgets.dart';

/// Panier : en-tete degrade, plats regroupes par restaurant, recapitulatif clair.
class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    final groups = <String, List<CartItem>>{};
    for (final i in cart.items) {
      groups.putIfAbsent(i.restaurantName, () => []).add(i);
    }
    final count = cart.items.fold<int>(0, (n, i) => n + i.qty);
    final top = MediaQuery.of(context).padding.top;

    final header = Container(
      padding: EdgeInsets.fromLTRB(20, top + 12, 16, 56),
      decoration: const BoxDecoration(gradient: brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(30))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          _Pill(label: 'Retour', onTap: () => Navigator.of(context).pop()),
          const Spacer(),
          if (!cart.isEmpty) _Pill(label: 'Vider', icon: Ic.trash, onTap: () => _confirmClear(context, cart), light: true),
        ]),
        const SizedBox(height: 18),
        Text('Mon panier', style: h1(Colors.white)),
        const SizedBox(height: 4),
        Text(cart.isEmpty ? 'Il est encore vide.' : '$count plat${count > 1 ? 's' : ''} · ${cart.restaurantCount} restaurant${cart.restaurantCount > 1 ? 's' : ''}',
            style: font(size: 14, weight: FontWeight.w600, color: Colors.white.withValues(alpha: 0.9))),
      ]),
    );

    return Scaffold(
      body: Stack(children: [
        ListView(padding: EdgeInsets.zero, children: [
          header,
          Transform.translate(
            offset: const Offset(0, -34),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: cart.isEmpty ? const _EmptyCart() : _Filled(groups: groups, cart: cart),
            ),
          ),
          SizedBox(height: cart.isEmpty ? 20 : 170),
        ]),
        if (!cart.isEmpty)
          Positioned(
            left: 0, right: 0, bottom: 0,
            child: Container(
              padding: EdgeInsets.fromLTRB(20, 14, 20, MediaQuery.of(context).padding.bottom + 14),
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                boxShadow: [BoxShadow(color: Color(0x1415181F), blurRadius: 20, offset: Offset(0, -4))],
              ),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Row(children: [
                  Text('Sous-total', style: body(C.muted)),
                  const Spacer(),
                  Text(fcfa(cart.subtotal), style: h3()),
                ]),
                const SizedBox(height: 2),
                Align(alignment: Alignment.centerLeft, child: Text("Livraison et réduction calculées à l'étape suivante", style: small())),
                const SizedBox(height: 12),
                PrimaryButton(label: 'Passer la commande', onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CheckoutScreen()))),
              ]),
            ),
          ),
      ]),
    );
  }

  Future<void> _confirmClear(BuildContext context, Cart cart) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Vider le panier ?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Vider', style: TextStyle(color: C.danger))),
        ],
      ),
    );
    if (ok == true) cart.clear();
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback onTap;
  final bool light;
  const _Pill({required this.label, required this.onTap, this.icon, this.light = false});
  @override
  Widget build(BuildContext context) => Material(
        color: light ? Colors.white.withValues(alpha: 0.2) : Colors.white,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (icon != null) ...[Icon(icon, size: 15, color: light ? Colors.white : C.brandDark), const SizedBox(width: 6)],
              Text(label, style: font(size: 13.5, weight: FontWeight.w700, color: light ? Colors.white : C.brandDark)),
            ]),
          ),
        ),
      );
}

class _Filled extends StatelessWidget {
  final Map<String, List<CartItem>> groups;
  final Cart cart;
  const _Filled({required this.groups, required this.cart});

  @override
  Widget build(BuildContext context) {
    final menu = context.watch<Menu>();
    String? logoOf(String restaurantId) {
      for (final d in menu.dishes) {
        if (d.restaurantId == restaurantId && d.restaurantLogo != null) return d.restaurantLogo;
      }
      return null;
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (cart.restaurantCount > 1)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          decoration: BoxDecoration(color: C.brandSoft, borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            const Icon(Ic.bike, size: 16, color: C.brandDark),
            const SizedBox(width: 8),
            Expanded(child: Text('${cart.restaurantCount} restaurants : ${cart.restaurantCount} livraisons séparées, chacune avec son livreur.', style: font(size: 13, weight: FontWeight.w600, color: C.brandDark))),
          ]),
        ),
      for (final g in groups.entries)
        Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
          decoration: cardBox(radius: 22),
          child: Column(children: [
            Row(children: [
              RestoLogo(url: logoOf(g.value.first.restaurantId), name: g.key, size: 38),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(g.key, style: font(size: 15, weight: FontWeight.w700)),
                Text('${g.value.fold<int>(0, (n, i) => n + i.qty)} plat(s)', style: small()),
              ])),
            ]),
            const Padding(padding: EdgeInsets.only(top: 12), child: Divider()),
            for (var k = 0; k < g.value.length; k++) ...[
              if (k > 0) const Divider(),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(children: [
                  Photo(g.value[k].image, width: 72, height: 72, radius: 16),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(g.value[k].name, style: font(size: 14.5, weight: FontWeight.w700, height: 1.25), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text("${fcfa(g.value[k].price)} l'unité", style: small()),
                    const SizedBox(height: 4),
                    Text(fcfa(g.value[k].price * g.value[k].qty), style: font(size: 15, weight: FontWeight.w800, color: C.brandDark)),
                  ])),
                  QtyStepper(qty: g.value[k].qty, compact: true, onChanged: (v) => cart.setQty(g.value[k].id, v)),
                ]),
              ),
            ],
          ]),
        ),
      OutlinedButton.icon(
        onPressed: () => Navigator.of(context).pop(),
        icon: const Icon(Ic.plus, size: 16, color: C.brand),
        label: Text("Ajouter d'autres plats", style: font(size: 14, weight: FontWeight.w700, color: C.brand)),
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          side: const BorderSide(color: C.brand, width: 1.5),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      const SizedBox(height: 14),
      Wrap(spacing: 8, runSpacing: 8, children: const [
        _Perk(icon: Ic.bike, label: 'Livraison au kilomètre'),
        _Perk(icon: Ic.shield, label: 'Restaurants vérifiés'),
      ]),
    ]);
  }
}

class _Perk extends StatelessWidget {
  final IconData icon;
  final String label;
  const _Perk({required this.icon, required this.label});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(999)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: C.brand),
          const SizedBox(width: 6),
          Text(label, style: font(size: 12.5, weight: FontWeight.w600, color: C.ink2)),
        ]),
      );
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();
  @override
  Widget build(BuildContext context) {
    final ideas = context.watch<Menu>().dishes.where((d) => d.image != null).take(4).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.fromLTRB(20, 26, 20, 20),
        decoration: cardBox(radius: 24),
        child: Column(children: [
          Container(
            width: 82, height: 82,
            decoration: BoxDecoration(gradient: brandGradient, shape: BoxShape.circle, boxShadow: [BoxShadow(color: C.brandDark.withValues(alpha: 0.3), blurRadius: 20, offset: const Offset(0, 8))]),
            child: const Icon(Ic.bag, size: 34, color: Colors.white),
          ),
          const SizedBox(height: 14),
          Text('Ton panier attend ses premiers plats', style: h3(), textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text("Choisis dans le menu du jour, ou laisse Yivi te proposer le plat qu'il te faut.", style: body(C.muted), textAlign: TextAlign.center),
          const SizedBox(height: 18),
          PrimaryButton(label: 'Voir le menu du jour', onPressed: () => Navigator.of(context).pop()),
        ]),
      ),
      if (ideas.isNotEmpty) ...[
        const SizedBox(height: 22),
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 10), child: Text("Envie d'une idée ?", style: font(size: 18, weight: FontWeight.w800))),
        SizedBox(
          height: 262,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: ideas.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => TallCard(dish: ideas[i]),
          ),
        ),
      ],
    ]);
  }
}
