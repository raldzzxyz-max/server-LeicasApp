const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BUILDS_DIR = path.join(__dirname, '../../builds');
const TEMPLATES_DIR = path.join(__dirname, '../../templates');

const GITHUB_REPO = 'raldzzxyz-max/server-LeicasApp';
const GITHUB_API = 'https://api.github.com';

if (!fs.existsSync(BUILDS_DIR)) fs.mkdirSync(BUILDS_DIR, { recursive: true });

// ============================================================
// LOG STORAGE (in-memory per build)
// ============================================================
const buildLogs = {};
const buildStartTimes = {};

function addLog(buildId, message, type = 'info') {
  if (!buildLogs[buildId]) buildLogs[buildId] = [];
  const elapsed = getElapsedTime(buildId);
  buildLogs[buildId].push({ time: elapsed, message, type, ts: Date.now() });
  console.log(`[APK-BUILDER] [${elapsed}] ${message}`);
}

function getLogs(buildId) {
  return buildLogs[buildId] || [];
}

function getLogStream(buildId) {
  return buildLogs[buildId] || [];
}

function clearLogs(buildId) {
  delete buildLogs[buildId];
  delete buildStartTimes[buildId];
}

function getElapsedTime(buildId) {
  if (!buildStartTimes[buildId]) return '00:00:00';
  const ms = Date.now() - buildStartTimes[buildId];
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function getProgress(buildId) {
  if (!buildStartTimes[buildId]) return 0;
  const logs = buildLogs[buildId] || [];
  if (logs.some(l => l.message.includes('complete') || l.message.includes('✅'))) return 100;
  if (logs.some(l => l.message.includes('error') || l.message.includes('❌'))) return -1;
  // Estimate based on log count (7 steps = 100%)
  return Math.min(Math.floor((logs.length / 7) * 100), 99);
}

// ============================================================
// BUILD ID GENERATOR
// ============================================================
function generateBuildId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

// ============================================================
// GITHUB API
// ============================================================
function getGithubToken() {
  return process.env.BUILD_TOKEN || process.env.GITHUB_TOKEN || '';
}

async function triggerGitHubBuild(buildId, config) {
  const token = getGithubToken();
  if (!token) {
    throw new Error('GITHUB_TOKEN not set');
  }

  const configBase64 = Buffer.from(JSON.stringify({ ...config, buildId })).toString('base64');

  const res = await axios.post(
    `${GITHUB_API}/repos/${GITHUB_REPO}/actions/workflows/build-apk.yml/dispatches`,
    {
      ref: 'main',
      inputs: {
        build_id: buildId,
        config_json: configBase64,
      }
    },
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
      timeout: 10000,
    }
  );

  return res.status === 204;
}

async function checkGitHubBuildStatus(buildId) {
  const token = getGithubToken();
  if (!token) return { status: 'error', message: 'No GitHub token' };

  try {
    // Search by tag (tag_name = build-{buildId}) which is more reliable
    const res = await axios.get(
      `${GITHUB_API}/repos/${GITHUB_REPO}/releases/tags/build-${buildId}`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: 10000,
      }
    );

    // Release exists = build done
    const assets = res.data.assets || [];
    if (assets.length > 0) {
      const apkAsset = assets.find(a => a.name.endsWith('.apk'));
      if (apkAsset) {
        return { status: 'done', downloadUrl: apkAsset.browser_download_url, conclusion: 'success' };
      }
    }
    return { status: 'done', downloadUrl: res.data.zipball_url, conclusion: 'success' };
  } catch (e) {
    if (e.response && e.response.status === 404) {
      // No release yet, check workflow runs
      try {
        const runsRes = await axios.get(
          `${GITHUB_API}/repos/${GITHUB_REPO}/actions/workflows/build-apk.yml/runs?per_page=5`,
          {
            headers: {
              Authorization: `token ${token}`,
              Accept: 'application/vnd.github.v3+json',
            },
            timeout: 10000,
          }
        );

        const runs = runsRes.data.workflow_runs || [];
        // Find the most recent run (they're sorted newest first)
        const run = runs[0];
        if (!run) return { status: 'pending', message: 'Waiting for workflow...' };

        if (run.status === 'completed') {
          if (run.conclusion === 'success') {
            return { status: 'done', downloadUrl: `https://github.com/${GITHUB_REPO}/releases/download/build-${buildId}/app.apk`, conclusion: 'success' };
          } else {
            return { status: 'error', message: `Build failed: ${run.conclusion}` };
          }
        }

        return { status: 'building', message: run.status, conclusion: null };
      } catch (e2) {
        return { status: 'pending', message: 'Checking workflow...' };
      }
    }
    return { status: 'error', message: e.message };
  }
}

async function getBuildLogsFromGitHub(buildId) {
  const token = getGithubToken();
  if (!token) return [];

  try {
    const res = await axios.get(
      `${GITHUB_API}/repos/${GITHUB_REPO}/actions/runs?head_branch=build-${buildId}&per_page=1`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
        timeout: 10000,
      }
    );

    const runs = res.data.workflow_runs || [];
    if (runs.length === 0) return [];

    const run = runs[0];
    const jobsRes = await axios.get(run.jobs_url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    const jobs = jobsRes.data.jobs || [];
    const logs = [];

    for (const job of jobs) {
      for (const step of job.steps || []) {
        const status = step.conclusion === 'success' ? '✅' :
                       step.conclusion === 'failure' ? '❌' : '⏳';
        logs.push({
          time: '',
          message: `${status} ${step.name}`,
          type: step.conclusion === 'success' ? 'success' :
                step.conclusion === 'failure' ? 'error' : 'info',
        });
      }
    }

    return logs;
  } catch (e) {
    return [];
  }
}

// ============================================================
// BUILD MANAGEMENT
// ============================================================
async function buildApk(buildId, config) {
  buildStartTimes[buildId] = Date.now();
  clearLogs(buildId);

  const buildDir = path.join(BUILDS_DIR, buildId);
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  // Save config
  const configPath = path.join(buildDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ ...config, buildId }, null, 2));

  // Save status
  const statusPath = path.join(buildDir, 'status.json');
  const saveStatus = (status, progress) => {
    fs.writeFileSync(statusPath, JSON.stringify({ status, progress, buildId }, null, 2));
  };

  try {
    addLog(buildId, 'Config saved', 'success');
    saveStatus('building', 10);

    addLog(buildId, 'Triggering GitHub Actions...', 'info');
    const triggered = await triggerGitHubBuild(buildId, config);

    if (!triggered) {
      addLog(buildId, 'Failed to trigger GitHub Actions', 'error');
      saveStatus('error', 0);
      return { success: false, error: 'Failed to trigger build' };
    }

    addLog(buildId, 'Build triggered! Monitoring progress...', 'success');
    saveStatus('building', 20);

    // Start polling in background
    pollBuildStatus(buildId);

    return { success: true, buildId };
  } catch (e) {
    addLog(buildId, `Error: ${e.message}`, 'error');
    saveStatus('error', 0);
    return { success: false, error: e.message };
  }
}

async function pollBuildStatus(buildId) {
  const statusPath = path.join(BUILDS_DIR, buildId, 'status.json');
  let lastStepCount = 0;

  const poll = async () => {
    try {
      const ghStatus = await checkGitHubBuildStatus(buildId);

      // Fetch logs from GitHub
      const ghLogs = await getBuildLogsFromGitHub(buildId);
      if (ghLogs.length > lastStepCount) {
        for (let i = lastStepCount; i < ghLogs.length; i++) {
          addLog(buildId, ghLogs[i].message, ghLogs[i].type);
        }
        lastStepCount = ghLogs.length;
      }

      const progress = getProgress(buildId);

      if (ghStatus.status === 'done') {
        addLog(buildId, 'Build complete! APK ready for download.', 'success');
        fs.writeFileSync(statusPath, JSON.stringify({
          status: 'done', progress: 100, buildId, downloadUrl: ghStatus.downloadUrl
        }, null, 2));
        return;
      }

      if (ghStatus.status === 'error') {
        addLog(buildId, `Build failed: ${ghStatus.message}`, 'error');
        fs.writeFileSync(statusPath, JSON.stringify({
          status: 'error', progress, buildId, error: ghStatus.message
        }, null, 2));
        return;
      }

      // Still building, poll again in 3 seconds
      fs.writeFileSync(statusPath, JSON.stringify({
        status: 'building', progress, buildId
      }, null, 2));
      setTimeout(poll, 3000);
    } catch (e) {
      setTimeout(poll, 5000);
    }
  };

  poll();
}

function getBuildStatus(buildId) {
  const statusPath = path.join(BUILDS_DIR, buildId, 'status.json');
  if (!fs.existsSync(statusPath)) return null;
  return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
}

function listBuilds() {
  if (!fs.existsSync(BUILDS_DIR)) return [];
  return fs.readdirSync(BUILDS_DIR)
    .filter(f => fs.statSync(path.join(BUILDS_DIR, f)).isDirectory())
    .map(id => {
      const status = getBuildStatus(id);
      const configPath = path.join(BUILDS_DIR, id, 'config.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
      return {
        id,
        ...(status || { status: 'unknown' }),
        appName: config.appName,
        packageName: config.packageName,
        type: config.type,
        createdAt: config.createdAt,
      };
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function getApkUrl(buildId) {
  // Try to get the real URL from status.json first (set by GitHub release)
  const statusPath = path.join(BUILDS_DIR, buildId, 'status.json');
  if (fs.existsSync(statusPath)) {
    try {
      const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      if (status.downloadUrl) return status.downloadUrl;
    } catch (_) {}
  }
  // Fallback
  return `https://github.com/${GITHUB_REPO}/releases/download/build-${buildId}/app.apk`;
}

// ============================================================
// TEMPLATES
// ============================================================
function getTemplateList() {
  if (!fs.existsSync(TEMPLATES_DIR)) return [];
  return fs.readdirSync(TEMPLATES_DIR)
    .filter(f => fs.statSync(path.join(TEMPLATES_DIR, f)).isDirectory())
    .map(id => {
      const metaPath = path.join(TEMPLATES_DIR, id, 'meta.json');
      let meta = { id, name: id, description: '' };
      if (fs.existsSync(metaPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) }; } catch (_) {}
      }
      return meta;
    });
}

module.exports = {
  buildApk,
  getBuildStatus,
  listBuilds,
  getApkUrl,
  getTemplateList,
  generateBuildId,
  addLog,
  getLogs,
  getElapsedTime,
  getProgress,
  clearLogs,
  buildStartTimes,
};
