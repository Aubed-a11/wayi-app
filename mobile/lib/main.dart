import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'core/push.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'core/ui.dart';
import 'features/auth/welcome_screen.dart';
import 'features/client/client_shell.dart';
import 'features/client/tracking_screen.dart';
import 'features/driver/driver_home.dart';
import 'features/espaces/other_spaces.dart';
import 'features/merchant/merchant_shell.dart';
import 'state/cart.dart';
import 'state/menu.dart';

final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Push.init();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
    systemNavigationBarColor: Colors.white,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));
  final cart = Cart()..load();
  final session = Session()..onLoggedOut = cart.clear;
  session.restore();
  // Notification touchee : le client arrive directement sur le suivi de sa commande
  Push.onOpen = (type, orderId) {
    if (orderId == null || session.role != Role.client) return;
    navigatorKey.currentState?.push(MaterialPageRoute(builder: (_) => TrackingScreen(orderId: orderId)));
  };
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: session),
        ChangeNotifierProvider.value(value: cart),
        ChangeNotifierProvider(create: (_) => Menu()),
      ],
      child: const WayiApp(),
    ),
  );
}

class WayiApp extends StatelessWidget {
  const WayiApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'WAYI',
        debugShowCheckedModeBanner: false,
        navigatorKey: navigatorKey,
        scaffoldMessengerKey: Push.messengerKey,
        theme: wayiTheme(),
        home: const RootGate(),
      );
}

/// Ouvre le bon espace selon le compte connecte
class RootGate extends StatelessWidget {
  const RootGate({super.key});
  @override
  Widget build(BuildContext context) {
    final s = context.watch<Session>();
    final Widget page;
    if (!s.ready) {
      page = const SplashView();
    } else if (!s.signedIn) {
      page = const WelcomeScreen();
    } else {
      page = switch (s.role!) {
        Role.client => const ClientShell(),
        Role.driver => const DriverHome(),
        Role.merchant => const MerchantShell(),
        Role.admin => const AdminSpace(),
      };
    }
    return AnimatedSwitcher(duration: const Duration(milliseconds: 350), child: KeyedSubtree(key: ValueKey('${s.ready}-${s.role}'), child: page));
  }
}

class SplashView extends StatelessWidget {
  const SplashView({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ClipRRect(borderRadius: BorderRadius.circular(28), child: Image.asset('assets/logo.png', width: 104, height: 104)),
            const SizedBox(height: 22),
            const BeninStripe(width: 54),
          ]),
        ),
      );
}
