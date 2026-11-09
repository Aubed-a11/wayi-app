import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'common.dart';
import 'login_screen.dart';

/// Inscription en 3 temps : profil (client / restaurant / livreur), informations, code e-mail
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  int _step = 0;
  Role _role = Role.client;
  final _name = TextEditingController();
  final _restaurant = TextEditingController();
  final _phone = TextEditingController();
  final _zone = TextEditingController();
  final _plate = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _code = TextEditingController();
  String _vehicle = 'moto';
  bool _loading = false;
  String? _error;
  String? _info;

  static const _roles = [
    (Role.client, 'Client', 'Je commande mes repas'),
    (Role.merchant, 'Restaurant', 'Je vends mes plats sur WAYI'),
    (Role.driver, 'Livreur', 'Je livre les commandes'),
  ];
  static const _vehicles = [('moto', 'Moto'), ('velo', 'Vélo'), ('voiture', 'Voiture'), ('tricycle', 'Tricycle')];

  @override
  void dispose() {
    for (final c in [_name, _restaurant, _phone, _zone, _plate, _email, _password, _confirm, _code]) {
      c.dispose();
    }
    super.dispose();
  }

  void _back() {
    if (_step == 0) {
      Navigator.of(context).maybePop();
    } else {
      setState(() { _step--; _error = null; });
    }
  }

  String? _validate() {
    if (_name.text.trim().isEmpty) return 'Ton nom est requis';
    if (_role == Role.merchant && _restaurant.text.trim().isEmpty) return 'Le nom du restaurant est requis';
    if (_role != Role.client && _phone.text.trim().length < 8) return 'Ton numéro de téléphone est requis';
    if (!_email.text.contains('@')) return 'Adresse e-mail invalide';
    if (_password.text.length < 6) return 'Le mot de passe doit faire au moins 6 caractères';
    if (_password.text != _confirm.text) return 'Les mots de passe ne correspondent pas';
    return null;
  }

  Map<String, dynamic> get _form => {
        'name': _name.text.trim(), 'restaurantName': _restaurant.text.trim(), 'phone': _phone.text.trim(),
        'zone': _zone.text.trim(), 'vehicleType': _vehicle, 'vehiclePlate': _plate.text.trim(),
        'email': _email.text.trim(), 'password': _password.text,
      };

  Future<void> _sendCode() async {
    FocusScope.of(context).unfocus();
    final err = _validate();
    if (err != null) { setState(() => _error = err); return; }
    setState(() { _loading = true; _error = null; });
    try {
      final d = await Session.registerStart(_role, _form);
      _code.text = (d['devCode'] ?? '').toString();
      _info = d['devCode'] != null
          ? "L'envoi d'e-mail n'est pas encore actif : ton code a été pré-rempli."
          : null;
      setState(() => _step = 2);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verify() async {
    if (_code.text.trim().length != 6) { setState(() => _error = 'Entre le code à 6 chiffres'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      final account = await Session.registerVerify(_role, _email.text, _code.text.trim());
      if (mounted) await enterAccount(context, account);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _resend() async {
    try {
      final d = await Session.registerResend(_role, _email.text);
      if (d['devCode'] != null) _code.text = d['devCode'].toString();
      if (mounted) toast(context, 'Nouveau code envoyé');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final titles = [
      ('Créer ton compte', 'Dis-nous qui tu es, on prépare le bon espace.'),
      switch (_role) {
        Role.merchant => ('Ton restaurant sur WAYI', 'Quelques infos, puis tu ajoutes tes plats.'),
        Role.driver => ('Livre avec WAYI', "L'équipe WAYI valide ton compte avant ta première course."),
        _ => ('Bienvenue chez WAYI', "Ça prend moins d'une minute."),
      },
      ('Vérifie ton e-mail', 'On a envoyé un code à 6 chiffres à ${_email.text.trim()}.'),
    ];
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) { if (!didPop) _back(); },
      child: Scaffold(
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 12, 24, 24), children: [
            Row(children: [
              RoundIcon(Ic.back, bg: C.surface, onTap: _back),
              const Spacer(),
              for (var i = 0; i < 3; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 250),
                  margin: const EdgeInsets.only(left: 6),
                  width: i == _step ? 22 : 8, height: 8,
                  decoration: BoxDecoration(color: i <= _step ? C.ink : C.line, borderRadius: BorderRadius.circular(8)),
                ),
            ]),
            const SizedBox(height: 28),
            Text(titles[_step].$1, style: h1()),
            const SizedBox(height: 10),
            Text(titles[_step].$2, style: body(C.muted)),
            const SizedBox(height: 26),
            if (_step == 0) ..._roleStep(),
            if (_step == 1) ..._formStep(),
            if (_step == 2) ..._codeStep(),
          ]),
        ),
      ),
    );
  }

  List<Widget> _roleStep() => [
        for (final r in _roles)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GestureDetector(
              onTap: () => setState(() => _role = r.$1),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: _role == r.$1 ? Colors.white : C.surface,
                  borderRadius: BorderRadius.circular(R.md),
                  border: Border.all(color: _role == r.$1 ? C.ink : Colors.transparent, width: 1.8),
                ),
                child: Row(children: [
                  Container(
                    width: 50, height: 50,
                    decoration: BoxDecoration(color: _role == r.$1 ? C.brandSoft : Colors.white, borderRadius: BorderRadius.circular(16)),
                    child: Icon(roleIcon(r.$1), size: 22, color: _role == r.$1 ? C.brandDark : C.ink2),
                  ),
                  const SizedBox(width: 16),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(r.$2, style: h3()),
                    const SizedBox(height: 2),
                    Text(r.$3, style: small()),
                  ])),
                  AnimatedOpacity(
                    opacity: _role == r.$1 ? 1 : 0, duration: const Duration(milliseconds: 200),
                    child: Container(width: 26, height: 26, decoration: const BoxDecoration(color: C.ink, shape: BoxShape.circle), child: const Icon(Ic.check, size: 15, color: Colors.white)),
                  ),
                ]),
              ),
            ),
          ),
        const SizedBox(height: 14),
        PrimaryButton(label: 'Continuer', icon: Ic.next, onPressed: () => setState(() => _step = 1)),
        const SizedBox(height: 16),
        Center(
          child: TextButton(
            onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen())),
            child: Text.rich(TextSpan(children: [
              TextSpan(text: 'Déjà un compte ? ', style: body(C.muted)),
              TextSpan(text: 'Connecte-toi', style: font(size: 14, weight: FontWeight.w700, color: C.brandDark)),
            ])),
          ),
        ),
      ];

  List<Widget> _formStep() {
    const gap = SizedBox(height: 16);
    return [
      if (_role == Role.merchant) ...[Field(label: 'Nom du restaurant', icon: Ic.store, controller: _restaurant, hint: 'Ex : Chez Maman Piment'), gap],
      Field(
        label: _role == Role.client ? 'Prénom' : _role == Role.merchant ? 'Ton nom (responsable)' : 'Nom complet',
        icon: Ic.user, controller: _name, hint: _role == Role.client ? 'Ton prénom' : 'Prénom et nom',
        autofill: const [AutofillHints.name],
      ),
      gap,
      if (_role != Role.client) ...[
        Field(label: 'Téléphone', icon: Ic.phone, controller: _phone, hint: '+229 01 00 00 00 00', keyboard: TextInputType.phone, autofill: const [AutofillHints.telephoneNumber]),
        gap,
        Field(label: _role == Role.merchant ? 'Quartier du restaurant' : 'Zone où tu livres', icon: Ic.pin, controller: _zone, hint: 'Ex : Cadjehoun, Calavi...'),
        gap,
      ],
      if (_role == Role.driver) ...[
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 8), child: Text('Véhicule', style: font(size: 13, weight: FontWeight.w600, color: C.ink2))),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final v in _vehicles) Chip2(label: v.$2, selected: _vehicle == v.$1, onTap: () => setState(() => _vehicle = v.$1)),
        ]),
        gap,
        if (_vehicle != 'velo') ...[Field(label: 'Immatriculation', icon: Ic.hash, controller: _plate, hint: 'Ex : AB 1234 RB'), gap],
      ],
      Field(label: 'E-mail', icon: Ic.mail, controller: _email, hint: 'toi@exemple.com', keyboard: TextInputType.emailAddress, autofill: const [AutofillHints.email], helper: "On t'envoie un code pour le vérifier."),
      gap,
      Field(label: 'Mot de passe', icon: Ic.lock, controller: _password, hint: 'Au moins 6 caractères', password: true, autofill: const [AutofillHints.newPassword]),
      gap,
      Field(label: 'Confirmer le mot de passe', icon: Ic.lock, controller: _confirm, hint: 'Retape ton mot de passe', password: true, action: TextInputAction.done, onSubmitted: (_) => _sendCode()),
      const SizedBox(height: 20),
      if (_error != null) ...[Notice(_error!), const SizedBox(height: 16)],
      PrimaryButton(
        label: _role == Role.merchant ? 'Créer mon restaurant' : _role == Role.driver ? 'Devenir livreur' : 'Créer mon compte',
        icon: Ic.next, loading: _loading, onPressed: _sendCode,
      ),
      const SizedBox(height: 14),
      Text("En continuant, tu acceptes les conditions d'utilisation de WAYI.", style: small(), textAlign: TextAlign.center),
    ];
  }

  List<Widget> _codeStep() => [
        if (_info != null) ...[Notice(_info!, error: false), const SizedBox(height: 18)],
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          autofillHints: const [AutofillHints.oneTimeCode],
          style: font(size: 30, weight: FontWeight.w800, spacing: 14),
          decoration: InputDecoration(
            counterText: '',
            hintText: '000000',
            hintStyle: font(size: 30, weight: FontWeight.w800, spacing: 14, color: C.line),
            filled: true, fillColor: C.surface,
            contentPadding: const EdgeInsets.symmetric(vertical: 22),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(R.md), borderSide: BorderSide.none),
          ),
          onSubmitted: (_) => _verify(),
        ),
        const SizedBox(height: 20),
        if (_error != null) ...[Notice(_error!), const SizedBox(height: 16)],
        PrimaryButton(label: 'Valider le code', icon: Ic.check, loading: _loading, onPressed: _verify),
        const SizedBox(height: 10),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          TextButton(onPressed: _resend, child: Text('Renvoyer le code', style: font(size: 13.5, weight: FontWeight.w700, color: C.brandDark))),
          TextButton(onPressed: () => setState(() => _step = 1), child: Text('Modifier mes infos', style: font(size: 13.5, weight: FontWeight.w600, color: C.muted))),
        ]),
      ];
}
