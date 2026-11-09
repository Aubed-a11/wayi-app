import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'push.dart';

/// Les espaces de l'appli
enum Role { client, merchant, driver, admin }

Role? roleFrom(String? s) => switch (s) {
      'client' => Role.client,
      'merchant' => Role.merchant,
      'driver' => Role.driver,
      'admin' => Role.admin,
      _ => null,
    };

String roleLabel(Role r) => switch (r) {
      Role.client => 'Client',
      Role.merchant => 'Restaurant',
      Role.driver => 'Livreur',
      Role.admin => 'Administration',
    };

/// Un compte retrouve a la connexion (les memes identifiants peuvent ouvrir plusieurs espaces)
class Account {
  final Role role;
  final String token;
  final String name;
  final Map<String, dynamic>? user;
  final bool pendingApproval;
  Account({required this.role, required this.token, required this.name, this.user, this.pendingApproval = false});
}

/// Session : qui est connecte et dans quel espace
class Session extends ChangeNotifier {
  static const _kToken = 'wayi.token';
  static const _kRole = 'wayi.role';
  static const _kName = 'wayi.name';

  bool ready = false;
  Role? role;
  String? token;
  String name = '';
  Map<String, dynamic>? user;

  bool get signedIn => token != null && role != null;

  /// Appele a la deconnexion (ex : vider le panier du compte precedent)
  VoidCallback? onLoggedOut;
  bool _loggingOut = false;
  String get firstName => name.split(' ').first;

  Future<void> restore() async {
    final p = await SharedPreferences.getInstance();
    token = p.getString(_kToken);
    role = roleFrom(p.getString(_kRole));
    name = p.getString(_kName) ?? '';
    Api.instance.token = token;
    Api.instance.onUnauthorized = () => logout();
    if (signedIn && role == Role.client) {
      try {
        user = await Api.instance.get('/auth/me');
        name = (user?['name'] ?? name).toString();
      } on ApiException catch (e) {
        if (e.status == 401) await logout(notify: false);
      }
    }
    ready = true;
    notifyListeners();
    if (signedIn) Push.register();
  }

  Future<void> open(Account a) async {
    token = a.token;
    role = a.role;
    name = a.name;
    user = a.user;
    Api.instance.token = token;
    final p = await SharedPreferences.getInstance();
    await p.setString(_kToken, a.token);
    await p.setString(_kRole, a.role.name);
    await p.setString(_kName, a.name);
    notifyListeners();
    Push.register();
  }

  Future<void> logout({bool notify = true}) async {
    if (_loggingOut || (token == null && role == null)) return;
    _loggingOut = true;
    await Push.unregister();
    onLoggedOut?.call();
    token = null;
    role = null;
    user = null;
    name = '';
    Api.instance.token = null;
    final p = await SharedPreferences.getInstance();
    await p.remove(_kToken);
    await p.remove(_kRole);
    await p.remove(_kName);
    await p.remove('wayi.cart');
    _loggingOut = false;
    if (notify) notifyListeners();
  }

  Future<void> refreshUser() async {
    if (role != Role.client) return;
    user = await Api.instance.get('/auth/me');
    notifyListeners();
  }

  /// Connexion unique : renvoie les espaces trouves pour ces identifiants
  static Future<List<Account>> login(String email, String password) async {
    final data = await Api.instance.post('/auth/login-any', {'email': email.trim(), 'password': password});
    final list = (data['accounts'] as List? ?? []).cast<Map>();
    return list
        .map((m) => m.cast<String, dynamic>())
        .where((m) => roleFrom(m['role'] as String?) != null)
        .map((m) => Account(
              role: roleFrom(m['role'] as String?)!,
              token: m['token'].toString(),
              name: (m['name'] ?? '').toString(),
              user: (m['user'] as Map?)?.cast<String, dynamic>(),
              pendingApproval: m['pendingApproval'] == true,
            ))
        .toList();
  }

  /// Inscription, etape 1 : envoi du code par e-mail. Renvoie le code si l'e-mail n'a pas pu partir.
  static Future<Map<String, dynamic>> registerStart(Role role, Map<String, dynamic> form) {
    switch (role) {
      case Role.merchant:
        return Api.instance.post('/merchants/register/start', {
          'restaurantName': form['restaurantName'], 'contactName': form['name'], 'email': form['email'],
          'password': form['password'], 'phone': form['phone'], 'zone': form['zone'],
        });
      case Role.driver:
        return Api.instance.post('/drivers/register/start', {
          'name': form['name'], 'email': form['email'], 'password': form['password'], 'phone': form['phone'],
          'zone': form['zone'], 'vehicleType': form['vehicleType'], 'vehiclePlate': form['vehiclePlate'],
        });
      default:
        return Api.instance.post('/auth/register/start', {'name': form['name'], 'email': form['email'], 'password': form['password']});
    }
  }

  static String _base(Role role) => role == Role.merchant ? '/merchants' : role == Role.driver ? '/drivers' : '/auth';

  static Future<Map<String, dynamic>> registerResend(Role role, String email) =>
      Api.instance.post('${_base(role)}/register/resend', {'email': email.trim()});

  /// Inscription, etape 2 : verification du code, le compte est cree
  static Future<Account> registerVerify(Role role, String email, String code) async {
    final data = await Api.instance.post('${_base(role)}/register/verify', {'email': email.trim(), 'code': code});
    final profile = (data['user'] ?? data['merchant'] ?? data['driver']) as Map?;
    return Account(
      role: role,
      token: data['token'].toString(),
      name: (profile?['name'] ?? '').toString(),
      user: role == Role.client ? profile?.cast<String, dynamic>() : null,
      pendingApproval: profile?['pendingApproval'] == true,
    );
  }

  static String prettyJson(Object o) => const JsonEncoder.withIndent('  ').convert(o);
}
