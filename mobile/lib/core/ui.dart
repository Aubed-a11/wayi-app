import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'icons.dart';
import 'theme.dart';

/// Bouton principal : pleine largeur, arrondi, sombre ou terre cuite
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;
  final bool dark;
  const PrimaryButton({super.key, required this.label, this.onPressed, this.loading = false, this.icon, this.dark = true});

  @override
  Widget build(BuildContext context) {
    final bg = dark ? C.ink : C.brand;
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: bg, disabledBackgroundColor: bg.withOpacity(0.45),
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
            foregroundColor: C.ink, side: const BorderSide(color: C.line, width: 1.5),
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
          fillColor: C.surface,
          contentPadding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(R.md), borderSide: BorderSide.none),
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

/// Fine bande aux couleurs du Benin
class BeninStripe extends StatelessWidget {
  final double width;
  const BeninStripe({super.key, this.width = 42});
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(2),
        child: SizedBox(
          width: width,
          height: 3,
          child: const Row(children: [
            Expanded(child: ColoredBox(color: C.bjGreen)),
            Expanded(child: ColoredBox(color: C.bjYellow)),
            Expanded(child: ColoredBox(color: C.bjRed)),
          ]),
        ),
      );
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
            color: selected ? C.ink : C.surface,
            borderRadius: BorderRadius.circular(999),
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
            Container(width: 76, height: 76, decoration: const BoxDecoration(color: C.surface, shape: BoxShape.circle), child: Icon(icon, size: 30, color: C.ink2)),
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
        child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: SizedBox(width: 44, height: 44, child: Icon(icon, size: 20, color: bg == C.ink ? Colors.white : C.ink))),
      );
}

void toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
