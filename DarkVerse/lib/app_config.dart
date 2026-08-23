import 'dart:convert';
import 'package:http/http.dart' as http;

class AppConfig {
  static const String _configUrl =
      'https://raw.githubusercontent.com/raldzzxyz-max/server-LeicasApp/refs/heads/main/config.json';

  // Loaded from config.json
  static String baseUrl   = "http://192.168.1.8:2039";
  static String wsUrl     = "http://192.168.1.8:2039";
  static String socketUrl = "http://192.168.1.8:2039";

  // Hardcoded servers (not in config.json)
  static const String chatServerUrl       = "http://dayzxteam.serverku.space:2008";
  static const String panelServerUrl      = "http://tr4svloid28.panelkuy.my.id:2002";
  static const String panelWsUrl          = "http://tr4svloid28.panelkuy.my.id:2002";
  static const String chatWsUrl           = "wss://ws.nullxteam.fun";

  // External APIs (hardcoded)
  static const String tmdbBaseUrl         = "https://api.themoviedb.org/3";
  static const String tmdbImageUrl        = "https://image.tmdb.org/t/p/w500";
  static const String groqApiUrl          = "https://api.groq.com/openai/v1/chat/completions";
  static const String siputzxApiUrl       = "https://api.siputzx.my.id";
  static const String nglApiUrl           = "https://ngl.link/api/submit";
  static const String ipApiUrl            = "http://ip-api.com/json";

  static Future<void> init() async {
    try {
      final res = await http
          .get(Uri.parse(_configUrl))
          .timeout(const Duration(seconds: 3));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final b = data['baseUrl']   as String?;
        final w = data['wsUrl']     as String?;
        final s = data['socketUrl'] as String?;
        if (b != null && b.isNotEmpty) baseUrl   = b;
        if (w != null && w.isNotEmpty) wsUrl     = w;
        if (s != null && s.isNotEmpty) socketUrl = s;
      }
    } catch (_) {}
  }
}
