import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/icons.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../models/models.dart';
import '../../state/cart.dart';
import 'cart_screen.dart';
import 'widgets.dart';

class _Msg {
  final bool me;
  final String text;
  final List<Dish> dishes;
  final List<String> ids;
  final String? awaiting;
  final bool checkout;
  _Msg(this.me, this.text, {this.dishes = const [], this.ids = const [], this.awaiting, this.checkout = false});
}

/// Yivi, l'assistante : choisit avec le client, remplit le panier, suit la commande
class YiviScreen extends StatefulWidget {
  const YiviScreen({super.key});
  @override
  State<YiviScreen> createState() => _YiviScreenState();
}

class _YiviScreenState extends State<YiviScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<_Msg> _msgs = [];
  bool _thinking = false;

  static const _suggestions = ['Un plat local pas trop épicé', 'Quelque chose de léger', 'Moins de 2 000 FCFA', 'Où en est ma commande ?'];

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _toBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent + 200, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
      });

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty || _thinking) return;
    _input.clear();
    final cart = context.read<Cart>();
    final history = <Map<String, dynamic>>[];
    for (final m in _msgs.length > 16 ? _msgs.sublist(_msgs.length - 16) : _msgs) {
      history.add(m.me ? {'role': 'user', 'content': m.text} : {'role': 'assistant', 'content': m.text, 'recommendedIds': m.ids, 'awaiting': m.awaiting});
    }
    setState(() { _msgs.add(_Msg(true, text)); _thinking = true; });
    _toBottom();
    try {
      final d = await Api.instance.post('/ai/chat', {
        'message': text,
        'history': history,
        'cart': cart.items.map((i) => {'id': i.id, 'qty': i.qty}).toList(),
      });
      final dishes = (d['recommendations'] as List? ?? []).map((e) => Dish.fromJson((e as Map).cast<String, dynamic>())).toList();
      if (d['cart'] is List) {
        cart.replaceWith((d['cart'] as List).map((e) => CartItem.fromJson((e as Map).cast<String, dynamic>())).toList());
      }
      setState(() => _msgs.add(_Msg(false, asStr(d['reply']), dishes: dishes, ids: (d['recommendedIds'] as List? ?? []).map((e) => e.toString()).toList(), awaiting: d['awaiting'] as String?, checkout: d['checkout'] != null)));
    } on ApiException catch (e) {
      setState(() => _msgs.add(_Msg(false, e.message)));
    } finally {
      if (mounted) setState(() => _thinking = false);
      _toBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    final first = context.watch<Session>().firstName;
    return SafeArea(
      bottom: false,
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 14, 12, 8),
          child: Row(children: [
            Container(
              width: 44, height: 44,
              decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color(0xFFE6A47C), C.brand, C.brandDark], begin: Alignment.topLeft, end: Alignment.bottomRight)),
              child: const Icon(Ic.yivi, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Yivi', style: h3()),
              Text(_thinking ? 'réfléchit...' : 'Ton assistante WAYI', style: small()),
            ])),
            if (_msgs.isNotEmpty) IconButton(icon: const Icon(Ic.refresh, size: 20, color: C.muted), onPressed: () => setState(_msgs.clear)),
          ]),
        ),
        const Divider(),
        Expanded(
          child: _msgs.isEmpty
              ? ListView(padding: const EdgeInsets.all(24), children: [
                  const SizedBox(height: 30),
                  Text('Salut${first.isNotEmpty ? ' $first' : ''} !', style: h1()),
                  const SizedBox(height: 8),
                  Text("Dis-moi ce qui te ferait plaisir, ton budget, ce que tu n'aimes pas. Je m'occupe du reste, jusqu'à la livraison.", style: body(C.muted)),
                  const SizedBox(height: 26),
                  Wrap(spacing: 8, runSpacing: 10, children: [
                    for (final s in _suggestions)
                      ActionChip(
                        label: Text(s, style: font(size: 13.5, weight: FontWeight.w600)),
                        backgroundColor: C.surface,
                        side: BorderSide.none,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                        onPressed: () => _send(s),
                      ),
                  ]),
                ])
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                  itemCount: _msgs.length + (_thinking ? 1 : 0),
                  itemBuilder: (_, i) => i == _msgs.length ? const _Typing() : _Bubble(msg: _msgs[i], onQuick: _send),
                ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: C.line))),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _input,
                minLines: 1, maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                style: font(size: 15, weight: FontWeight.w500),
                decoration: InputDecoration(
                  hintText: 'Écris à Yivi...',
                  hintStyle: font(size: 14.5, color: C.muted),
                  filled: true, fillColor: C.surface,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                ),
              ),
            ),
            const SizedBox(width: 10),
            RoundIcon(Ic.send, bg: C.ink, onTap: () => _send()),
          ]),
        ),
      ]),
    );
  }
}

class _Bubble extends StatelessWidget {
  final _Msg msg;
  final ValueChanged<String> onQuick;
  const _Bubble({required this.msg, required this.onQuick});
  @override
  Widget build(BuildContext context) {
    final quick = msg.awaiting == 'confirm_add' || msg.awaiting == 'confirm_order'
        ? ['Oui', 'Non merci']
        : msg.awaiting == 'payment_method'
            ? ['Espèces', 'MTN MoMo', 'Moov Money']
            : const <String>[];
    return Column(crossAxisAlignment: msg.me ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
      Container(
        margin: const EdgeInsets.only(bottom: 8),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: msg.me ? C.ink : C.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20), topRight: const Radius.circular(20),
            bottomLeft: Radius.circular(msg.me ? 20 : 6), bottomRight: Radius.circular(msg.me ? 6 : 20),
          ),
        ),
        child: Text(msg.text, style: font(size: 14.5, weight: FontWeight.w500, color: msg.me ? Colors.white : C.ink, height: 1.45)),
      ),
      if (msg.dishes.isNotEmpty)
        SizedBox(
          height: 262,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: msg.dishes.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => TallCard(dish: msg.dishes[i], width: 168),
          ),
        ),
      if (msg.checkout)
        Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: SizedBox(
            width: 240,
            child: PrimaryButton(label: 'Valider et payer', icon: Ic.next, dark: false, onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CartScreen()))),
          ),
        ),
      if (quick.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Wrap(spacing: 8, children: [
            for (final q in quick)
              OutlinedButton(
                onPressed: () => onQuick(q),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: C.line), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999))),
                child: Text(q, style: font(size: 13, weight: FontWeight.w600)),
              ),
          ]),
        ),
      const SizedBox(height: 6),
    ]);
  }
}

class _Typing extends StatefulWidget {
  const _Typing();
  @override
  State<_Typing> createState() => _TypingState();
}

class _TypingState extends State<_Typing> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..repeat();
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          decoration: BoxDecoration(color: C.surface, borderRadius: BorderRadius.circular(20)),
          child: AnimatedBuilder(
            animation: _c,
            builder: (_, __) => Row(mainAxisSize: MainAxisSize.min, children: [
              for (var i = 0; i < 3; i++)
                Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: 7, height: 7,
                  decoration: BoxDecoration(
                    color: C.brand.withOpacity(0.35 + 0.65 * (((_c.value * 3 - i) % 3) < 1 ? 1 : 0)),
                    shape: BoxShape.circle,
                  ),
                ),
            ]),
          ),
        ),
      );
}
