import 'package:flutter/material.dart';
import 'login_page.dart';
import 'dashboard_page.dart';
import 'home_page.dart';
import 'reseller_page.dart';
import 'admin_page.dart';
import 'owner_page.dart'; // <--- Import OwnerPage
import 'builder_page.dart';
import 'landing.dart';
import 'splash.dart';
import 'app_config.dart';
import 'services/app_route_observer.dart';

import 'services/notification_service.dart';
import 'services/page_transitions.dart';
import 'features/status_create_page.dart';
import 'features/status_viewer_page.dart';
import 'features/profile_avatar_page.dart';
import 'widgets/status_bar.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize background notification service
  await NotificationService().initializeService();
  
  await AppConfig.init(); // Fetch URL dari GitHub sebelum app jalan
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      navigatorObservers: [appRouteObserver],
      title: 'LeicasApp',
      theme: ThemeData(
        brightness: Brightness.dark,
        fontFamily: 'Rajdhani',
        scaffoldBackgroundColor: Colors.black,
        colorScheme: ColorScheme.dark().copyWith(
          primary: Colors.grey.shade800,
          secondary: Colors.red,
          background: Colors.black,
          surface: Colors.black,
        ),
        primaryColor: Colors.grey.shade800,
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.black,
          foregroundColor: Colors.red,
          iconTheme: const IconThemeData(color: Colors.red),
        ),
        iconTheme: const IconThemeData(color: Colors.red),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.grey.shade800,
            foregroundColor: Colors.red,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(foregroundColor: Colors.grey.shade800),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.grey.shade800,
            side: const BorderSide(color: Colors.grey),
          ),
        ),
        floatingActionButtonTheme: const FloatingActionButtonThemeData(
          backgroundColor: Colors.grey,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.black.withOpacity(0.3),
          focusedBorder: OutlineInputBorder(
            borderSide: const BorderSide(color: Colors.grey),
            borderRadius: BorderRadius.circular(12),
          ),
          enabledBorder: OutlineInputBorder(
            borderSide: BorderSide(color: Colors.grey.withOpacity(0.6)),
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        snackBarTheme: SnackBarThemeData(
          backgroundColor: Colors.grey.shade800,
          contentTextStyle: const TextStyle(color: Colors.red),
        ),
      ),
      initialRoute: '/',
      onGenerateRoute: (settings) {
        switch (settings.name) {
          case '/':
            return MaterialPageRoute(builder: (_) => const SplashScreen());
          case '/login':
            return MaterialPageRoute(builder: (_) => const LoginPage());
          case '/dashboard':
            final args = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(
              builder: (_) => DashboardPage(
                username: args['username'],
                password: args['password'],
                role: args['role'],
                sessionKey: args['key'],
                expiredDate: args['expiredDate'],
                ratId: args['ratId']?.toString() ?? '',
                listBug: List<Map<String, dynamic>>.from(args['listBug'] ?? []),
                listDoos: List<Map<String, dynamic>>.from(
                  args['listDoos'] ?? [],
                ),
                news: List<Map<String, dynamic>>.from(args['news'] ?? []),
              ),
            );

          case '/home':
            final args = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(
              builder: (_) => HomePage(
                username: args['username'],
                password: args['password'],
                listBug: List<Map<String, dynamic>>.from(args['listBug'] ?? []),
                role: args['role'],
                expiredDate: args['expiredDate'],
                sessionKey: args['sessionKey'],
              ),
            );

          case '/reseller':
            final args = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(
              builder: (_) => ResellerPage(
                keyToken: args['keyToken'],
                userRole: args['userRole'],
              ),
            );

          case '/admin':
            final args = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(
              builder: (_) => AdminPage(
                sessionKey:
                    args['sessionKey'], // Pastikan sessionKey ada di args
              ),
            );

          // --- ROUTE BARU: OWNER ---
          case '/owner':
            final args = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(
              builder: (_) => OwnerPage(
                sessionKey:
                    args['sessionKey'], // Pastikan sessionKey ada di args
                username: args['username'], // Pastikan username ada di args
              ),
            );

          // --- ROUTE BARU: APK BUILDER ---
          case '/builder':
            final args = settings.arguments as Map<String, dynamic>;
            return MaterialPageRoute(
              builder: (_) => BuilderPage(
                sessionKey: args['sessionKey'] ?? '',
              ),
            );

          case '/status_create':
            final args = settings.arguments as Map<String, dynamic>;
            return SlideFadeRoute(
              page: StatusCreatePage(
                username: args['username'] ?? '',
                sessionKey: args['sessionKey'] ?? '',
                role: args['role'] ?? 'member',
              ),
            );

          case '/status_viewer':
            final args = settings.arguments as Map<String, dynamic>;
            return SlideFadeRoute(
              page: StatusViewerPage(
                allGroups: List<StatusUserGroup>.from(args['allGroups'] ?? []),
                initialUserIndex: args['initialUserIndex'] ?? 0,
                currentUsername: args['currentUsername'] ?? '',
                sessionKey: args['sessionKey'] ?? '',
              ),
            );

          case '/profile_avatar':
            final args = settings.arguments as Map<String, dynamic>;
            return SlideFadeRoute(
              page: ProfileAvatarPage(
                username: args['username'] ?? '',
                sessionKey: args['sessionKey'] ?? '',
                currentAvatarUrl: args['currentAvatarUrl'],
              ),
            );

          default:
            return MaterialPageRoute(
              builder: (_) =>
                  Scaffold(body: Center(child: Text("404 - Not Found"))),
            );
        }
      },
    );
  }
}
