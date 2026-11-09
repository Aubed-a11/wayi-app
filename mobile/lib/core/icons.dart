import 'package:flutter/widgets.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Toutes les icones de l'appli (Lucide) au meme endroit.
class Ic {
  static const IconData home = LucideIcons.house;
  static const IconData search = LucideIcons.search;
  static const IconData yivi = LucideIcons.sparkles;
  static const IconData bag = LucideIcons.shoppingBag;
  static const IconData user = LucideIcons.user;
  static const IconData mail = LucideIcons.mail;
  static const IconData lock = LucideIcons.lock;
  static const IconData eye = LucideIcons.eye;
  static const IconData eyeOff = LucideIcons.eyeOff;
  static const IconData phone = LucideIcons.phone;
  static const IconData pin = LucideIcons.mapPin;
  static const IconData locate = LucideIcons.locateFixed;
  static const IconData store = LucideIcons.store;
  static const IconData bike = LucideIcons.bike;
  static const IconData utensils = LucideIcons.utensilsCrossed;
  static const IconData shield = LucideIcons.shieldCheck;
  static const IconData back = LucideIcons.arrowLeft;
  static const IconData next = LucideIcons.arrowRight;
  static const IconData chevron = LucideIcons.chevronRight;
  static const IconData plus = LucideIcons.plus;
  static const IconData minus = LucideIcons.minus;
  static const IconData trash = LucideIcons.trash2;
  static const IconData clock = LucideIcons.clock;
  static const IconData star = LucideIcons.star;
  static const IconData send = LucideIcons.send;
  static const IconData close = LucideIcons.x;
  static const IconData check = LucideIcons.check;
  static const IconData logout = LucideIcons.logOut;
  static const IconData receipt = LucideIcons.receipt;
  static const IconData navigation = LucideIcons.navigation;
  static const IconData wallet = LucideIcons.wallet;
  static const IconData hash = LucideIcons.hash;
  static const IconData alert = LucideIcons.circleAlert;
  static const IconData info = LucideIcons.info;
  static const IconData refresh = LucideIcons.refreshCw;
  static const IconData external = LucideIcons.externalLink;
  static const IconData sunrise = LucideIcons.sunrise;
  static const IconData sun = LucideIcons.sun;
  static const IconData cookie = LucideIcons.cookie;
  static const IconData moon = LucideIcons.moon;
  static const IconData grid = LucideIcons.layoutGrid;
  static const IconData flame = LucideIcons.flame;
  static const IconData leaf = LucideIcons.leaf;
  static const IconData soup = LucideIcons.soup;
  static const IconData drink = LucideIcons.cupSoda;
  static const IconData burger = LucideIcons.sandwich;
  static const IconData camera = LucideIcons.camera;
  static const IconData image = LucideIcons.image;
  static const IconData chart = LucideIcons.trendingUp;
}

IconData periodIcon(String? id) => switch (id) {
      'petit_dejeuner' => Ic.sunrise,
      'dejeuner' => Ic.sun,
      'gouter' => Ic.cookie,
      'diner' => Ic.moon,
      _ => Ic.grid,
    };

IconData categoryIcon(String? id) => switch (id) {
      'plats_locaux' => Ic.soup,
      'healthy' => Ic.leaf,
      'burgers' => Ic.burger,
      'grillades' => Ic.flame,
      'boissons' => Ic.drink,
      _ => Ic.utensils,
    };
