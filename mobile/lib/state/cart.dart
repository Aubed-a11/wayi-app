import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/models.dart';

/// Panier, garde sur le telephone entre deux ouvertures de l'appli
class Cart extends ChangeNotifier {
  static const _key = 'wayi.cart';
  final List<CartItem> items = [];

  int get count => items.fold(0, (s, i) => s + i.qty);
  num get subtotal => items.fold<num>(0, (s, i) => s + i.price * i.qty);
  int get restaurantCount => items.map((i) => i.restaurantId).toSet().length;
  bool get isEmpty => items.isEmpty;
  int qtyOf(String id) => items.where((i) => i.id == id).fold(0, (s, i) => s + i.qty);

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_key);
    if (raw == null) return;
    try {
      items
        ..clear()
        ..addAll((jsonDecode(raw) as List).map((e) => CartItem.fromJson((e as Map).cast<String, dynamic>())));
      notifyListeners();
    } catch (_) {}
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_key, jsonEncode(items.map((e) => e.toJson()).toList()));
  }

  void add(Dish d, [int qty = 1]) {
    final i = items.indexWhere((e) => e.id == d.id);
    if (i >= 0) {
      items[i].qty = (items[i].qty + qty).clamp(1, 50).toInt();
    } else {
      items.add(CartItem.fromDish(d, qty));
    }
    _changed();
  }

  void setQty(String id, int qty) {
    final i = items.indexWhere((e) => e.id == id);
    if (i < 0) return;
    if (qty <= 0) {
      items.removeAt(i);
    } else {
      items[i].qty = qty.clamp(1, 50).toInt();
    }
    _changed();
  }

  /// Remplace le panier (quand Yivi l'a modifie)
  void replaceWith(List<CartItem> next) {
    items
      ..clear()
      ..addAll(next);
    _changed();
  }

  void clear() {
    items.clear();
    _changed();
  }

  List<Map<String, dynamic>> toOrderItems() => items.map((i) => {'dishId': i.id, 'qty': i.qty}).toList();

  void _changed() {
    notifyListeners();
    _save();
  }
}
