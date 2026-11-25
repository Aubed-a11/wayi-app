import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'ui.dart';

/// Photos de plats qui defilent en cascade (colonnes verticales) ou en bandeau
/// (rangees horizontales), en boucle, a des vitesses differentes.
/// Les photos sont construites une seule fois : l'animation ne fait que les deplacer.
class DishCascade extends StatefulWidget {
  final List<String> photos;
  final int columns;
  final bool horizontal;
  final double gap;
  final double tileRatio; // hauteur / largeur d'une photo
  const DishCascade({super.key, required this.photos, this.columns = 3, this.horizontal = false, this.gap = 12, this.tileRatio = 4 / 3});
  @override
  State<DishCascade> createState() => _DishCascadeState();
}

class _DishCascadeState extends State<DishCascade> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 40))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  List<String> _lane(int i) {
    final p = widget.photos;
    final mine = <String>[for (var k = i; k < p.length; k += widget.columns) p[k]];
    return mine.length >= 3 ? mine : [...p.skip(i % p.length), ...p.take(i % p.length)];
  }

  Widget _tile(String url, double w, double h) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withValues(alpha: 0.9), width: 3),
          boxShadow: const [BoxShadow(color: Color(0x47501408), blurRadius: 18, offset: Offset(0, 8))],
        ),
        child: Photo(url, radius: 17),
      );

  @override
  Widget build(BuildContext context) {
    if (widget.photos.isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(builder: (context, box) {
      final n = widget.columns;
      final g = widget.gap;
      if (widget.horizontal) {
        final h = (box.maxHeight - g * (n - 1)) / n;
        final w = h / widget.tileRatio;
        return Column(children: [
          for (var i = 0; i < n; i++) ...[
            if (i > 0) SizedBox(height: g),
            SizedBox(width: box.maxWidth, height: h, child: _Lane(controller: _c, index: i, items: _lane(i), w: w, h: h, gap: g, horizontal: true, viewport: box.maxWidth, tile: _tile)),
          ],
        ]);
      }
      final w = (box.maxWidth - g * (n - 1)) / n;
      final h = w * widget.tileRatio;
      return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        for (var i = 0; i < n; i++) ...[
          if (i > 0) SizedBox(width: g),
          SizedBox(width: w, height: box.maxHeight, child: _Lane(controller: _c, index: i, items: _lane(i), w: w, h: h, gap: g, horizontal: false, viewport: box.maxHeight, tile: _tile)),
        ],
      ]);
    });
  }
}

class _Lane extends StatelessWidget {
  final AnimationController controller;
  final int index;
  final List<String> items;
  final double w, h, gap, viewport;
  final bool horizontal;
  final Widget Function(String, double, double) tile;
  const _Lane({required this.controller, required this.index, required this.items, required this.w, required this.h, required this.gap, required this.horizontal, required this.viewport, required this.tile});

  @override
  Widget build(BuildContext context) {
    final step = (horizontal ? w : h) + gap;
    final period = step * items.length;
    final copies = math.max(2, (viewport / period).ceil() + 1);
    final tiles = <Widget>[
      for (var c = 0; c < copies; c++)
        for (final u in items) Padding(padding: horizontal ? EdgeInsets.only(right: gap) : EdgeInsets.only(bottom: gap), child: tile(u, w, h)),
    ];
    // Construit une seule fois, puis deplace par l'animation
    final strip = horizontal
        ? Row(mainAxisSize: MainAxisSize.min, children: tiles)
        : Column(mainAxisSize: MainAxisSize.min, children: tiles);
    final speed = [1.0, 1.4, 0.75, 1.2][index % 4];
    final reverse = index.isOdd;
    final phase = (index * 0.37) % 1.0;
    return ClipRect(
      child: OverflowBox(
        alignment: Alignment.topLeft,
        minWidth: 0, minHeight: 0,
        maxWidth: horizontal ? double.infinity : w,
        maxHeight: horizontal ? h : double.infinity,
        child: AnimatedBuilder(
          animation: controller,
          child: RepaintBoundary(child: strip),
          builder: (context, child) {
            var t = (controller.value * speed + phase) % 1.0;
            if (reverse) t = 1 - t;
            final d = -t * period;
            return Transform.translate(offset: horizontal ? Offset(d, 0) : Offset(0, d), child: child);
          },
        ),
      ),
    );
  }
}
