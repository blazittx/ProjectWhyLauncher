const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { download } = require('electron-dl');
const extract = require('extract-zip');
const { spawn } = require('child_process');

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
  });

  mainWindow.loadURL(`file://${__dirname}/index.html`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.center();
};

const diabolicalLauncherPath = path.join(os.homedir(), 'AppData', 'Local', 'Diabolical Launcher');

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

async function downloadAndOpenGame() {
  const gameId = 'ProjectWhy';
  const platform = 'StandaloneWindows64';
  const gameUrl = `https://objectstorage.eu-frankfurt-1.oraclecloud.com/n/frks8kdvmjog/b/DiabolicalGamesStorage/o/${gameId}/Versions/Build-${platform}-0.0.3.zip`;

  try {
    mainWindow.webContents.send('update-status', 'Starting download...');
    let spinnerIndex = 0;
    const spinnerFrames = ['/', '-', '\\', '|'];
    const spinnerInterval = setInterval(() => {
      mainWindow.webContents.send('spinner-update', spinnerFrames[spinnerIndex]);
      spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
    }, 100);

    const dl = await download(mainWindow, gameUrl, {
      directory: diabolicalLauncherPath,
      onProgress: (progress) => {
        const progressPercentage = Math.round(progress.percent * 100);
        mainWindow.webContents.send('download-progress', progressPercentage);
      },
    });

    clearInterval(spinnerInterval);
    mainWindow.webContents.send('update-status', 'Extracting files...');
    const extractPath = path.join(diabolicalLauncherPath, gameId);
    const executablePath = await extractZip(dl.getSavePath(), extractPath);
    mainWindow.webContents.send('update-status', 'Launching game...');

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
  } catch (error) {
    mainWindow.webContents.send('update-status', 'Error occurred');
    console.error('Download or Extraction error:', error);
  }
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
