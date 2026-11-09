import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'menu_tab.dart';

/// Ajouter ou modifier un plat (avec photo prise ou choisie dans la galerie)
class DishFormScreen extends StatefulWidget {
  final Map<String, dynamic>? dish;
  const DishFormScreen({super.key, this.dish});
  @override
  State<DishFormScreen> createState() => _DishFormScreenState();
}

class _DishFormScreenState extends State<DishFormScreen> {
  late final _name = TextEditingController(text: asStr(widget.dish?['name']));
  late final _price = TextEditingController(text: widget.dish?['price'] != null ? '${asNum(widget.dish!['price']).toInt()}' : '');
  late final _desc = TextEditingController(text: asStr(widget.dish?['desc']));
  late final _composition = TextEditingController(text: asStr(widget.dish?['characteristics']));
  late final _advantages = TextEditingController(text: asStr(widget.dish?['advantages']));
  late String _period = asStr(widget.dish?['period'], 'dejeuner');
  late String _category = asStr(widget.dish?['category'], 'plats_locaux');
  late String? _image = widget.dish?['image'] as String?;
  bool _uploading = false;
  bool _saving = false;
  String? _error;

  bool get _editing => widget.dish != null;

  Future<void> _pick(ImageSource source) async {
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1200, maxHeight: 1200, imageQuality: 80);
    if (file == null) return;
    setState(() { _uploading = true; _error = null; });
    try {
      final bytes = await file.readAsBytes();
      final name = file.name.toLowerCase();
      final ext = name.endsWith('.png') ? 'png' : name.endsWith('.webp') ? 'webp' : 'jpg';
      final r = await Api.instance.post('/merchants/dishes/photo', {'data': base64Encode(bytes), 'ext': ext});
      setState(() => _image = r['url']?.toString());
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _photoMenu() => showModalBottomSheet(
        context: context,
        builder: (c) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(leading: const Icon(Ic.camera), title: const Text('Prendre une photo'), onTap: () { Navigator.pop(c); _pick(ImageSource.camera); }),
            ListTile(leading: const Icon(Ic.image), title: const Text('Choisir dans la galerie'), onTap: () { Navigator.pop(c); _pick(ImageSource.gallery); }),
            if (_image != null) ListTile(leading: const Icon(Ic.trash, color: C.danger), title: const Text('Retirer la photo'), onTap: () { Navigator.pop(c); setState(() => _image = null); }),
          ]),
        ),
      );

  Future<void> _save() async {
    final price = int.tryParse(_price.text.replaceAll(RegExp(r'[^0-9]'), ''));
    if (_name.text.trim().isEmpty) { setState(() => _error = 'Donne un nom au plat'); return; }
    if (price == null || price < 100) { setState(() => _error = 'Indique un prix valide (en FCFA)'); return; }
    setState(() { _saving = true; _error = null; });
    final body = {
      'name': _name.text.trim(), 'price': price, 'period': _period, 'category': _category,
      'desc': _desc.text.trim(), 'characteristics': _composition.text.trim(), 'advantages': _advantages.text.trim(),
      'image': _image,
    };
    try {
      if (_editing) {
        await Api.instance.put('/merchants/dishes/${widget.dish!['id']}', body);
      } else {
        await Api.instance.post('/merchants/dishes', body);
      }
      if (!mounted) return;
      toast(context, _editing ? 'Plat mis à jour' : 'Plat ajouté à ton menu');
      Navigator.pop(context, true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _multi(String label, TextEditingController c, String hint) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(left: 4, bottom: 7), child: Text(label, style: font(size: 13, weight: FontWeight.w600, color: C.ink2))),
        TextField(
          controller: c, minLines: 2, maxLines: 5,
          style: font(size: 14.5, weight: FontWeight.w500),
          decoration: InputDecoration(
            hintText: hint, hintStyle: font(size: 14, color: C.muted), filled: true, fillColor: C.surface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(R.md), borderSide: BorderSide.none),
          ),
        ),
      ]);

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(leading: IconButton(icon: const Icon(Ic.back), onPressed: () => Navigator.pop(context)), title: Text(_editing ? 'Modifier le plat' : 'Nouveau plat', style: h3())),
        body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 120), children: [
          GestureDetector(
            onTap: _uploading ? null : _photoMenu,
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Stack(children: [
                Positioned.fill(child: Photo(_image, radius: R.lg)),
                if (_image == null)
                  Positioned.fill(child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Ic.plus, size: 28, color: C.ink2),
                    const SizedBox(height: 6),
                    Text('Ajouter une photo', style: font(weight: FontWeight.w700, color: C.ink2)),
                    Text('Une belle photo fait vendre', style: small()),
                  ]))),
                if (_uploading) Positioned.fill(child: Container(decoration: BoxDecoration(color: Colors.white70, borderRadius: BorderRadius.circular(R.lg)), child: const Center(child: CircularProgressIndicator(color: C.brand)))),
              ]),
            ),
          ),
          const SizedBox(height: 20),
          Field(label: 'Nom du plat', icon: Ic.utensils, controller: _name, hint: 'Ex : Amiwo au poulet'),
          const SizedBox(height: 16),
          Field(label: 'Prix (FCFA)', icon: Ic.wallet, controller: _price, hint: 'Ex : 2500', keyboard: TextInputType.number),
          const SizedBox(height: 18),
          Text('Moment de la journée', style: font(size: 13, weight: FontWeight.w600, color: C.ink2)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final e in periodLabels.entries) Chip2(label: e.value, icon: periodIcon(e.key), selected: _period == e.key, onTap: () => setState(() => _period = e.key)),
          ]),
          const SizedBox(height: 18),
          Text('Catégorie', style: font(size: 13, weight: FontWeight.w600, color: C.ink2)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final e in categoryLabels.entries) Chip2(label: e.value, icon: categoryIcon(e.key), selected: _category == e.key, onTap: () => setState(() => _category = e.key)),
          ]),
          const SizedBox(height: 18),
          _multi('Description', _desc, 'Ce que le client va trouver dans son assiette'),
          const SizedBox(height: 16),
          _multi('Composition (une ligne par élément)', _composition, 'Pâte de maïs\nSauce tomate\nPoulet grillé'),
          const SizedBox(height: 16),
          _multi('Points forts (une ligne par élément)', _advantages, 'Copieux\nFait maison'),
          if (_error != null) ...[const SizedBox(height: 16), Notice(_error!)],
        ]),
        bottomSheet: Container(
          padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: C.line))),
          child: PrimaryButton(label: _editing ? 'Enregistrer' : 'Ajouter au menu', loading: _saving, onPressed: _uploading ? null : _save),
        ),
      );
}
