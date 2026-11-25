import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../espaces/account_sheet.dart';
import '../espaces/delete_account.dart';

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
  bool _logoBusy = false;

  Future<void> _changeLogo() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 600, maxHeight: 600, imageQuality: 85);
    if (file == null) return;
    setState(() => _logoBusy = true);
    try {
      final bytes = await file.readAsBytes();
      final n = file.name.toLowerCase();
      final ext = n.endsWith('.png') ? 'png' : n.endsWith('.webp') ? 'webp' : 'jpg';
      final r = await Api.instance.post('/merchants/logo', {'data': base64Encode(bytes), 'ext': ext});
      if (mounted) toast(context, asStr(r['message'], 'Logo enregistré'));
      await _load();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    } finally {
      if (mounted) setState(() => _logoBusy = false);
    }
  }

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
          GestureDetector(
            onTap: _logoBusy ? null : _changeLogo,
            child: Stack(children: [
              RestoLogo(url: m['restaurantLogo'] as String?, name: asStr(m['restaurantName'], s.name), size: 64),
              Positioned(
                right: 0, bottom: 0,
                child: Container(
                  width: 24, height: 24,
                  decoration: BoxDecoration(color: C.brand, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                  child: _logoBusy
                      ? const Padding(padding: EdgeInsets.all(4), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Icon(Ic.camera, size: 12, color: Colors.white),
                ),
              ),
            ]),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(asStr(m['restaurantName'], s.name), style: h2()),
            Text('${s.name} · offre ${asStr(sub['label'], 'gratuite').toLowerCase()}', style: small()),
            const SizedBox(height: 4),
            GestureDetector(
              onTap: _logoBusy ? null : _changeLogo,
              child: Text(m['restaurantLogo'] == null ? 'Ajouter le logo du restaurant' : 'Changer le logo', style: font(size: 13, weight: FontWeight.w700, color: C.brand)),
            ),
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
          
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ChangePasswordScreen(path: '/merchants/me/password'))),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Ic.logout, color: C.danger),
          title: Text('Se déconnecter', style: font(size: 15, weight: FontWeight.w600, color: C.danger)),
          onTap: () => s.logout(),
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Ic.trash, color: C.danger),
          title: Text('Supprimer mon compte', style: font(size: 15, weight: FontWeight.w600, color: C.danger)),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DeleteAccountScreen())),
        ),
        const SizedBox(height: 20),
        Center(child: Column(children: [Text('WAYI Pro', style: small())])),
      ]),
    );
  }
}
