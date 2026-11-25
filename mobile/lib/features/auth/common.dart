import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/cascade.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../state/menu.dart';

/// En-tete commun des ecrans de connexion : degrade orange vers rouge sombre,
/// photos des plats qui defilent, titre en blanc.
class AuthHeader extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool photos;
  final VoidCallback? onBack;
  final Widget? trailing;
  const AuthHeader({super.key, required this.title, required this.subtitle, this.photos = true, this.onBack, this.trailing});
  @override
  Widget build(BuildContext context) {
    final list = context.watch<Menu>().dishes.map((d) => d.image).whereType<String>().where((u) => u.isNotEmpty).toList();
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFF9A15A), C.brand, Color(0xFFC2462B), Color(0xFF8E2318)], stops: [0, 0.35, 0.8, 1]),
        borderRadius: BorderRadius.circular(28),
        boxShadow: [BoxShadow(color: C.brandDark.withValues(alpha: 0.25), blurRadius: 22, offset: const Offset(0, 10))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
          child: Row(children: [
            RoundIcon(Ic.back, onTap: onBack ?? () => Navigator.of(context).maybePop()),
            const Spacer(),
            trailing ?? ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.asset('assets/logo.png', width: 36, height: 36)),
          ]),
        ),
        if (photos && list.isNotEmpty)
          SizedBox(
            height: 150,
            child: Transform.rotate(
              angle: -0.06,
              child: Transform.scale(scale: 1.15, child: Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: DishCascade(photos: list, columns: 2, horizontal: true, gap: 10, tileRatio: 0.75))),
            ),
          )
        else
          const SizedBox(height: 18),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 22),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: h1(Colors.white)),
            const SizedBox(height: 8),
            Text(subtitle, style: body(Colors.white.withValues(alpha: 0.9))),
          ]),
        ),
      ]),
    );
  }
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
                  color: C.bg,
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
