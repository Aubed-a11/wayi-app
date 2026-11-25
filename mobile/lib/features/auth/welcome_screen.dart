import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/cascade.dart';
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
    final photos = context.watch<Menu>().dishes.map((d) => d.image).whereType<String>().where((u) => u.isNotEmpty).toList();
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: C.brandDark,
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFFF8A2B), C.brand, Color(0xFFC2462B), Color(0xFF8E2318)], stops: [0, 0.4, 0.78, 1]),
        ),
        child: Column(children: [
          Expanded(
            child: Stack(children: [
              Positioned.fill(
                child: Transform.rotate(
                  angle: -0.1,
                  child: Transform.scale(
                    scale: 1.25,
                    child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10), child: DishCascade(photos: photos)),
                  ),
                ),
              ),
              Positioned(
                left: 0, right: 0, bottom: 0, height: 170,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [const Color(0xFF8E2318).withValues(alpha: 0), const Color(0xFF8E2318).withValues(alpha: 0.85)])),
                  ),
                ),
              ),
              Positioned(
                left: 22, top: top + 16,
                child: Row(children: [
                  Container(
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 14, offset: Offset(0, 4))]),
                    child: ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.asset('assets/logo.png', width: 44, height: 44)),
                  ),
                  const SizedBox(width: 10),
                  Text('WAYI', style: font(size: 21, weight: FontWeight.w800, color: Colors.white, spacing: 1)),
                ]),
              ),
            ]),
          ),
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(24, 28, 24, MediaQuery.of(context).padding.bottom + 22),
            decoration: const BoxDecoration(color: C.card, borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Les bons plats, livrés chez toi.', style: h1()),
              const SizedBox(height: 10),
              Text('Un menu choisi chez des restaurants vérifiés, au bon moment de la journée. Client, restaurant ou livreur : une seule appli.', style: body(C.muted)),
              const SizedBox(height: 24),
              PrimaryButton(label: 'Créer un compte', onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen()))),
              const SizedBox(height: 12),
              GhostButton(label: "J'ai déjà un compte", onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()))),
            ]),
          ),
        ]),
      ),
    );
  }
}
