// --- Module Imports ---
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Using promise-based file system methods
const os = require('os'); // For getting the user's home directory

// --- Configuration and Constants ---
// Path to store application-specific user data (e.g., settings)
const userDataPath = app.getPath('userData');
const settingsFilePath = path.join(userDataPath, 'app-settings.json');

// --- Helper Functions - Settings Management ---

/**
 * Loads application settings from a JSON file.
 * If the file does not exist, an empty object is returned.
 * @returns {Promise<Object>} A promise that resolves with the settings object.
 */
async function loadSettings() {
    try {
        const data = await fs.readFile(settingsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Settings file not found, which is normal on first run
            return {};
        }
        console.error('Error loading settings:', error);
        return {}; // Return empty settings on other errors
    }
}

/**
 * Saves application settings to a JSON file.
 * @param {Object} settings - The settings object to save.
 * @returns {Promise<void>} A promise that resolves when settings are saved.
 */
async function saveSettings(settings) {
    try {
        await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// --- Helper Functions - File System Traversal ---

/**
 * Parses a .gitignore file content into an array of patterns for exact matching.
 * This implementation is simplified and primarily handles direct folder/file names.
 * For full .gitignore spec (wildcards, negation, etc.), a dedicated library
 * like 'ignore' would be required.
 * @param {string} rootPath - The path to the directory potentially containing a .gitignore file.
 * @returns {Promise<string[]>} A promise that resolves with an array of ignore patterns.
 */
async function getGitignorePatterns(rootPath) {
    const gitignorePath = path.join(rootPath, '.gitignore');
    let patterns = [];
    try {
        const content = await fs.readFile(gitignorePath, 'utf8');
        content.split('\n').forEach(line => {
            line = line.trim();
            // Ignore comments and empty lines
            if (line.startsWith('#') || line === '') {
                return;
            }
            // Remove leading slashes as we match against basename
            if (line.startsWith('/')) {
                line = line.substring(1);
            }
            // Remove trailing slashes (indicates directory) as basename won't have it
            if (line.endsWith('/')) {
                line = line.slice(0, -1);
            }
            patterns.push(line);
        });
    } catch (error) {
        // Ignore if .gitignore doesn't exist (ENOENT)
        if (error.code !== 'ENOENT') {
            console.warn(`Error reading .gitignore in ${rootPath}: ${error.message}`);
        }
    }
    return patterns;
}

/**
 * Recursively reads a directory and builds a tree structure.
 * Applies a given ignore list and optionally integrates .gitignore patterns.
 * @param {string} dirPath - The path of the directory to scan.
 * @param {string[]} ignoreList - An array of folder/file names to explicitly ignore.
 * @param {boolean} useGitignore - True if .gitignore rules should be applied.
 * @returns {Promise<Object|null>} A promise that resolves with the tree node object,
 * or null if the directory itself is ignored.
 */
async function readDirectoryRecursive(dirPath, ignoreList = [], useGitignore = false) {
    const name = path.basename(dirPath);

    // Combine explicit ignore list with .gitignore patterns if enabled
    let combinedIgnoreList = new Set(ignoreList);

    if (useGitignore) {
        // Get .gitignore patterns for the current directory
        const gitignorePatterns = await getGitignorePatterns(dirPath);
        gitignorePatterns.forEach(pattern => combinedIgnoreList.add(pattern));
    }

    // Check if the current directory name should be ignored
    if (combinedIgnoreList.has(name)) {
        return null; // Ignore this folder and its contents
    }

    let stats;
    try {
        stats = await fs.stat(dirPath);
    } catch (error) {
        // Handle inaccessible files/folders
        console.warn(`Could not access ${dirPath}: ${error.message}`);
        return { name: `${name} (inaccessible)`, type: 'error' };
    }

    // Create the node for the current directory/file
    const node = { name, type: stats.isDirectory() ? 'folder' : 'file', children: [] };

    if (stats.isDirectory()) {
        const entries = await fs.readdir(dirPath);
        for (const entry of entries) {
            // Check if individual entry (file/folder) should be ignored
            if (combinedIgnoreList.has(entry)) {
                continue; // Skip this entry
            }

            const entryPath = path.join(dirPath, entry);
            // Recursively read child node, passing the (potentially updated) combined ignore list
            const childNode = await readDirectoryRecursive(entryPath, Array.from(combinedIgnoreList), useGitignore);
            if (childNode) {
                node.children.push(childNode);
            }
        }
    }
    return node;
}

// --- Electron Window Management ---

/**
 * Creates the main Electron browser window.
 */
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            // Preload script to securely expose Node.js functionalities to the renderer
            preload: path.join(__dirname, 'preload.js'),
            // Disable Node.js integration directly in renderer for security
            nodeIntegration: false,
            // Isolate JavaScript contexts to prevent prototype pollution and other attacks
            contextIsolation: true,
        }
    });

    // Load the HTML file for the user interface
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

    // Open the DevTools for debugging (uncomment in development)
    // mainWindow.webContents.openDevTools();
}

// --- Electron App Lifecycle Events ---

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
    createWindow();

    // On macOS, recreate a window when the dock icon is clicked and no other windows are open.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Main Handlers ---
// These handlers facilitate communication between the renderer process (UI)
// and the main process (Node.js backend).

/**
 * Handles the request to open a native folder selection dialog.
 * @returns {Promise<string|null>} A promise that resolves with the selected folder path, or null if cancelled.
 */
ipcMain.handle('select-folder', async () => {
    const settings = await loadSettings();
    // Set default path to last selected folder or user's home directory
    const defaultPath = settings.lastSelectedFolder || os.homedir();

    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        defaultPath: defaultPath
    });

    if (canceled) {
        return null;
    } else {
        const selectedPath = filePaths[0];
        // Save the newly selected folder as the last used path
        await saveSettings({ ...settings, lastSelectedFolder: selectedPath });
        return selectedPath;
    }
});

/**
 * Handles the request to generate the directory tree.
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {string} folderPath - The root path of the folder to scan.
 * @param {string[]} ignoreList - An array of folder/file names to ignore.
 * @param {boolean} useGitignore - Whether to incorporate .gitignore rules.
 * @returns {Promise<Object>} A promise that resolves with the generated tree structure.
 * @throws {Error} If the folder path is missing or tree generation fails.
 */
ipcMain.handle('generate-tree', async (event, folderPath, ignoreList, useGitignore) => {
    if (!folderPath) {
        throw new Error('Folder path is required.');
    }
    try {
        const tree = await readDirectoryRecursive(folderPath, ignoreList, useGitignore);
        return tree;
    } catch (error) {
        console.error('Error generating tree:', error);
        throw new Error(`Failed to generate tree: ${error.message}`);
    }
});

/**
 * Handles the request to save the current tree structure to a JSON file.
 * Opens a native save file dialog.
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {Object} treeData - The tree data object to save.
 * @returns {Promise<Object>} A promise that resolves with success status and message.
 * @throws {Error} If saving the file fails.
 */
ipcMain.handle('save-tree-file', async (event, treeData) => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Save Directory Tree',
        defaultPath: 'directory_tree.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (filePath) {
        try {
            await fs.writeFile(filePath, JSON.stringify(treeData, null, 2));
            return { success: true, message: 'Tree saved successfully!' };
        } catch (error) {
            console.error('Error saving file:', error);
            throw new Error(`Failed to save file: ${error.message}`);
        }
    }
    return { success: false, message: 'Save cancelled' }; // User cancelled the dialog
});

/**
 * Handles the request to load a tree structure from a JSON file.
 * Opens a native open file dialog.
 * @returns {Promise<Object>} A promise that resolves with success status and the loaded tree, or cancellation status.
 * @throws {Error} If loading or parsing the file fails.
 */
ipcMain.handle('load-tree-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (!canceled && filePaths.length > 0) {
        try {
            const data = await fs.readFile(filePaths[0], 'utf8');
            const tree = JSON.parse(data);
            return { success: true, tree };
        } catch (error) {
            console.error('Error loading or parsing file:', error);
            throw new Error(`Failed to load file: ${error.message}`);
        }
    }
    return { success: false, message: 'Load cancelled' }; // User cancelled the dialog
});

/**
 * Handles the request to get initial application settings for the renderer process.
 * @returns {Promise<Object>} A promise that resolves with an object containing initial settings.
 */
ipcMain.handle('get-initial-settings', async () => {
    const settings = await loadSettings();
    return {
        lastSelectedFolder: settings.lastSelectedFolder || '',
        defaultIgnoredFolders: settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store'
    };
});