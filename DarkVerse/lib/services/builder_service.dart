import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../app_config.dart';

class BuilderService {
  static final BuilderService _instance = BuilderService._();
  factory BuilderService() => _instance;
  BuilderService._();

  String? _sessionKey;

  void setSessionKey(String key) {
    _sessionKey = key;
  }

  String get _baseUrl => AppConfig.socketUrl;

  // GET /api/builder/templates
  Future<List<Map<String, dynamic>>> getTemplates() async {
    try {
      final res = await http.get(
        Uri.parse('$_baseUrl/api/builder/templates?key=$_sessionKey'),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['valid'] == true) {
          return List<Map<String, dynamic>>.from(data['templates'] ?? []);
        }
      }
    } catch (_) {}
    return [];
  }

  // POST /api/builder/create
  Future<Map<String, dynamic>?> createBuild({
    required String type,
    required String appName,
    required String packageName,
    String? versionCode,
    String? versionName,
    String? icon,
    String? template,
    String? customHtml,
    String? customUrl,
  }) async {
    try {
      final res = await http.post(
        Uri.parse('$_baseUrl/api/builder/create'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'key': _sessionKey,
          'type': type,
          'appName': appName,
          'packageName': packageName,
          'versionCode': int.tryParse(versionCode ?? '1') ?? 1,
          'versionName': versionName ?? '1.0',
          'icon': icon,
          'template': template ?? 'blank',
          'customHtml': customHtml,
          'customUrl': customUrl,
        }),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['valid'] == true) {
          return data;
        }
      }
    } catch (_) {}
    return null;
  }

  // POST /api/builder/build/:id
  Future<bool> triggerBuild(String buildId) async {
    try {
      final res = await http.post(
        Uri.parse('$_baseUrl/api/builder/build/$buildId'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'key': _sessionKey}),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return data['valid'] == true;
      }
    } catch (_) {}
    return false;
  }

  // GET /api/builder/status/:id
  Future<Map<String, dynamic>?> getBuildStatus(String buildId) async {
    try {
      final res = await http.get(
        Uri.parse('$_baseUrl/api/builder/status/$buildId?key=$_sessionKey'),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['valid'] == true) return data;
      }
    } catch (_) {}
    return null;
  }

  // GET /api/builder/logs/:id (SSE stream)
  Stream<Map<String, dynamic>> streamLogs(String buildId) async* {
    final uri = Uri.parse('$_baseUrl/api/builder/logs/$buildId');
    final client = http.Client();

    try {
      final request = http.Request('GET', uri);
      final response = await client.send(request);

      if (response.statusCode != 200) return;

      String buffer = '';
      await for (final chunk in response.stream.transform(utf8.decoder)) {
        buffer += chunk;
        final lines = buffer.split('\n');
        buffer = lines.removeLast(); // Keep incomplete line in buffer

        for (final line in lines) {
          if (line.startsWith('data: ')) {
            try {
              final json = jsonDecode(line.substring(6));
              yield Map<String, dynamic>.from(json);

              // If build is done or error, close stream
              if (json['type'] == 'success' && json['message']?.contains('complete')) break;
              if (json['type'] == 'error') break;
            } catch (_) {}
          }
        }
      }
    } catch (_) {} finally {
      client.close();
    }
  }

  // GET /api/builder/download/:id
  Future<Map<String, dynamic>?> getDownloadUrl(String buildId) async {
    try {
      final res = await http.get(
        Uri.parse('$_baseUrl/api/builder/download/$buildId?key=$_sessionKey'),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['valid'] == true) return data;
      }
    } catch (_) {}
    return null;
  }

  // GET /api/builder/apks
  Future<List<Map<String, dynamic>>> getMyBuilds() async {
    try {
      final res = await http.get(
        Uri.parse('$_baseUrl/api/builder/apks?key=$_sessionKey'),
      ).timeout(const Duration(seconds: 10));

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data['valid'] == true) {
          return List<Map<String, dynamic>>.from(data['builds'] ?? []);
        }
      }
    } catch (_) {}
    return [];
  }
}
