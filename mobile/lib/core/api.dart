import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'config.dart';

/// Erreur renvoyee par le serveur, avec un message lisible pour l'utilisateur
class ApiException implements Exception {
  final String message;
  final int status;
  final Map<String, dynamic> data;
  ApiException(this.message, this.status, [this.data = const {}]);
  @override
  String toString() => message;
}

/// Client HTTP unique de l'appli. Le jeton est ajoute automatiquement.
class Api {
  Api._();
  static final Api instance = Api._();

  String? token;
  /// Appele quand le serveur refuse le jeton (session expiree)
  void Function()? onUnauthorized;

  final http.Client _client = http.Client();

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$apiUrl/api$path').replace(queryParameters: (query == null || query.isEmpty) ? null : query);

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) =>
      _send(() => _client.get(_uri(path, query), headers: _headers));

  Future<Map<String, dynamic>> post(String path, [Object? body]) =>
      _send(() => _client.post(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  Future<Map<String, dynamic>> put(String path, [Object? body]) =>
      _send(() => _client.put(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  Future<Map<String, dynamic>> delete(String path) =>
      _send(() => _client.delete(_uri(path), headers: _headers));

  Future<Map<String, dynamic>> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request().timeout(const Duration(seconds: 45));
    } on TimeoutException {
      throw ApiException('Le serveur met trop de temps à répondre. Réessaie.', 0);
    } catch (_) {
      throw ApiException('Pas de connexion internet. Vérifie ton réseau.', 0);
    }
    Map<String, dynamic> data = {};
    if (res.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(utf8.decode(res.bodyBytes));
        if (decoded is Map<String, dynamic>) data = decoded;
      } catch (_) {}
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return data;
    if (res.statusCode == 401 && token != null) onUnauthorized?.call();
    throw ApiException((data['error'] ?? 'Une erreur est survenue (${res.statusCode}).').toString(), res.statusCode, data);
  }
}
