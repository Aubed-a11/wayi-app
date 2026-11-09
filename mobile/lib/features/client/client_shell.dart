import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../state/cart.dart';
import '../../state/menu.dart';
import 'cart_screen.dart';
import 'explore_screen.dart';
import 'home_screen.dart';
import 'orders_screen.dart';
import 'profile_screen.dart';
import 'yivi_screen.dart';

/// Espace client : 5 onglets + barre panier flottante
class ClientShell extends StatefulWidget {
  const ClientShell({super.key});
  static void goTab(BuildContext context, int i) => context.findAncestorStateOfType<_ClientShellState>()?.go(i);
  @override
  State<ClientShell> createState() => _ClientShellState();
}

class _ClientShellState extends State<ClientShell> {
  int _tab = 0;
  void go(int i) => setState(() => _tab = i);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<Menu>().load());
  }

  static const _items = [
    (Ic.home, 'Accueil'),
    (Ic.search, 'Explorer'),
    (Ic.yivi, 'Yivi'),
    (Ic.receipt, 'Commandes'),
    (Ic.user, 'Profil'),
  ];

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<Cart>();
    return PopScope(
      canPop: _tab == 0,
      onPopInvokedWithResult: (didPop, _) { if (!didPop) go(0); },
      child: Scaffold(
        body: Stack(children: [
          IndexedStack(index: _tab, children: const [HomeScreen(), ExploreScreen(), YiviScreen(), OrdersScreen(), ProfileScreen()]),
          if (!cart.isEmpty && _tab != 2)
            Positioned(
              left: 16, right: 16, bottom: 12,
              child: Material(
                color: C.ink,
                borderRadius: BorderRadius.circular(R.md),
                elevation: 6,
                shadowColor: Colors.black38,
                child: InkWell(
                  borderRadius: BorderRadius.circular(R.md),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CartScreen())),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
                    child: Row(children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(color: C.brand, borderRadius: BorderRadius.circular(999)),
                        child: Text('${cart.count}', style: font(size: 13, weight: FontWeight.w800, color: Colors.white)),
                      ),
                      const SizedBox(width: 12),
                      Text('Voir le panier', style: font(size: 15, weight: FontWeight.w700, color: Colors.white)),
                      const Spacer(),
                      Text(fcfa(cart.subtotal), style: font(size: 15, weight: FontWeight.w800, color: Colors.white)),
                    ]),
                  ),
                ),
              ),
            ),
        ]),
        bottomNavigationBar: Container(
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: C.line))),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: 64,
              child: Row(children: [
                for (var i = 0; i < _items.length; i++)
                  Expanded(
                    child: InkWell(
                      onTap: () => go(i),
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        if (i == 2)
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(color: _tab == 2 ? C.ink : C.brandSoft, shape: BoxShape.circle),
                            child: Icon(_items[i].$1, size: 20, color: _tab == 2 ? Colors.white : C.brandDark),
                          )
                        else ...[
                          Icon(_items[i].$1, size: 22, color: _tab == i ? C.ink : C.muted),
                          const SizedBox(height: 4),
                          Text(_items[i].$2, style: font(size: 11, weight: _tab == i ? FontWeight.w700 : FontWeight.w500, color: _tab == i ? C.ink : C.muted)),
                        ],
                      ]),
                    ),
                  ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
