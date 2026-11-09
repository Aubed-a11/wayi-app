/// 2500 -> "2 500 FCFA"
String fcfa(num? value) => '${groupDigits((value ?? 0).round())} FCFA';

String groupDigits(int n) {
  final s = n.abs().toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(' ');
    b.write(s[i]);
  }
  return n < 0 ? '-$b' : b.toString();
}

num asNum(dynamic v, [num fallback = 0]) => v is num ? v : (num.tryParse('${v ?? ''}') ?? fallback);
double? asDouble(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}');
String asStr(dynamic v, [String fallback = '']) => v == null ? fallback : v.toString();

/// "2026-11-09T14:05:00Z" -> "14:05"
String hourOf(String? iso) {
  if (iso == null) return '';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

/// "2026-11-09T14:05:00Z" -> "9 nov., 14:05"
String dateOf(String? iso) {
  if (iso == null) return '';
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return '';
  const m = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return '${d.day} ${m[d.month - 1]}, ${hourOf(iso)}';
}
