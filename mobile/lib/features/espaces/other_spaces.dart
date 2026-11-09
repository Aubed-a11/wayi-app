import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';

/// Administration : le backoffice reste sur le web (grand ecran).
/// L'appli ouvre le site deja connecte.
class _SpaceSoon extends StatelessWidget {
  final IconData icon;
  final String title;
  final String text;
  final String webUrl;
  const _SpaceSoon({required this.icon, required this.title, required this.text, required this.webUrl});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.asset('assets/logo.png', width: 40, height: 40)),
              const SizedBox(width: 12),
              Expanded(child: Text(s.name, style: h3(), overflow: TextOverflow.ellipsis)),
              IconButton(icon: const Icon(Ic.logout, color: C.muted), onPressed: () => s.logout()),
            ]),
            const Spacer(),
            Container(width: 72, height: 72, decoration: BoxDecoration(color: C.brandSoft, borderRadius: BorderRadius.circular(24)), child: Icon(icon, size: 32, color: C.brandDark)),
            const SizedBox(height: 22),
            Text(title, style: h1()),
            const SizedBox(height: 10),
            Text(text, style: body(C.muted)),
            const SizedBox(height: 28),
            PrimaryButton(label: 'Ouvrir mon espace', icon: Ic.external, onPressed: () {
              // Le site reprend la session directement (#auth=...), sans redemander le mot de passe
              final auth = base64Encode(utf8.encode(jsonEncode({'role': s.role?.name, 'token': s.token})));
              launchUrl(Uri.parse('$webUrl/#auth=${Uri.encodeComponent(auth)}'), mode: LaunchMode.externalApplication);
            }),
            const Spacer(),
          ]),
        ),
      ),
    );
  }
}

class AdminSpace extends StatelessWidget {
  const AdminSpace({super.key});
  @override
  Widget build(BuildContext context) => const _SpaceSoon(
        icon: Ic.shield,
        title: 'Administration',
        text: "Le backoffice WAYI reste sur le web, plus confortable sur grand écran.",
        webUrl: backofficeUrl,
      );
}
