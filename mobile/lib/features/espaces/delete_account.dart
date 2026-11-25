import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

/// Suppression definitive du compte (exigee par l'App Store et le Play Store).
class DeleteAccountScreen extends StatefulWidget {
  const DeleteAccountScreen({super.key});
  @override
  State<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends State<DeleteAccountScreen> {
  final _pwd = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _pwd.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_pwd.text.isEmpty) {
      setState(() => _error = 'Entre ton mot de passe pour confirmer.');
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Supprimer définitivement ?'),
        content: const Text('Ton compte et tes informations personnelles seront effacés. Cette action est irréversible.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Annuler')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Supprimer', style: TextStyle(color: C.danger))),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final session = context.read<Session>();
    final nav = Navigator.of(context);
    try {
      await Api.instance.delete('/auth/me', {'password': _pwd.text});
      nav.popUntil((r) => r.isFirst);
      await session.logout();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Supprimer mon compte')),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.all(24), children: [
          const Icon(Ic.trash, color: C.danger, size: 40),
          const SizedBox(height: 16),
          Text('Supprimer mon compte WAYI', style: h2()),
          const SizedBox(height: 10),
          Text(
            'Ton compte, ton nom, ton e-mail, ton téléphone et tes adresses seront effacés définitivement. '
            'Les commandes déjà passées sont gardées pour la comptabilité, sans aucune information te concernant. '
            'Si une commande est en cours, attends qu\'elle soit terminée.',
            style: body(),
          ),
          const SizedBox(height: 22),
          TextField(
            controller: _pwd,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Mot de passe', prefixIcon: Icon(Ic.lock)),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: font(size: 14, color: C.danger)),
          ],
          const SizedBox(height: 22),
          PrimaryButton(label: 'Supprimer définitivement', icon: Ic.trash, loading: _busy, onPressed: _busy ? null : _delete),
        ]),
      ),
    );
  }
}
