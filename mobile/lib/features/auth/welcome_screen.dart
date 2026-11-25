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
    Widget framed(int i, double r) => Container(
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(r + 4), border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 4), boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 8))]),
          child: Photo(photos.length > i ? photos[i] : null, radius: r),
        );
    return Scaffold(
      backgroundColor: C.brand,
      body: Container(
        decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFF57A1F), C.brand, Color(0xFFE05A06)])),
        child: Column(children: [
          Expanded(
            child: Padding(
              padding: EdgeInsets.fromLTRB(22, top + 18, 22, 22),
              child: Column(children: [
                Row(children: [
                  ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.asset('assets/logo.png', width: 42, height: 42)),
                  const SizedBox(width: 10),
                  Text('WAYI', style: font(size: 20, weight: FontWeight.w800, color: Colors.white, spacing: 1)),
                  const Spacer(),
                ]),
                const SizedBox(height: 22),
                Expanded(
                  child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Expanded(flex: 3, child: framed(0, 22)),
                    const SizedBox(width: 12),
                    Expanded(flex: 2, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: framed(1, 20)), const SizedBox(height: 12), Expanded(child: framed(2, 20))])),
                  ]),
                ),
              ]),
            ),
          ),
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(24, 28, 24, MediaQuery.of(context).padding.bottom + 22),
            decoration: const BoxDecoration(color: C.card, borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Les bons plats de Cotonou, livrés chez toi.', style: h1()),
              const SizedBox(height: 10),
              Text('Un menu choisi chez des restaurants vérifiés, au bon moment de la journée. Client, restaurant ou livreur : une seule appli.', style: body(C.muted)),
              const SizedBox(height: 24),
              PrimaryButton(label: 'Créer un compte', icon: Ic.next, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RegisterScreen()))),
              const SizedBox(height: 12),
              GhostButton(label: "J'ai déjà un compte", onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()))),
            ]),
          ),
        ]),
      ),
    );
  }
}
