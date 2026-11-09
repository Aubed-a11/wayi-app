import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'common.dart';

/// Mot de passe oublie (client, restaurant, livreur) : code par e-mail puis nouveau mot de passe
class ForgotScreen extends StatefulWidget {
  final String initialEmail;
  const ForgotScreen({super.key, this.initialEmail = ''});
  @override
  State<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends State<ForgotScreen> {
  late final _email = TextEditingController(text: widget.initialEmail);
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _sent = false;
  bool _loading = false;
  String? _error;

  Future<void> _send() async {
    if (!_email.text.contains('@')) { setState(() => _error = 'Entre ton adresse e-mail'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      await Api.instance.post('/auth/forgot-password', {'email': _email.text.trim()});
      setState(() => _sent = true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reset() async {
    if (_code.text.trim().length != 6) { setState(() => _error = 'Entre le code à 6 chiffres'); return; }
    if (_password.text.length < 6) { setState(() => _error = 'Le mot de passe doit faire au moins 6 caractères'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      await Api.instance.post('/auth/reset-password', {'email': _email.text.trim(), 'code': _code.text.trim(), 'password': _password.text});
      if (!mounted) return;
      toast(context, 'Mot de passe changé. Connecte-toi.');
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 12, 24, 24), children: [
            AuthHeader(
              title: _sent ? 'Nouveau mot de passe' : 'Mot de passe oublié ?',
              subtitle: _sent ? 'Entre le code reçu par e-mail, puis choisis ton nouveau mot de passe.' : "Entre ton e-mail, on t'envoie un code.",
            ),
            if (!_sent) Field(label: 'E-mail', icon: Ic.mail, controller: _email, hint: 'toi@exemple.com', keyboard: TextInputType.emailAddress),
            if (_sent) ...[
              Field(label: 'Code reçu', icon: Ic.hash, controller: _code, hint: '6 chiffres', keyboard: TextInputType.number),
              const SizedBox(height: 16),
              Field(label: 'Nouveau mot de passe', icon: Ic.lock, controller: _password, hint: 'Au moins 6 caractères', password: true),
            ],
            const SizedBox(height: 18),
            if (_error != null) ...[Notice(_error!), const SizedBox(height: 16)],
            PrimaryButton(label: _sent ? 'Changer mon mot de passe' : 'Recevoir mon code', loading: _loading, onPressed: _sent ? _reset : _send),
            const SizedBox(height: 14),
            Text('Valable pour tous les comptes WAYI : client, restaurant et livreur.', style: small(), textAlign: TextAlign.center),
          ]),
        ),
      );
}
