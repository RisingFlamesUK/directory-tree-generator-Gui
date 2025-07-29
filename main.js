const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron'); // Add 'clipboard'
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

const userDataPath = app.getPath('userData');
const settingsFilePath = path.join(userDataPath, 'app-settings.json');

// Function to load settings
async function loadSettings() {
    try {
        const data = await fs.readFile(settingsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {}; // File not found, return empty settings
        }
        console.error('Error loading settings:', error);
        return {};
    }
}

// Function to save settings
async function saveSettings(settings) {
    try {
        await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

/**
 * Parses a .gitignore file content into an array of patterns.
 * Handles comments, empty lines, and basic glob patterns (for exact matches here).
 * For full .gitignore spec (wildcards, negation, etc.), a dedicated library like 'ignore' would be better.
 * For this simple case, we'll just extract exact names to ignore.
 */
async function getGitignorePatterns(rootPath) {
    const gitignorePath = path.join(rootPath, '.gitignore');
    let patterns = [];
    try {
        const content = await fs.readFile(gitignorePath, 'utf8');
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line.startsWith('#') || line === '') {
                return; // Ignore comments and empty lines
            }
            // For simplicity, we'll only consider exact folder/file names for now.
            // A more robust solution would use a glob matching library.
            // Remove leading slashes as we match against basename
            if (line.startsWith('/')) {
                line = line.substring(1);
            }
            // If it ends with a slash, it's a directory
            if (line.endsWith('/')) {
                line = line.slice(0, -1);
            }
            patterns.push(line);
        });
    } catch (error) {
        if (error.code !== 'ENOENT') { // Ignore if .gitignore doesn't exist
            console.warn(`Error reading .gitignore in ${rootPath}: ${error.message}`);
        }
    }
    return patterns; // Return unique patterns
}


// Helper function to recursively read directory (modified for ignore list and .gitignore logic)
async function readDirectoryRecursive(dirPath, ignoreList = [], useGitignore = false) {
    const name = path.basename(dirPath);

    // Combine ignore lists if .gitignore is used
    let combinedIgnoreList = new Set(ignoreList); // Use a Set for efficient lookups and uniqueness

    if (useGitignore) {
        // For a true recursive .gitignore, you'd load .gitignore files at each subdirectory level.
        // This simplified example currently gets the .gitignore patterns only for the 'rootPath'
        // passed into getGitignorePatterns. If you want .gitignore patterns to be applied
        // from subdirectories, the logic here would need to be more complex, potentially
        // re-calling getGitignorePatterns for 'dirPath' within the recursion.
        // For this example, we'll assume the provided 'getGitignorePatterns' function
        // is designed to operate on a single root for efficiency.
        const gitignorePatterns = await getGitignorePatterns(dirPath); // Get patterns for THIS directory
        gitignorePatterns.forEach(pattern => combinedIgnoreList.add(pattern));
    }

    // Check if the current directory name is in the ignore list
    if (combinedIgnoreList.has(name)) {
        return null; // Ignore this folder and its contents
    }

    let stats;
    try {
        stats = await fs.stat(dirPath);
    } catch (error) {
        console.warn(`Could not access ${dirPath}: ${error.message}`);
        return { name: `${name} (inaccessible)`, type: 'error' };
    }

    const node = { name, type: stats.isDirectory() ? 'folder' : 'file', children: [] };

    if (stats.isDirectory()) {
        const entries = await fs.readdir(dirPath);
        for (const entry of entries) {
            // Check if individual entry (file/folder) is in the ignore list
            if (combinedIgnoreList.has(entry)) {
                continue; // Skip this entry
            }

            const entryPath = path.join(dirPath, entry);
            // Pass the same combined ignore list down.
            // If you want subfolders to have their own .gitignore files that *add* to
            // the ignore rules, you'd need to modify `readDirectoryRecursive` to
            // load a new .gitignore for each subfolder path and merge its rules.
            const childNode = await readDirectoryRecursive(entryPath, Array.from(combinedIgnoreList), useGitignore);
            if (childNode) { // Only add if not ignored
                node.children.push(childNode);
            }
        }
    }
    return node;
}


function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

    // Open the DevTools.
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Main Handlers ---

// Handle folder selection dialog
ipcMain.handle('select-folder', async () => {
    const settings = await loadSettings();
    const defaultPath = settings.lastSelectedFolder || os.homedir();

    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        defaultPath: defaultPath
    });

    if (canceled) {
        return null;
    } else {
        const selectedPath = filePaths[0];
        // Save the last selected folder
        await saveSettings({ ...settings, lastSelectedFolder: selectedPath });
        return selectedPath;
    }
});

// Handle tree generation request (now accepts ignoreList and useGitignore)
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

// Handle saving tree to a file
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
    return { success: false, message: 'Save cancelled' };
});

// Handle loading tree from a file
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
    return { success: false, message: 'Load cancelled' };
});

// IPC handler to get initial settings (last selected folder)
ipcMain.handle('get-initial-settings', async () => {
    const settings = await loadSettings();
    return {
        lastSelectedFolder: settings.lastSelectedFolder || '',
        // Add default ignored folders here
        defaultIgnoredFolders: settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store'
    };
});

// New IPC handler for copying text to clipboard
ipcMain.handle('copy-to-clipboard', (event, text) => {
    try {
        clipboard.writeText(text);
        return { success: true, message: 'Content copied to clipboard!' };
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        return { success: false, message: `Failed to copy: ${error.message}` };
    }
});