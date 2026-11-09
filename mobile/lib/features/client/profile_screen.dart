import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'client_shell.dart';
import 'map_widgets.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final u = s.user ?? const {};
    final addresses = (u['addresses'] as List? ?? []).whereType<Map>().toList();
    return SafeArea(
      bottom: false,
      child: RefreshIndicator(
        color: C.brand,
        onRefresh: () => s.refreshUser(),
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 14, 20, 110), children: [
          Text('Profil', style: h1()),
          const SizedBox(height: 20),
          Row(children: [
            Container(
              width: 62, height: 62, alignment: Alignment.center,
              decoration: const BoxDecoration(color: C.brandSoft, shape: BoxShape.circle),
              child: Text(s.name.isNotEmpty ? s.name[0].toUpperCase() : 'W', style: h2(C.brandDark)),
            ),
            const SizedBox(width: 16),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.name, style: h2()),
              Text(asStr(u['email']), style: small()),
            ])),
          ]),
          const SizedBox(height: 22),
          Row(children: [
            _Stat(value: '${asNum(u['ordersCount']).toInt()}', label: 'Commandes'),
            const SizedBox(width: 10),
            _Stat(value: '${asNum(u['loyaltyPoints']).toInt()}', label: 'Points'),
            const SizedBox(width: 10),
            _Stat(value: u['subscription'] != null ? 'Actif' : 'Non', label: 'Abonnement'),
          ]),
          const SizedBox(height: 28),
          Row(children: [
            Expanded(child: Text('Mes adresses', style: h3())),
            TextButton.icon(
              onPressed: () => _addAddress(context),
              icon: const Icon(Ic.plus, size: 16, color: C.brandDark),
              label: Text('Ajouter', style: font(size: 13.5, weight: FontWeight.w700, color: C.brandDark)),
            ),
          ]),
          if (addresses.isEmpty) Text('Aucune adresse enregistrée. Tu peux aussi choisir le point à chaque commande.', style: small()),
          for (final a in addresses)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(R.md)),
              child: Row(children: [
                Icon(Ic.pin, size: 18, color: a['isDefault'] == true ? C.brandDark : C.muted),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${asStr(a['label'], 'Adresse')}${a['isDefault'] == true ? '  ·  par défaut' : ''}', style: font(size: 14, weight: FontWeight.w700)),
                  Text(asStr(a['address']), style: small(), maxLines: 2, overflow: TextOverflow.ellipsis),
                ])),
                PopupMenuButton<String>(
                  icon: const Icon(Ic.chevron, size: 18, color: C.muted),
                  onSelected: (v) async {
                    try {
                      if (v == 'default') await Api.instance.put('/auth/addresses/${a['id']}/default');
                      if (v == 'delete') await Api.instance.delete('/auth/addresses/${a['id']}');
                      await s.refreshUser();
                    } on ApiException catch (e) {
                      if (context.mounted) toast(context, e.message);
                    }
                  },
                  itemBuilder: (_) => [
                    if (a['isDefault'] != true) const PopupMenuItem(value: 'default', child: Text('Utiliser par défaut')),
                    const PopupMenuItem(value: 'delete', child: Text('Supprimer')),
                  ],
                ),
              ]),
            ),
          const SizedBox(height: 26),
          _Tile(icon: Ic.yivi, title: 'Ce que Yivi sait de mes goûts', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _YiviPrefs()))),
          _Tile(icon: Ic.info, title: "Aide et questions", subtitle: 'Yivi répond à tes questions sur le service', onTap: () => ClientShell.goTab(context, 2)),
          _Tile(icon: Ic.logout, title: 'Se déconnecter', danger: true, onTap: () => s.logout()),
          const SizedBox(height: 26),
          Center(child: Column(children: [
            const BeninStripe(width: 40),
            const SizedBox(height: 10),
            Text('WAYI Bénin · version 1.0', style: small()),
          ])),
        ]),
      ),
    );
  }

  Future<void> _addAddress(BuildContext context) async {
    final label = TextEditingController(text: 'Domicile');
    final address = TextEditingController();
    LatLng? pos;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => Padding(
          padding: EdgeInsets.fromLTRB(24, 0, 24, MediaQuery.of(c).viewInsets.bottom + 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Nouvelle adresse', style: h2()),
            const SizedBox(height: 16),
            Field(label: 'Nom', icon: Ic.home, controller: label, hint: 'Domicile, Bureau...'),
            const SizedBox(height: 14),
            Field(label: 'Adresse', icon: Ic.pin, controller: address, hint: 'Quartier, rue, maison...'),
            const SizedBox(height: 14),
            GhostButton(
              label: pos == null ? 'Placer sur la carte' : 'Position enregistrée',
              icon: pos == null ? Ic.pin : Ic.check,
              onPressed: () async {
                final p = await Navigator.of(c).push<LatLng>(MaterialPageRoute(builder: (_) => PickLocationScreen(initial: pos)));
                if (p != null) set(() => pos = p);
              },
            ),
            const SizedBox(height: 18),
            PrimaryButton(label: 'Enregistrer', onPressed: () => Navigator.pop(c, true)),
          ]),
        ),
      ),
    );
    if (ok != true || address.text.trim().isEmpty) return;
    try {
      await Api.instance.post('/auth/addresses', {
        'label': label.text.trim().isEmpty ? 'Adresse' : label.text.trim(),
        'address': address.text.trim(),
        if (pos != null) 'lat': pos!.latitude,
        if (pos != null) 'lng': pos!.longitude,
      });
      if (context.mounted) await context.read<Session>().refreshUser();
    } on ApiException catch (e) {
      if (context.mounted) toast(context, e.message);
    }
  }
}

class _Stat extends StatelessWidget {
  final String value, label;
  const _Stat({required this.value, required this.label});
  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 16),
          decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(R.md)),
          child: Column(children: [Text(value, style: h3()), const SizedBox(height: 2), Text(label, style: small())]),
        ),
      );
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool danger;
  const _Tile({required this.icon, required this.title, required this.onTap, this.subtitle, this.danger = false});
  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        onTap: onTap,
        leading: Container(width: 42, height: 42, decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(14)), child: Icon(icon, size: 19, color: danger ? C.danger : C.ink2)),
        title: Text(title, style: font(size: 15, weight: FontWeight.w600, color: danger ? C.danger : C.ink)),
        subtitle: subtitle == null ? null : Text(subtitle!, style: small()),
        trailing: danger ? null : const Icon(Ic.chevron, size: 18, color: C.muted),
      );
}

/// Preferences retenues par Yivi, que le client peut effacer
class _YiviPrefs extends StatefulWidget {
  const _YiviPrefs();
  @override
  State<_YiviPrefs> createState() => _YiviPrefsState();
}

class _YiviPrefsState extends State<_YiviPrefs> {
  Map<String, dynamic>? _p;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await Api.instance.get('/ai/profile');
      if (mounted) setState(() => _p = p);
    } catch (_) {
      if (mounted) setState(() => _p = {});
    }
  }

  Future<void> _forget(String type, String value) async {
    try {
      await Api.instance.delete('/ai/profile/$type/${Uri.encodeComponent(value)}');
      _load();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    List<String> l(String k) => ((p?[k] as List?) ?? []).map((e) => e.toString()).toList();
    final budget = asNum(p?['budgetMax']);
    return Scaffold(
      appBar: AppBar(leading: IconButton(icon: const Icon(Ic.back), onPressed: () => Navigator.pop(context)), title: Text('Mes goûts', style: h3())),
      body: p == null
          ? const Center(child: CircularProgressIndicator(color: C.brand))
          : ListView(padding: const EdgeInsets.all(20), children: [
              Text("Yivi retient ce que tu lui dis pour mieux te proposer. Touche un élément pour l'oublier.", style: body(C.muted)),
              const SizedBox(height: 20),
              for (final sec in [('aime', "J'aime"), ('evite', "J'évite"), ('notes', 'Notes')]) ...[
                Text(sec.$2, style: h3()),
                const SizedBox(height: 10),
                if (l(sec.$1).isEmpty) Text('Rien pour le moment.', style: small()),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final v in l(sec.$1))
                    InputChip(label: Text(v), onDeleted: () => _forget(sec.$1, v), deleteIcon: const Icon(Ic.close, size: 15), backgroundColor: C.surface, side: BorderSide.none),
                ]),
                const SizedBox(height: 20),
              ],
              if (budget > 0) ...[
                Text('Budget habituel', style: h3()),
                const SizedBox(height: 10),
                InputChip(label: Text('Jusqu\'à ${fcfa(budget)}'), onDeleted: () => _forget('budget', '0'), deleteIcon: const Icon(Ic.close, size: 15), backgroundColor: C.surface, side: BorderSide.none),
              ],
            ]),
    );
  }
}
