import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/api.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

/// Fenetre de paiement securisee Kkiapay (MTN MoMo, Moov, carte).
/// Renvoie true si le paiement est confirme par le serveur.
class KkiapayScreen extends StatefulWidget {
  final String orderId;
  final num amount;
  final String phone;
  final String method;
  final String publicKey;
  final bool sandbox;
  const KkiapayScreen({super.key, required this.orderId, required this.amount, required this.phone, required this.method, required this.publicKey, required this.sandbox});
  @override
  State<KkiapayScreen> createState() => _KkiapayScreenState();
}

class _KkiapayScreenState extends State<KkiapayScreen> {
  late final WebViewController _web;
  bool _verifying = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final phone = widget.phone.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^229'), '');
    final options = jsonEncode({
      'key': widget.publicKey,
      'amount': widget.amount.round(),
      'sandbox': widget.sandbox,
      'phone': phone,
      'partnerId': widget.orderId,
      'paymentmethod': widget.method == 'card' ? 'card' : 'momo',
      'countries': ['BJ'],
      'theme': '#D9824E',
      'position': 'center',
    });
    final html = '''<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font-family:sans-serif;background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;color:#8C837D}</style></head>
<body><p>Ouverture du paiement sécurisé...</p>
<script src="https://cdn.kkiapay.me/k.js"></script>
<script>
  function ready(){
    if (typeof openKkiapayWidget !== 'function') { return setTimeout(ready, 200); }
    addSuccessListener(function(r){ Wayi.postMessage(JSON.stringify({ok:true, id:(r && (r.transactionId||r.transaction_id))||''})); });
    addKkiapayCloseListener(function(){ Wayi.postMessage(JSON.stringify({ok:false})); });
    openKkiapayWidget($options);
  }
  ready();
</script></body></html>''';
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel('Wayi', onMessageReceived: (msg) => _onMessage(msg.message))
      ..loadHtmlString(html, baseUrl: 'https://wayibenin.com');
  }

  Future<void> _onMessage(String raw) async {
    Map data = {};
    try { data = jsonDecode(raw) as Map; } catch (_) {}
    if (data['ok'] != true) {
      if (mounted && !_verifying) Navigator.of(context).pop(false);
      return;
    }
    setState(() { _verifying = true; _error = null; });
    try {
      await Api.instance.post('/payments/verify', {'transactionId': data['id'], 'orderId': widget.orderId, 'provider': 'kkiapay'});
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() { _verifying = false; _error = e.message; });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(icon: const Icon(Ic.close), onPressed: () => Navigator.of(context).pop(false)),
          title: Text('Paiement sécurisé', style: h3()),
        ),
        body: Stack(children: [
          WebViewWidget(controller: _web),
          if (_verifying) Container(color: Colors.white70, alignment: Alignment.center, child: const CircularProgressIndicator(color: C.brand)),
          if (_error != null) Positioned(left: 16, right: 16, bottom: 24, child: Notice(_error!)),
        ]),
      );
}
