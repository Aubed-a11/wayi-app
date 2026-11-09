import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../espaces/account_sheet.dart';

/// Compte du restaurant : numeros d'encaissement Mobile Money, mot de passe, deconnexion
class AccountTab extends StatefulWidget {
  const AccountTab({super.key});
  @override
  State<AccountTab> createState() => _AccountTabState();
}

class _AccountTabState extends State<AccountTab> {
  final _mtn = TextEditingController();
  final _moov = TextEditingController();
  Map<String, dynamic>? _dash;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait([Api.instance.get('/merchants/payout'), Api.instance.get('/merchants/dashboard')]);
      _mtn.text = asStr(r[0]['momoMtn']);
      _moov.text = asStr(r[0]['momoMoov']);
      if (mounted) setState(() => _dash = r[1]);
    } catch (_) {}
  }

  Future<void> _savePayout() async {
    setState(() => _saving = true);
    try {
      final r = await Api.instance.put('/merchants/payout', {'momoMtn': _mtn.text.trim(), 'momoMoov': _moov.text.trim()});
      if (mounted) toast(context, asStr(r['message'], 'Enregistré'));
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final m = ((_dash?['merchant'] as Map?) ?? const {});
    final sub = ((m['subscriptionInfo'] as Map?) ?? const {});
    return SafeArea(
      child: ListView(padding: const EdgeInsets.fromLTRB(20, 14, 20, 30), children: [
        Text('Compte', style: h1()),
        const SizedBox(height: 18),
        Row(children: [
          Container(width: 58, height: 58, decoration: BoxDecoration(color: C.brandSoft, borderRadius: BorderRadius.circular(18)), child: const Icon(Ic.store, color: C.brandDark)),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(asStr(m['restaurantName'], s.name), style: h2()),
            Text('${s.name} · offre ${asStr(sub['label'], 'gratuite').toLowerCase()}', style: small()),
          ])),
        ]),
        const SizedBox(height: 28),
        Text('Où tes clients te paient', style: h3()),
        const SizedBox(height: 6),
        Text("Les numéros Mobile Money qui reçoivent l'argent des commandes. Tu confirmes ensuite la réception dans Commandes. Sans numéro, c'est WAYI qui encaisse.", style: small()),
        const SizedBox(height: 14),
        Field(label: 'Numéro MTN MoMo', icon: Ic.phone, controller: _mtn, hint: 'Ex : 01 42 43 63 87', keyboard: TextInputType.phone),
        const SizedBox(height: 12),
        Field(label: 'Numéro Moov Money', icon: Ic.phone, controller: _moov, hint: 'Ex : 01 94 80 55 22', keyboard: TextInputType.phone),
        const SizedBox(height: 14),
        PrimaryButton(label: 'Enregistrer mes numéros', loading: _saving, onPressed: _savePayout),
        const SizedBox(height: 28),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Ic.lock, color: C.ink2),
          title: Text('Changer mon mot de passe', style: font(size: 15, weight: FontWeight.w600)),
          trailing: const Icon(Ic.chevron, color: C.muted),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ChangePasswordScreen(path: '/merchants/me/password'))),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Ic.logout, color: C.danger),
          title: Text('Se déconnecter', style: font(size: 15, weight: FontWeight.w600, color: C.danger)),
          onTap: () => s.logout(),
        ),
        const SizedBox(height: 20),
        Center(child: Column(children: [const BeninStripe(width: 40), const SizedBox(height: 8), Text('WAYI Pro', style: small())])),
      ]),
    );
  }
}
