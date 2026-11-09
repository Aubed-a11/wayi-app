import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

/// En-tete commun des ecrans de connexion
class AuthHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  const AuthHeader({super.key, required this.title, required this.subtitle});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          RoundIcon(Ic.back, bg: C.surface, onTap: () => Navigator.of(context).maybePop()),
          const Spacer(),
          const BeninStripe(width: 34),
        ]),
        const SizedBox(height: 28),
        Text(title, style: h1()),
        const SizedBox(height: 10),
        Text(subtitle, style: body(C.muted)),
        const SizedBox(height: 28),
      ]);
}

IconData roleIcon(Role r) => switch (r) {
      Role.client => Ic.utensils,
      Role.merchant => Ic.store,
      Role.driver => Ic.bike,
      Role.admin => Ic.shield,
    };

/// Ouvre l'espace d'un compte et revient a la racine de l'appli
Future<void> enterAccount(BuildContext context, Account a) async {
  final session = context.read<Session>();
  Navigator.of(context).popUntil((r) => r.isFirst);
  await session.open(a);
}

/// Plusieurs espaces pour les memes identifiants : on demande lequel ouvrir
Future<Account?> chooseAccount(BuildContext context, List<Account> accounts) => showModalBottomSheet<Account>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Quel espace ouvrir ?', style: h2()),
            const SizedBox(height: 6),
            Text('Ces identifiants ouvrent plusieurs espaces.', style: body(C.muted)),
            const SizedBox(height: 18),
            for (final a in accounts)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: C.surface,
                  borderRadius: BorderRadius.circular(R.md),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(R.md),
                    onTap: () => Navigator.of(ctx).pop(a),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        Container(width: 44, height: 44, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14)), child: Icon(roleIcon(a.role), size: 20, color: C.brandDark)),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('Espace ${roleLabel(a.role).toLowerCase()}', style: h3()),
                            if (a.name.isNotEmpty) Text(a.name, style: small()),
                          ]),
                        ),
                        const Icon(Ic.chevron, size: 20, color: C.muted),
                      ]),
                    ),
                  ),
                ),
              ),
          ]),
        ),
      ),
    );
