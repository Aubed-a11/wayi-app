import 'package:flutter/material.dart';
import 'ui.dart';

/// Photos de plats qui defilent en cascade (colonnes verticales) ou en bandeau
/// (rangees horizontales), en boucle, a des vitesses differentes.
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
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 60))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  List<String> _lane(int i) {
    final p = widget.photos;
    if (p.isEmpty) return const [];
    final mine = <String>[for (var k = i; k < p.length; k += widget.columns) p[k]];
    final base = mine.length >= 3 ? mine : [...p.skip(i % p.length), ...p.take(i % p.length)];
    return base;
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
      return AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          if (widget.horizontal) {
            final h = (box.maxHeight - g * (n - 1)) / n;
            final w = h / widget.tileRatio;
            return Column(children: [
              for (var i = 0; i < n; i++) ...[
                if (i > 0) SizedBox(height: g),
                SizedBox(height: h, child: _lane2D(_lane(i), w, h, i, horizontal: true)),
              ],
            ]);
          }
          final w = (box.maxWidth - g * (n - 1)) / n;
          final h = w * widget.tileRatio;
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (var i = 0; i < n; i++) ...[
              if (i > 0) SizedBox(width: g),
              SizedBox(width: w, height: box.maxHeight, child: _lane2D(_lane(i), w, h, i)),
            ],
          ]);
        },
      );
    });
  }

  /// Une colonne (ou rangee) qui defile en boucle
  Widget _lane2D(List<String> items, double w, double h, int i, {bool horizontal = false}) {
    if (items.isEmpty) return const SizedBox.shrink();
    final g = widget.gap;
    final step = (horizontal ? w : h) + g;
    final period = step * items.length;
    final speed = [1.0, 1.35, 0.8, 1.15][i % 4];
    final reverse = i.isOdd;
    var t = (_c.value * speed * 3) % 1.0;
    if (reverse) t = 1 - t;
    final offset = -t * period - (i * step * 0.37);
    final children = <Widget>[];
    final count = items.length * 3;
    for (var k = 0; k < count; k++) {
      final pos = offset + k * step;
      children.add(Positioned(
        left: horizontal ? pos : 0,
        top: horizontal ? 0 : pos,
        child: _tile(items[k % items.length], w, h),
      ));
    }
    return ClipRect(child: Stack(clipBehavior: Clip.hardEdge, children: children));
  }
}
