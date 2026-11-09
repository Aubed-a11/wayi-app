import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

/// Compte (livreur ou restaurant) : changer de mot de passe, se deconnecter
Future<void> showAccountSheet(BuildContext context, {required String passwordPath, required Future<void> Function() onLogout, List<Widget> extra = const []}) {
  final s = context.read<Session>();
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (c) => SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(24, 0, 24, MediaQuery.of(c).viewInsets.bottom + 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.name, style: h2()),
          Text('Espace ${roleLabel(s.role ?? Role.client).toLowerCase()}', style: small()),
          const SizedBox(height: 16),
          ...extra,
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Ic.lock, color: C.ink2),
            title: Text('Changer mon mot de passe', style: font(size: 15, weight: FontWeight.w600)),
            onTap: () {
              Navigator.pop(c);
              Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChangePasswordScreen(path: passwordPath)));
            },
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Ic.logout, color: C.danger),
            title: Text('Se déconnecter', style: font(size: 15, weight: FontWeight.w600, color: C.danger)),
            onTap: () async {
              Navigator.pop(c);
              await onLogout();
            },
          ),
        ]),
      ),
    ),
  );
}

class ChangePasswordScreen extends StatefulWidget {
  final String path;
  const ChangePasswordScreen({super.key, required this.path});
  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;
  String? _error;

  Future<void> _save() async {
    if (_next.text.length < 6) { setState(() => _error = 'Le nouveau mot de passe doit faire au moins 6 caractères'); return; }
    if (_next.text != _confirm.text) { setState(() => _error = 'Les mots de passe ne correspondent pas'); return; }
    setState(() { _loading = true; _error = null; });
    try {
      await Api.instance.put(widget.path, {'currentPassword': _current.text, 'newPassword': _next.text});
      if (!mounted) return;
      toast(context, 'Mot de passe mis à jour');
      Navigator.pop(context);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(leading: IconButton(icon: const Icon(Ic.back), onPressed: () => Navigator.pop(context)), title: Text('Mot de passe', style: h3())),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          Field(label: 'Mot de passe actuel', icon: Ic.lock, controller: _current, password: true),
          const SizedBox(height: 16),
          Field(label: 'Nouveau mot de passe', icon: Ic.lock, controller: _next, password: true, hint: 'Au moins 6 caractères'),
          const SizedBox(height: 16),
          Field(label: 'Confirmer', icon: Ic.lock, controller: _confirm, password: true),
          const SizedBox(height: 20),
          if (_error != null) ...[Notice(_error!), const SizedBox(height: 16)],
          PrimaryButton(label: 'Enregistrer', loading: _loading, onPressed: _save),
        ]),
      );
}
