import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../state/menu.dart';
import 'login_screen.dart';
import 'register_screen.dart';

/// Premier ecran : photos du menu du jour, puis connexion ou inscription
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});
  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => context.read<Menu>().load());
  }

  @override
  Widget build(BuildContext context) {
    final photos = context.watch<Menu>().dishes.where((d) => d.image != null).map((d) => d.image).take(3).toList();
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      body: Column(children: [
        Expanded(
          child: Stack(children: [
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.fromLTRB(16, top + 12, 16, 0),
                child: Row(children: [
                  Expanded(flex: 3, child: Photo(photos.isNotEmpty ? photos[0] : null, radius: R.lg)),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: Column(children: [
                      Expanded(child: Photo(photos.length > 1 ? photos[1] : null, radius: R.lg)),
                      const SizedBox(height: 10),
                      Expanded(child: Photo(photos.length > 2 ? photos[2] : null, radius: R.lg)),
                    ]),
                  ),
                ]),
              ),
            ),
            Positioned(
              left: 0, right: 0, bottom: 0, height: 120,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white.withValues(alpha: 0), Colors.white]),
                  ),
                ),
              ),
            ),
          ]),
        ),
        Padding(
          padding: EdgeInsets.fromLTRB(24, 8, 24, MediaQuery.of(context).padding.bottom + 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.asset('assets/logo.png', width: 40, height: 40)),
              const SizedBox(width: 12),
              Text('WAYI', style: font(size: 18, weight: FontWeight.w800, spacing: 1)),
              const SizedBox(width: 10),
              const BeninStripe(width: 30),
            ]),
            const SizedBox(height: 22),
            Text('Les bons plats de Cotonou, livrés chez toi.', style: h1()),
            const SizedBox(height: 12),
            Text('Un menu du jour choisi chez des restaurants vérifiés. Client, restaurant ou livreur : une seule appli.', style: body(C.muted)),
            const SizedBox(height: 28),
            PrimaryButton(label: 'Créer un compte', icon: Ic.next, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen()))),
            const SizedBox(height: 12),
            GhostButton(label: "J'ai déjà un compte", onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()))),
          ]),
        ),
      ]),
    );
  }
}
