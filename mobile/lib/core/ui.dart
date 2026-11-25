import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'icons.dart';
import 'theme.dart';

/// Bouton principal : pleine largeur, orange WAYI (ou sombre avec dark: true)
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool dark;
  const PrimaryButton({super.key, required this.label, this.onPressed, this.loading = false, this.icon, this.dark = false});

  @override
  Widget build(BuildContext context) {
    final bg = dark ? C.ink : C.brand;
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: bg, disabledBackgroundColor: bg.withValues(alpha: 0.45),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.md)),
          textStyle: font(size: 15.5, weight: FontWeight.w700, color: Colors.white),
        ),
        child: loading
            ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
            : Row(mainAxisSize: MainAxisSize.min, children: [
                Text(label, style: font(size: 15.5, weight: FontWeight.w700, color: Colors.white)),
                if (icon != null) ...[const SizedBox(width: 10), Icon(icon, size: 18, color: Colors.white)],
              ]),
      ),
    );
  }
}

/// Bouton secondaire (contour)
class GhostButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  const GhostButton({super.key, required this.label, this.onPressed, this.icon});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        height: 52,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            foregroundColor: C.ink, backgroundColor: C.card, side: const BorderSide(color: C.line, width: 1.5),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.md)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 18, color: C.ink), const SizedBox(width: 10)],
            Text(label, style: font(size: 14.5, weight: FontWeight.w700)),
          ]),
        ),
      );
}

/// Champ de saisie arrondi avec icone
class Field extends StatefulWidget {
  final String label;
  final String? hint;
  final IconData icon;
  final TextEditingController controller;
  final bool password;
  final TextInputType? keyboard;
  final List<String>? autofill;
  final TextInputAction? action;
  final ValueChanged<String>? onSubmitted;
  final String? helper;
  const Field({super.key, required this.label, required this.icon, required this.controller, this.hint, this.password = false, this.keyboard, this.autofill, this.action, this.onSubmitted, this.helper});
  @override
  State<Field> createState() => _FieldState();
}

class _FieldState extends State<Field> {
  bool _hidden = true;
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(padding: const EdgeInsets.only(left: 4, bottom: 7), child: Text(widget.label, style: font(size: 13, weight: FontWeight.w600, color: C.ink2))),
      TextField(
        controller: widget.controller,
        obscureText: widget.password && _hidden,
        keyboardType: widget.keyboard,
        autofillHints: widget.autofill,
        textInputAction: widget.action,
        onSubmitted: widget.onSubmitted,
        style: font(size: 15, weight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: widget.hint,
          hintStyle: font(size: 14.5, color: C.muted),
          prefixIcon: Icon(widget.icon, size: 19, color: C.muted),
          suffixIcon: widget.password
              ? IconButton(icon: Icon(_hidden ? Ic.eye : Ic.eyeOff, size: 19, color: C.muted), onPressed: () => setState(() => _hidden = !_hidden))
              : null,
          filled: true,
          fillColor: C.card,
          contentPadding: const EdgeInsets.symmetric(vertical: 17, horizontal: 16),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(R.md), borderSide: const BorderSide(color: C.line)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(R.md), borderSide: const BorderSide(color: C.line)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(R.md), borderSide: const BorderSide(color: C.brand, width: 1.6)),
        ),
      ),
      if (widget.helper != null) Padding(padding: const EdgeInsets.only(left: 4, top: 6), child: Text(widget.helper!, style: small())),
    ]);
  }
}

/// Message d'erreur ou d'information dans un formulaire
class Notice extends StatelessWidget {
  final String text;
  final bool error;
  const Notice(this.text, {super.key, this.error = true});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: error ? const Color(0xFFFBEDEB) : C.brandSoft, borderRadius: BorderRadius.circular(R.sm)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(error ? Ic.alert : Ic.info, size: 18, color: error ? C.danger : C.brandDark),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: font(size: 13.5, weight: FontWeight.w600, color: error ? C.danger : C.brandDark, height: 1.4))),
        ]),
      );
}

/// Photo d'un plat (ou fond neutre si absente)
class Photo extends StatelessWidget {
  final String? url;
  final double radius;
  final double? height;
  final double? width;
  const Photo(this.url, {super.key, this.radius = R.md, this.height, this.width});
  @override
  Widget build(BuildContext context) {
    final placeholder = Container(color: C.surface2, alignment: Alignment.center, child: const Icon(Ic.utensils, color: C.muted, size: 26));
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        height: height,
        width: width,
        child: (url == null || url!.isEmpty)
            ? placeholder
            : CachedNetworkImage(imageUrl: url!, fit: BoxFit.cover, placeholder: (_, __) => placeholder, errorWidget: (_, __, ___) => placeholder),
      ),
    );
  }
}

/// Pastille selectionnable (filtres)
class Chip2 extends StatelessWidget {
  final String label;
  final bool selected;
  final IconData? icon;
  final VoidCallback onTap;
  const Chip2({super.key, required this.label, required this.selected, required this.onTap, this.icon});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? C.brand : C.card,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: selected ? C.brand : C.line),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            if (icon != null) ...[Icon(icon, size: 16, color: selected ? Colors.white : C.ink2), const SizedBox(width: 7)],
            Text(label, style: font(size: 13.5, weight: FontWeight.w600, color: selected ? Colors.white : C.ink2)),
          ]),
        ),
      );
}

/// Etat vide (panier vide, aucune commande...)
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String text;
  final Widget? action;
  const EmptyState({super.key, required this.icon, required this.title, required this.text, this.action});
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 84, height: 84, decoration: const BoxDecoration(color: C.brandSoft, shape: BoxShape.circle), child: Icon(icon, size: 34, color: C.brand)),
            const SizedBox(height: 18),
            Text(title, style: h3(), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(text, style: body(C.muted), textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 22), action!],
          ]),
        ),
      );
}

/// Bouton rond (retour, fermer...)
class RoundIcon extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final Color bg;
  const RoundIcon(this.icon, {super.key, required this.onTap, this.bg = Colors.white});
  @override
  Widget build(BuildContext context) => Material(
        color: bg,
        shape: const CircleBorder(),
        elevation: bg == Colors.white ? 1.5 : 0,
        shadowColor: Colors.black26,
        child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: SizedBox(width: 44, height: 44, child: Icon(icon, size: 20, color: bg.computeLuminance() < 0.5 ? Colors.white : C.ink))),
      );
}

void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

/// Carte blanche arrondie avec ombre douce (style super-appli)
class CardBox extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final double radius;
  const CardBox({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap, this.radius = R.lg});
  @override
  Widget build(BuildContext context) => Container(
        decoration: cardBox(radius: radius),
        child: Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(radius),
          clipBehavior: Clip.antiAlias,
          child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
        ),
      );
}

/// Tuile de service : icone dans un carre colore + libelle (grille d'accueil)
class ServiceTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color tint;
  final VoidCallback onTap;
  final bool selected;
  const ServiceTile({super.key, required this.icon, required this.label, required this.color, required this.tint, required this.onTap, this.selected = false});
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 62, height: 62,
            decoration: BoxDecoration(
              color: selected ? color : tint,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: selected ? color : Colors.transparent, width: 2),
            ),
            child: Icon(icon, size: 26, color: selected ? Colors.white : color),
          ),
          const SizedBox(height: 8),
          Text(label, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: font(size: 12, weight: selected ? FontWeight.w800 : FontWeight.w600, color: selected ? C.ink : C.ink2)),
        ]),
      );
}

/// Pastille d'etat (Livree, En route...)
class StatusPill extends StatelessWidget {
  final String label;
  final Color color;
  const StatusPill(this.label, {super.key, this.color = C.brand});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
        child: Text(label, style: font(size: 11.5, weight: FontWeight.w700, color: color)),
      );
}

/// Logo du restaurant (rond). Sans logo envoye : ses initiales sur une couleur fixe.
class RestoLogo extends StatelessWidget {
  final String? url;
  final String name;
  final double size;
  const RestoLogo({super.key, this.url, required this.name, this.size = 22});

  static const _colors = [Color(0xFFF2690D), Color(0xFF1E9E5A), Color(0xFF2F7BE5), Color(0xFF8B4FD8), Color(0xFFD9467A), Color(0xFFE59A00), Color(0xFF0F8A8A)];

  String get _initials {
    final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty && w.length > 2).toList();
    if (words.isEmpty) return name.isNotEmpty ? name[0].toUpperCase() : 'W';
    return words.take(2).map((w) => w[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    final color = _colors[name.codeUnits.fold<int>(0, (a, b) => a + b) % _colors.length];
    final fallback = Container(
      color: color,
      alignment: Alignment.center,
      child: Text(_initials, style: font(size: size * 0.38, weight: FontWeight.w800, color: Colors.white)),
    );
    return Container(
      width: size, height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: size > 30 ? 2 : 1.2), boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: 4)]),
      child: ClipOval(
        child: (url == null || url!.isEmpty)
            ? fallback
            : CachedNetworkImage(imageUrl: url!, fit: BoxFit.cover, placeholder: (_, __) => fallback, errorWidget: (_, __, ___) => fallback),
      ),
    );
  }
}

/// Logo + nom du restaurant sur une ligne
class RestoLine extends StatelessWidget {
  final String? logo;
  final String name;
  final Color? color;
  final double size;
  final String? suffix;
  const RestoLine({super.key, this.logo, required this.name, this.color, this.size = 18, this.suffix});
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        RestoLogo(url: logo, name: name, size: size),
        const SizedBox(width: 6),
        Flexible(
          child: Text(suffix == null ? name : '$name  ·  $suffix', maxLines: 1, overflow: TextOverflow.ellipsis,
              style: font(size: 12.5, weight: FontWeight.w600, color: color ?? C.muted)),
        ),
      ]);
}
