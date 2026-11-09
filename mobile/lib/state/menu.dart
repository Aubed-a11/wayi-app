import 'package:flutter/foundation.dart';
import '../core/api.dart';
import '../core/format.dart';
import '../models/models.dart';

class Period {
  final String id, label, hours;
  Period(this.id, this.label, this.hours);
}

class MenuCategory {
  final String id, label;
  MenuCategory(this.id, this.label);
}

/// Menu du jour, charge depuis le serveur
class Menu extends ChangeNotifier {
  List<Dish> dishes = [];
  List<Period> periods = [];
  List<MenuCategory> categories = [];
  String? currentPeriod;
  bool loading = false;
  String? error;
  DateTime? _loadedAt;

  Future<void> load({bool force = false}) async {
    if (loading) return;
    if (!force && _loadedAt != null && DateTime.now().difference(_loadedAt!) < const Duration(minutes: 3)) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      final d = await Api.instance.get('/menu');
      dishes = (d['dishes'] as List? ?? []).map((e) => Dish.fromJson((e as Map).cast<String, dynamic>())).toList();
      periods = (d['periods'] as List? ?? []).map((e) {
        final m = (e as Map).cast<String, dynamic>();
        return Period(asStr(m['id']), asStr(m['label']), asStr(m['hours']));
      }).toList();
      categories = (d['categories'] as List? ?? []).map((e) {
        final m = (e as Map).cast<String, dynamic>();
        return MenuCategory(asStr(m['id']), asStr(m['label']));
      }).toList();
      currentPeriod = d['currentPeriod'] as String?;
      _loadedAt = DateTime.now();
    } on ApiException catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Dish? byId(String id) {
    for (final d in dishes) {
      if (d.id == id) return d;
    }
    return null;
  }

  List<Dish> forPeriod(String? p) => p == null ? dishes : dishes.where((d) => d.period == p).toList();

  String periodLabel(String? id) {
    for (final p in periods) {
      if (p.id == id) return p.label;
    }
    return '';
  }
}
