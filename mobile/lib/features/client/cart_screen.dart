import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import 'checkout_screen.dart';
import 'widgets.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    final groups = <String, List<CartItem>>{};
    for (final i in cart.items) {
      groups.putIfAbsent(i.restaurantName, () => []).add(i);
    }
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Ic.back), onPressed: () => Navigator.of(context).pop()),
        title: Text('Mon panier', style: h3()),
        actions: [
          if (!cart.isEmpty)
            TextButton(onPressed: () => cart.clear(), child: Text('Vider', style: font(size: 13.5, weight: FontWeight.w700, color: C.danger))),
        ],
      ),
      body: cart.isEmpty
          ? EmptyState(icon: Ic.bag, title: 'Ton panier est vide', text: "Ajoute un plat du menu du jour, ou demande à Yivi de t'en proposer.",
              action: GhostButton(label: 'Voir le menu', onPressed: () => Navigator.of(context).pop()))
          : ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 160), children: [
              for (final g in groups.entries) ...[
                Padding(
                  padding: const EdgeInsets.only(top: 14, bottom: 6),
                  child: Row(children: [
                    const Icon(Ic.store, size: 16, color: C.brandDark),
                    const SizedBox(width: 8),
                    Text(g.key, style: h3()),
                  ]),
                ),
                for (final i in g.value)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(children: [
                      Photo(i.image, width: 70, height: 70, radius: R.sm),
                      const SizedBox(width: 14),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(i.name, style: font(size: 15, weight: FontWeight.w700), maxLines: 2, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 4),
                        Text(fcfa(i.price * i.qty), style: font(size: 14, weight: FontWeight.w800, color: C.brandDark)),
                      ])),
                      QtyStepper(qty: i.qty, compact: true, onChanged: (v) => cart.setQty(i.id, v)),
                    ]),
                  ),
                const Divider(),
              ],
              if (cart.restaurantCount > 1) ...[
                const SizedBox(height: 14),
                Notice('Ton panier vient de ${cart.restaurantCount} restaurants : il y aura ${cart.restaurantCount} livraisons, donc ${cart.restaurantCount} frais de livraison.', error: false),
              ],
            ]),
      bottomSheet: cart.isEmpty
          ? null
          : Container(
              padding: EdgeInsets.fromLTRB(20, 16, 20, MediaQuery.of(context).padding.bottom + 14),
              decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: C.line))),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Row(children: [
                  Text('Sous-total', style: body(C.muted)),
                  const Spacer(),
                  Text(fcfa(cart.subtotal), style: h3()),
                ]),
                const SizedBox(height: 4),
                Align(alignment: Alignment.centerLeft, child: Text('Frais de livraison calculés à l\'étape suivante', style: small())),
                const SizedBox(height: 14),
                PrimaryButton(label: 'Choisir la livraison', icon: Ic.next, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CheckoutScreen()))),
              ]),
            ),
    );
  }
}
