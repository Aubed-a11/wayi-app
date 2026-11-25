import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Palette WAYI, style super-appli : fond gris tres clair, cartes blanches,
/// orange vif du logo pour les actions, une fine touche des couleurs du Benin.
class C {
  static const bg = Color(0xFFF5F6F8);
  static const card = Color(0xFFFFFFFF);
  static const surface = Color(0xFFF1F2F5);
  static const surface2 = Color(0xFFE9EBEF);
  static const line = Color(0xFFE6E8EC);
  static const ink = Color(0xFF15181F);
  static const ink2 = Color(0xFF414754);
  static const muted = Color(0xFF8A909C);
  static const brand = Color(0xFFF2690D);
  static const brandDark = Color(0xFFC9520A);
  static const brandSoft = Color(0xFFFFF0E5);
  static const success = Color(0xFF1E9E5A);
  static const successSoft = Color(0xFFE6F6EE);
  static const danger = Color(0xFFD64545);
  static const bjGreen = Color(0xFF1E8C4E);
  static const bjYellow = Color(0xFFF2C230);
  static const bjRed = Color(0xFFD9433B);
}

class R {
  static const sm = 12.0;
  static const md = 16.0;
  static const lg = 22.0;
}

/// Ombre douce des cartes
const List<BoxShadow> softShadow = [
  BoxShadow(color: Color(0x0F15181F), blurRadius: 18, offset: Offset(0, 6)),
  BoxShadow(color: Color(0x0815181F), blurRadius: 3, offset: Offset(0, 1)),
];

/// Decoration d'une carte blanche
BoxDecoration cardBox({double radius = R.lg, Color color = C.card}) =>
    BoxDecoration(color: color, borderRadius: BorderRadius.circular(radius), boxShadow: softShadow);

TextStyle font({double size = 14, FontWeight weight = FontWeight.w500, Color color = C.ink, double? height, double? spacing}) =>
    GoogleFonts.plusJakartaSans(fontSize: size, fontWeight: weight, color: color, height: height, letterSpacing: spacing);

/// Titres
TextStyle h1([Color color = C.ink]) => font(size: 28, weight: FontWeight.w800, color: color, height: 1.15, spacing: -0.5);
TextStyle h2([Color color = C.ink]) => font(size: 20, weight: FontWeight.w800, color: color, height: 1.2, spacing: -0.3);
TextStyle h3([Color color = C.ink]) => font(size: 16, weight: FontWeight.w700, color: color, height: 1.25);
TextStyle body([Color color = C.ink2]) => font(size: 14, weight: FontWeight.w500, color: color, height: 1.5);
TextStyle small([Color color = C.muted]) => font(size: 12.5, weight: FontWeight.w500, color: color, height: 1.4);

ThemeData wayiTheme() {
  final base = ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: C.brand, primary: C.brand, surface: C.card));
  return base.copyWith(
    scaffoldBackgroundColor: C.bg,
    textTheme: GoogleFonts.plusJakartaSansTextTheme(base.textTheme).apply(bodyColor: C.ink, displayColor: C.ink),
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: C.card, surfaceTintColor: Colors.transparent, elevation: 0, scrolledUnderElevation: 0.5,
      shadowColor: Colors.black12, centerTitle: true, foregroundColor: C.ink, titleTextStyle: h3(),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating, backgroundColor: C.ink,
      contentTextStyle: font(color: Colors.white, size: 13.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.sm)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: C.card, surfaceTintColor: Colors.transparent, showDragHandle: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    dialogTheme: DialogThemeData(backgroundColor: C.card, surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.lg))),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: C.brand),
    switchTheme: SwitchThemeData(thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : null), trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? C.brand : null)),
    dividerTheme: const DividerThemeData(color: C.line, thickness: 1, space: 1),
  );
}
