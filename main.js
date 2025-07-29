// --- Module Imports ---
const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron'); // Electron modules
const path = require('path');     // Node.js module for path manipulation
const fs = require('fs').promises; // Node.js File System module with promise-based API for async operations
const os = require('os');         // Node.js OS module for operating system specific details

// --- Application Settings Configuration ---
const userDataPath = app.getPath('userData'); // Get Electron's user data directory (OS-specific)
const settingsFilePath = path.join(userDataPath, 'app-settings.json'); // Path to store application settings

// --- Settings Management Functions ---

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
            return {}; // File not found, return empty settings
        }
        console.error('Error loading settings:', error);
        return {}; // Return empty object on other errors to prevent app crash
    }
}

/**
 * Saves application settings to a JSON file.
 * @param {Object} settings - The settings object to save.
 * @returns {Promise<void>} A promise that resolves when settings are saved.
 */
async function saveSettings(settings) {
    try {
        // Write settings object to file, formatted with 2 spaces for readability
        await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

// --- .gitignore Parsing Function ---

/**
 * Parses a .gitignore file content into an array of patterns.
 * This simplified implementation handles comments, empty lines, and extracts
 * exact folder/file names (removes leading/trailing slashes).
 * For full .gitignore spec (wildcards, negation, etc.), a dedicated library like 'ignore' would be more robust.
 * @param {string} rootPath - The path to the directory containing the .gitignore file.
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
            // If it ends with a slash, it's typically a directory, remove for basename match
            if (line.endsWith('/')) {
                line = line.slice(0, -1);
            }
            patterns.push(line);
        });
    } catch (error) {
        // Ignore if .gitignore doesn't exist (ENOENT error)
        if (error.code !== 'ENOENT') {
            console.warn(`Error reading .gitignore in ${rootPath}: ${error.message}`);
        }
    }
    return patterns;
}

// --- Directory Tree Generation Function ---

/**
 * Recursively reads a directory and builds a hierarchical tree structure.
 * Applies both explicit ignore list and .gitignore patterns found in directories.
 * @param {string} dirPath - The current directory path to read.
 * @param {string} initialRootPath - The original root path from which the tree generation started. Used for root-specific logic.
 * @param {string[]} ignoreList - An array of explicit folder/file names to ignore.
 * @param {boolean} useGitignore - Whether to apply .gitignore rules.
 * @returns {Promise<Object|null>} A promise that resolves with the tree node object or null if the path is ignored.
 */
async function readDirectoryRecursive(dirPath, initialRootPath, ignoreList = [], useGitignore = false) {
    const name = path.basename(dirPath); // Get the name of the current directory/file
    const isRootCall = dirPath === initialRootPath; // Check if this is the very first call for the root folder

    // Combine all ignore patterns into a Set for efficient lookups
    let combinedIgnoreSet = new Set(ignoreList);
    if (useGitignore) {
        // Get .gitignore patterns for the *current* directory
        const gitignorePatterns = await getGitignorePatterns(dirPath);
        gitignorePatterns.forEach(pattern => combinedIgnoreSet.add(pattern));
    }

    // If this is not the initial root call and the current item is in the combined ignore list,
    // then ignore it and its contents by returning null.
    if (!isRootCall && combinedIgnoreSet.has(name)) {
        return null;
    }

    let stats;
    try {
        stats = await fs.stat(dirPath); // Get file/directory stats
    } catch (error) {
        console.warn(`Could not access ${dirPath}: ${error.message}`);
        // If the root directory itself is inaccessible, throw an error to the caller
        if (isRootCall) {
            throw new Error(`Cannot access selected folder: ${error.message}`);
        }
        // For subdirectories, return an error node
        return { name: `${name} (inaccessible)`, type: 'error' };
    }

    // If it's a file
    if (stats.isFile()) {
        // If a file's name is in the ignore list, return null
        if (combinedIgnoreSet.has(name)) {
            return null;
        }
        return { name, type: 'file' }; // Return file node
    }

    // If it's a directory
    const node = { name, type: 'folder', children: [] };
    let entries;
    try {
        entries = await fs.readdir(dirPath); // Read directory contents
    } catch (error) {
        console.warn(`Could not read directory ${dirPath}: ${error.message}`);
        return { name: `${name} (cannot read)`, type: 'error' }; // Return error node for unreadable directories
    }

    // Process each entry in the directory
    for (const entry of entries) {
        // Check if the individual entry (file/folder) itself should be ignored
        if (combinedIgnoreSet.has(entry)) {
            continue; // Skip this entry
        }

        const entryPath = path.join(dirPath, entry);
        // Recursively call for children, passing the original root path
        const childNode = await readDirectoryRecursive(entryPath, initialRootPath, Array.from(combinedIgnoreSet), useGitignore);
        if (childNode) { // Only add if not ignored (returned null)
            node.children.push(childNode);
        }
    }

    // The root node should always be returned, even if it ends up with no children
    // due to all children being ignored.
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
            preload: path.join(__dirname, 'preload.js'), // Path to the preload script
            nodeIntegration: false, // Disable Node.js integration in renderer for security
            contextIsolation: true, // Isolate preload script context from renderer for security
        }
    });

    // Load the HTML file for the renderer process
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

    // Optionally open DevTools for debugging (commented out by default)
    // mainWindow.webContents.openDevTools();
}

// --- Application Lifecycle Events ---

// When Electron is ready, create the main window
app.whenReady().then(() => {
    createWindow();

    // On macOS, re-create a window when the dock icon is clicked and no other windows are open.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit the app when all windows are closed, unless on macOS (where apps often stay open in dock)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC Main Handlers ---
// These handlers respond to messages from the renderer process via `ipcRenderer.invoke`

/**
 * Handles the 'select-folder' IPC call from the renderer.
 * Opens a native folder selection dialog and saves the selected path to settings.
 * @returns {Promise<string|null>} Resolves with the selected folder path or null if cancelled.
 */
ipcMain.handle('select-folder', async () => {
    const settings = await loadSettings(); // Load current settings
    // Set default dialog path to the last selected folder or user's home directory
    const defaultPath = settings.lastSelectedFolder || os.homedir();

    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'], // Only allow selecting directories
        defaultPath: defaultPath
    });

    if (canceled) {
        return null; // User cancelled the dialog
    } else {
        const selectedPath = filePaths[0];
        // Save the newly selected folder for future use
        await saveSettings({ ...settings, lastSelectedFolder: selectedPath });
        return selectedPath;
    }
});

/**
 * Handles the 'generate-tree' IPC call from the renderer.
 * Generates a directory tree structure for the given folder path.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object (unused here).
 * @param {string} folderPath - The root path to generate the tree from.
 * @param {string[]} ignoreList - Explicit list of names to ignore.
 * @param {boolean} useGitignore - Flag to indicate if .gitignore should be used.
 * @returns {Promise<Object>} Resolves with the generated tree structure.
 * @throws {Error} If folder path is missing or access fails.
 */
ipcMain.handle('generate-tree', async (event, folderPath, ignoreList, useGitignore) => {
    if (!folderPath) {
        throw new Error('Folder path is required.');
    }
    try {
        // Call the recursive function, passing folderPath as both current and initial root
        const tree = await readDirectoryRecursive(folderPath, folderPath, ignoreList, useGitignore);
        
        // Ensure that even if the tree is effectively empty (e.g., all children ignored),
        // a valid root object is returned, reflecting the chosen folder.
        if (!tree) {
             return {
                name: path.basename(folderPath),
                type: 'folder',
                children: []
            };
        }
        return tree;
    } catch (error) {
        console.error('Error generating tree:', error);
        throw new Error(`Failed to generate tree: ${error.message}`);
    }
});

/**
 * Handles the 'save-tree-file' IPC call from the renderer.
 * Opens a native save dialog and writes the provided tree data to a JSON file.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object (unused here).
 * @param {Object} treeData - The tree data object to save.
 * @returns {Promise<Object>} Resolves with a status object.
 */
ipcMain.handle('save-tree-file', async (event, treeData) => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Save Directory Tree',
        defaultPath: 'directory_tree.json', // Suggested file name
        filters: [{ name: 'JSON Files', extensions: ['json'] }] // Only allow JSON files
    });

    if (filePath) {
        try {
            await fs.writeFile(filePath, JSON.stringify(treeData, null, 2)); // Save with pretty printing
            return { success: true, message: 'Tree saved successfully!' };
        } catch (error) {
            console.error('Error saving file:', error);
            throw new Error(`Failed to save file: ${error.message}`);
        }
    }
    return { success: false, message: 'Save cancelled' }; // User cancelled save dialog
});

/**
 * Handles the 'load-tree-file' IPC call from the renderer.
 * Opens a native open dialog and reads a JSON tree file.
 * @returns {Promise<Object>} Resolves with a status object containing the loaded tree or an error message.
 */
ipcMain.handle('load-tree-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'], // Only allow selecting files
        filters: [{ name: 'JSON Files', extensions: ['json'] }] // Only allow JSON files
    });

    if (!canceled && filePaths.length > 0) {
        try {
            const data = await fs.readFile(filePaths[0], 'utf8'); // Read file content
            const tree = JSON.parse(data); // Parse JSON data
            return { success: true, tree };
        } catch (error) {
            console.error('Error loading or parsing file:', error);
            throw new Error(`Failed to load file: ${error.message}`);
        }
    }
    return { success: false, message: 'Load cancelled' }; // User cancelled load dialog
});

/**
 * Handles the 'get-initial-settings' IPC call from the renderer.
 * Provides initial application settings, including the last selected folder and default ignore patterns.
 * @returns {Promise<Object>} Resolves with an object containing initial settings.
 */
ipcMain.handle('get-initial-settings', async () => {
    const settings = await loadSettings();
    return {
        lastSelectedFolder: settings.lastSelectedFolder || '', // Last selected folder, or empty string
        // Provide default ignored folders. Can be customized via settings.
        defaultIgnoredFolders: settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store'
    };
});

/**
 * Handles the 'copy-to-clipboard' IPC call from the renderer.
 * Copies the provided text to the system clipboard.
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object (unused here).
 * @param {string} text - The text to copy.
 * @returns {Object} A status object indicating success or failure.
 */
ipcMain.handle('copy-to-clipboard', (event, text) => {
    try {
        clipboard.writeText(text); // Write text to clipboard
        return { success: true, message: 'Content copied to clipboard!' };
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        return { success: false, message: `Failed to copy: ${error.message}` };
    }
});