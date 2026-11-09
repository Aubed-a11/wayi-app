import 'package:flutter_test/flutter_test.dart';
import 'package:wayi/core/format.dart';

void main() {
  test('format des prix en FCFA', () {
    expect(fcfa(2500), '2 500 FCFA');
    expect(fcfa(900), '900 FCFA');
    expect(groupDigits(1250000), '1 250 000');
  });
}
