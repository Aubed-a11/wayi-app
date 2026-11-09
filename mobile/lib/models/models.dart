import '../core/format.dart';

/// Plat du menu
class Dish {
  final String id;
  final String name;
  final String desc;
  final num price;
  final String? image;
  final String period;
  final String category;
  final String taste;
  final String restaurantId;
  final String restaurantName;
  final String? restaurantTagline;
  final String prepTime;
  final List<String> composition;
  final List<String> advantages;
  final bool demo;
  final bool popular;

  Dish({
    required this.id, required this.name, required this.desc, required this.price, this.image,
    required this.period, required this.category, required this.taste,
    required this.restaurantId, required this.restaurantName, this.restaurantTagline,
    required this.prepTime, this.composition = const [], this.advantages = const [],
    this.demo = false, this.popular = false,
  });

  static List<String> _lines(dynamic v) => asStr(v).split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();

  factory Dish.fromJson(Map<String, dynamic> j) {
    final r = (j['restaurant'] as Map?)?.cast<String, dynamic>() ?? const {};
    return Dish(
      id: asStr(j['id']),
      name: asStr(j['name']),
      desc: asStr(j['desc'] ?? j['description']),
      price: asNum(j['price']),
      image: j['image'] as String?,
      period: asStr(j['period']),
      category: asStr(j['category']),
      taste: asStr(j['taste']),
      restaurantId: asStr(j['restaurantId']),
      restaurantName: asStr(r['name'] ?? j['restaurantName'], 'Restaurant'),
      restaurantTagline: r['tagline'] as String?,
      prepTime: asStr(r['prepTime'], '20-30'),
      composition: _lines(j['characteristics']),
      advantages: _lines(j['advantages']),
      demo: j['demo'] == true,
      popular: j['isPopular'] == true,
    );
  }

  static const tasteLabels = {'sale': 'Salé', 'sucre': 'Sucré', 'epice': 'Épicé', 'umami': 'Gourmand', 'frais': 'Frais', 'doux': 'Doux'};
  String get tasteLabel => tasteLabels[taste] ?? '';
}

/// Article du panier
class CartItem {
  final String id;
  final String name;
  final num price;
  final String? image;
  final String restaurantId;
  final String restaurantName;
  int qty;
  CartItem({required this.id, required this.name, required this.price, this.image, required this.restaurantId, required this.restaurantName, this.qty = 1});

  factory CartItem.fromDish(Dish d, [int qty = 1]) =>
      CartItem(id: d.id, name: d.name, price: d.price, image: d.image, restaurantId: d.restaurantId, restaurantName: d.restaurantName, qty: qty);

  factory CartItem.fromJson(Map<String, dynamic> j) => CartItem(
        id: asStr(j['id']), name: asStr(j['name']), price: asNum(j['price']), image: j['image'] as String?,
        restaurantId: asStr(j['restaurantId']), restaurantName: asStr(j['restaurantName'], 'Restaurant'), qty: asNum(j['qty'], 1).toInt(),
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'price': price, 'image': image, 'restaurantId': restaurantId, 'restaurantName': restaurantName, 'qty': qty};
}

/// Statuts de commande, en clair
const orderStatusLabels = {
  'pending': 'En attente du restaurant',
  'confirmed': 'Confirmée',
  'preparing': 'En préparation',
  'ready': 'Prête',
  'on_the_way': 'En route',
  'delivered': 'Livrée',
  'cancelled': 'Annulée',
  'rejected': 'Refusée',
};

const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'on_the_way'];
