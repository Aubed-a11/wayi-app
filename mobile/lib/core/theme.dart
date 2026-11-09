import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Palette WAYI : blanc, encre chaude, terre cuite adoucie,
/// et une fine touche des couleurs du Benin.
class C {
  static const bg = Color(0xFFFFFFFF);
  static const surface = Color(0xFFF7F4F0);
  static const surface2 = Color(0xFFF1ECE6);
  static const line = Color(0xFFEDE6DF);
  static const ink = Color(0xFF181412);
  static const ink2 = Color(0xFF4A423D);
  static const muted = Color(0xFF8C837D);
  static const brand = Color(0xFFD9824E);
  static const brandDark = Color(0xFFB5652F);
  static const brandSoft = Color(0xFFF8EEE6);
  static const success = Color(0xFF3F8A60);
  static const danger = Color(0xFFB9584C);
  static const bjGreen = Color(0xFF4F8A68);
  static const bjYellow = Color(0xFFE2C468);
  static const bjRed = Color(0xFFC0675C);
}

class R {
  static const sm = 12.0;
  static const md = 18.0;
  static const lg = 26.0;
}

TextStyle font({double size = 14, FontWeight weight = FontWeight.w500, Color color = C.ink, double? height, double? spacing}) =>
    GoogleFonts.plusJakartaSans(fontSize: size, fontWeight: weight, color: color, height: height, letterSpacing: spacing);

/// Titres
TextStyle h1([Color color = C.ink]) => font(size: 30, weight: FontWeight.w800, color: color, height: 1.12, spacing: -0.6);
TextStyle h2([Color color = C.ink]) => font(size: 22, weight: FontWeight.w800, color: color, height: 1.2, spacing: -0.3);
TextStyle h3([Color color = C.ink]) => font(size: 17, weight: FontWeight.w700, color: color, height: 1.25);
TextStyle body([Color color = C.ink2]) => font(size: 14, weight: FontWeight.w500, color: color, height: 1.5);
TextStyle small([Color color = C.muted]) => font(size: 12.5, weight: FontWeight.w500, color: color, height: 1.4);

ThemeData wayiTheme() {
  final base = ThemeData(useMaterial3: true, colorScheme: ColorScheme.fromSeed(seedColor: C.brand, primary: C.brand, surface: C.bg));
  return base.copyWith(
    scaffoldBackgroundColor: C.bg,
    textTheme: GoogleFonts.plusJakartaSansTextTheme(base.textTheme).apply(bodyColor: C.ink, displayColor: C.ink),
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: C.bg, surfaceTintColor: Colors.transparent, elevation: 0, centerTitle: false,
      foregroundColor: C.ink, titleTextStyle: h3(),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating, backgroundColor: C.ink,
      contentTextStyle: font(color: Colors.white, size: 13.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(R.sm)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(backgroundColor: C.bg, surfaceTintColor: Colors.transparent, showDragHandle: true),
    dividerTheme: const DividerThemeData(color: C.line, thickness: 1, space: 1),
  );
}
