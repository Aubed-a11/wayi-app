import 'package:flutter/material.dart';
import '../../core/api.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/ui.dart';
import 'common.dart';
import 'forgot_screen.dart';
import 'register_screen.dart';
import '../../core/theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _error = 'E-mail et mot de passe requis');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final accounts = await Session.login(_email.text, _password.text);
      if (!mounted) return;
      final chosen = accounts.length == 1 ? accounts.first : await chooseAccount(context, accounts);
      if (chosen != null && mounted) await enterAccount(context, chosen);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(24, 12, 24, 24), children: [
          const AuthHeader(title: 'Content de te revoir', subtitle: 'Client, restaurant ou livreur : connecte-toi, on ouvre ton espace.'),
          AutofillGroup(
            child: Column(children: [
              Field(label: 'E-mail', icon: Ic.mail, controller: _email, hint: 'toi@exemple.com', keyboard: TextInputType.emailAddress, autofill: const [AutofillHints.email], action: TextInputAction.next),
              const SizedBox(height: 16),
              Field(label: 'Mot de passe', icon: Ic.lock, controller: _password, hint: 'Ton mot de passe', password: true, autofill: const [AutofillHints.password], action: TextInputAction.done, onSubmitted: (_) => _submit()),
            ]),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ForgotScreen(initialEmail: _email.text))),
              child: Text('Mot de passe oublié ?', style: font(size: 13.5, weight: FontWeight.w700, color: C.brandDark)),
            ),
          ),
          if (_error != null) ...[const SizedBox(height: 4), Notice(_error!), const SizedBox(height: 16)] else const SizedBox(height: 12),
          PrimaryButton(label: 'Se connecter', icon: Ic.next, loading: _loading, onPressed: _submit),
          const SizedBox(height: 18),
          Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const RegisterScreen())),
              child: Text.rich(TextSpan(children: [
                TextSpan(text: 'Pas encore de compte ? ', style: body(C.muted)),
                TextSpan(text: 'Inscris-toi', style: font(size: 14, weight: FontWeight.w700, color: C.brandDark)),
              ])),
            ),
          ),
        ]),
      ),
    );
  }
}
