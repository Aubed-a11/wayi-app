import 'package:flutter/material.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import 'account_tab.dart';
import 'menu_tab.dart';
import 'orders_tab.dart';
import 'stats_tab.dart';

/// Espace restaurant : commandes, menu, chiffres, compte
class MerchantShell extends StatefulWidget {
  const MerchantShell({super.key});
  @override
  State<MerchantShell> createState() => _MerchantShellState();
}

class _MerchantShellState extends State<MerchantShell> {
  int _tab = 0;
  static const _items = [(Ic.receipt, 'Commandes'), (Ic.utensils, 'Mon menu'), (Ic.chart, 'Chiffres'), (Ic.store, 'Compte')];

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: _tab == 0,
        onPopInvokedWithResult: (didPop, _) { if (!didPop) setState(() => _tab = 0); },
        child: Scaffold(
          body: IndexedStack(index: _tab, children: const [OrdersTab(), MenuTab(), StatsTab(), AccountTab()]),
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
                        onTap: () => setState(() => _tab = i),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(_items[i].$1, size: 22, color: _tab == i ? C.ink : C.muted),
                          const SizedBox(height: 4),
                          Text(_items[i].$2, style: font(size: 11, weight: _tab == i ? FontWeight.w700 : FontWeight.w500, color: _tab == i ? C.ink : C.muted)),
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
