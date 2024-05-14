const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { download } = require('electron-dl');
const extract = require('extract-zip');
const { spawn, execFileSync } = require('child_process');
const fetch = require('node-fetch');
const crypto = require('crypto');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false,
    icon: 'path/to/your/icon.ico',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    resizable: false,
    transparent: true,
  });

  mainWindow.loadURL(`file://${__dirname}/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.center();
};

const diabolicalLauncherPath = path.join(os.homedir(), 'AppData', 'Local', 'Diabolical Launcher');
const gameInstallPath = path.join(diabolicalLauncherPath, 'ProjectWhy');
const versionFilePath = path.join(gameInstallPath, 'version.txt');
const pathToXdelta3 = path.join(__dirname, 'bin', 'xdelta3.exe'); // Use the local xdelta3 executable

async function extractZip(zipPath, extractPath) {
  try {
    await extract(zipPath, { dir: extractPath });
    fs.unlinkSync(zipPath); // Delete the zip file after extraction

    const executablePath = path.join(extractPath, 'StandaloneWindows64.exe');
    return executablePath;
  } catch (error) {
    console.error('Extraction error:', error);
    throw error;
  }
}

async function getLatestGameVersion() {
  const apiUrl = 'https://objectstorage.eu-frankfurt-1.oraclecloud.com/n/frks8kdvmjog/b/DiabolicalGamesStorage/o/';
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    const versions = data.objects
      .map(obj => obj.name)
      .filter(name => name.startsWith('ProjectWhy/Versions/Build-StandaloneWindows64-'))
      .map(name => {
        const versionMatch = name.match(/Build-StandaloneWindows64-(\d+\.\d+\.\d+)\.zip$/);
        return versionMatch ? versionMatch[1] : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    const latestVersion = versions[0];
    const latestVersionUrl = `https://frks8kdvmjog.objectstorage.eu-frankfurt-1.oci.customer-oci.com/p/suRf4hOSm9II9YuoH_LuoZYletMaP59e2cIR1UXo84Pa6Hi26oo5VlWAT_XDt5R5/n/frks8kdvmjog/b/DiabolicalGamesStorage/o/ProjectWhy/Versions/Build-StandaloneWindows64-${latestVersion}.zip`;

    return { latestVersion, latestVersionUrl };
  } catch (error) {
    console.error('Failed to fetch the latest game version:', error);
    throw error;
  }
}

function getInstalledVersion() {
  if (fs.existsSync(versionFilePath)) {
    return fs.readFileSync(versionFilePath, 'utf8').trim();
  }
  return null;
}

async function downloadPatch(patchUrl) {
  mainWindow.webContents.send('update-status', 'Downloading patch...');
  const patchFilePath = path.join(diabolicalLauncherPath, 'patch.vcdiff');
  await download(mainWindow, patchUrl, {
    directory: diabolicalLauncherPath,
    filename: 'patch.vcdiff',
    onProgress: (progress) => {
      const progressPercentage = Math.round(progress.percent * 100);
      mainWindow.webContents.send('download-progress', progressPercentage);
    },
  });
  return patchFilePath;
}

function verifyFile(filePath, expectedHash) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha1');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('hex');
  return hex === expectedHash;
}

async function downloadAndOpenGame() {
  try {
    const { latestVersion, latestVersionUrl } = await getLatestGameVersion();
    const installedVersion = getInstalledVersion();

    if (installedVersion === latestVersion) {
      mainWindow.webContents.send('update-status', 'Latest version already installed. Launching game...');
      const executablePath = path.join(gameInstallPath, 'StandaloneWindows64.exe');
      launchGame(executablePath);
      return;
    }

    if (installedVersion) {
      // If there's an installed version, attempt to download and apply the patch
      const patchUrl = `https://frks8kdvmjog.objectstorage.eu-frankfurt-1.oci.customer-oci.com/p/suRf4hOSm9II9YuoH_LuoZYletMaP59e2cIR1UXo84Pa6Hi26oo5VlWAT_XDt5R5/n/frks8kdvmjog/b/DiabolicalGamesStorage/o/ProjectWhy/Patches/Patch-StandaloneWindows64-${installedVersion}-to-${latestVersion}.vcdiff`;
      try {
        const patchFilePath = await downloadPatch(patchUrl);

        // Verify the source file size and integrity
        const sourceFilePath = path.join(gameInstallPath, 'StandaloneWindows64.exe');
        const sourceFileStats = fs.statSync(sourceFilePath);
        console.log(`Source file size: ${sourceFileStats.size} bytes`);
        if (sourceFileStats.size < 1000) { // Arbitrary minimum size for sanity check
          throw new Error('Source file is too small, likely corrupted');
        }

        applyPatch(patchFilePath);

        // Verify the patched file
        const expectedHash = 'expected_sha1_hash_of_the_new_version'; // Replace with the actual expected hash
        const executablePath = path.join(gameInstallPath, 'StandaloneWindows64.exe');
        if (!verifyFile(executablePath, expectedHash)) {
          throw new Error('Patched file verification failed');
        }

        // Write the latest version to version.txt
        fs.writeFileSync(versionFilePath, latestVersion);
        mainWindow.webContents.send('update-status', 'Patch applied and verified. Launching game...');
        launchGame(executablePath);
        mainWindow.webContents.send('download-complete');
        return;
      } catch (error) {
        console.error('Failed to apply patch:', error);
        mainWindow.webContents.send('update-status', 'Patch not available or failed. Downloading full version...');
      }
    }

    // Fallback: Download full version if patch is not available or fails
    mainWindow.webContents.send('update-status', 'Starting download...');
    let spinnerIndex = 0;
    const spinnerFrames = ['/', '-', '\\', '|'];
    const spinnerInterval = setInterval(() => {
      mainWindow.webContents.send('spinner-update', spinnerFrames[spinnerIndex]);
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
    }, 100);

    const dl = await download(mainWindow, latestVersionUrl, {
      directory: diabolicalLauncherPath,
      onProgress: (progress) => {
        const progressPercentage = Math.round(progress.percent * 100);
        mainWindow.webContents.send('download-progress', progressPercentage);
      },
    });

    clearInterval(spinnerInterval);
    mainWindow.webContents.send('update-status', 'Extracting files...');
    const executablePath = await extractZip(dl.getSavePath(), gameInstallPath);
    
    // Write the latest version to version.txt
    fs.writeFileSync(versionFilePath, latestVersion);

    mainWindow.webContents.send('update-status', 'Launching game...');
    launchGame(executablePath);

    // Signal that download and extraction is complete
    mainWindow.webContents.send('download-complete');
  } catch (error) {
    mainWindow.webContents.send('update-status', 'Error occurred');
    console.error('Download or Extraction error:', error);
  }
}

function applyPatch(patchFilePath) {
  try {
    mainWindow.webContents.send('update-status', 'Applying patch...');
    console.log(`Applying patch from ${patchFilePath}`);
    execFileSync(pathToXdelta3, ['-d', '-s', path.join(gameInstallPath, 'StandaloneWindows64.exe'), patchFilePath, path.join(gameInstallPath, 'StandaloneWindows64.exe')]);
    fs.unlinkSync(patchFilePath); // Delete the patch file after applying
  } catch (error) {
    console.error('Failed to apply patch:', error);
    throw error;
  }
}

function launchGame(executablePath) {
  const gameProcess = spawn(executablePath, [], { detached: true, stdio: 'ignore' });
  gameProcess.unref();

  gameProcess.on('error', (err) => {
    console.error('Failed to start game:', err);
    mainWindow.webContents.send('update-status', 'Failed to start game.');
  });

  gameProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Game process exited with code ${code}`);
      mainWindow.webContents.send('update-status', 'Game exited unexpectedly.');
    } else {
      mainWindow.webContents.send('update-status', 'Game launched...');
      setTimeout(() => {
        app.quit(); // Close the Electron app after a short delay
      }, 1000);
    }
  });

  mainWindow.webContents.send('update-status', 'Game launched...');
  setTimeout(() => {
    app.quit(); // Close the Electron app after a short delay
  }, 1000);
}

app.on('ready', () => {
  createWindow();
  downloadAndOpenGame();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});
