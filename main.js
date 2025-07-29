// --- main.js ---

// =============================================================================
// Module Imports
// =============================================================================
const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron'); // Electron modules for app lifecycle, window management, IPC, native dialogs, and clipboard access
const path = require('path');     // Node.js module for handling and transforming file paths
const fs = require('fs').promises; // Node.js File System module with promise-based API for asynchronous operations
const os = require('os');         // Node.js OS module for operating system-specific information (e.g., home directory)


// =============================================================================
// Global State Variables
// =============================================================================
/**
 * @type {Electron.BrowserWindow}
 * Declares the main Electron browser window instance.
 * This variable is kept in a scope accessible to all IPC handlers and app events.
 */
let mainWindow;


// =============================================================================
// Application Settings Configuration
// =============================================================================
// Get the path to Electron's user data directory, which is OS-specific
const userDataPath = app.getPath('userData');
// Define the full path for storing application settings in a JSON file
const settingsFilePath = path.join(userDataPath, 'app-settings.json');


// =============================================================================
// Settings Management Functions
// =============================================================================

/**
 * Loads application settings from the predefined JSON file.
 * If the settings file does not exist or an error occurs during reading/parsing,
 * an empty object is returned to prevent application crashes.
 *
 * @returns {Promise<Object>} A promise that resolves with the settings object.
 * Returns an empty object `{}` if the file is not found or corrupted.
 */
async function loadSettings() {
    try {
        const data = await fs.readFile(settingsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Check if the error is specifically 'ENOENT' (file not found)
        if (error.code === 'ENOENT') {
            return {}; // File not found, return empty settings to initialize
        }
        console.error('Error loading settings:', error);
        return {}; // Return empty object on other errors to ensure app continues
    }
}

/**
 * Saves the provided settings object to the predefined JSON file.
 * The settings are written with 2-space indentation for readability.
 *
 * @param {Object} settings - The settings object to be saved.
 * @returns {Promise<void>} A promise that resolves when settings are successfully saved, or rejects on error.
 */
async function saveSettings(settings) {
    try {
        // Stringify the settings object to JSON format, with 2-space indentation
        await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}


// =============================================================================
// Gitignore Parsing Function
// =============================================================================

/**
 * Parses the content of a `.gitignore` file into an array of patterns to ignore.
 * This simplified implementation handles comments (`#`), empty lines, and removes
 * leading/trailing slashes for basename matching.
 *
 * Note: For full `.gitignore` spec (wildcards, negation, etc.), a dedicated library
 * like 'ignore' would be more robust.
 *
 * @param {string} rootPath - The path to the directory potentially containing the `.gitignore` file.
 * @returns {Promise<string[]>} A promise that resolves with an array of cleaned ignore patterns.
 * Returns an empty array if `.gitignore` is not found or cannot be read.
 */
async function getGitignorePatterns(rootPath) {
    const gitignorePath = path.join(rootPath, '.gitignore');
    let patterns = [];
    try {
        const content = await fs.readFile(gitignorePath, 'utf8');
        content.split('\n').forEach(line => {
            line = line.trim();
            // Ignore lines that are comments or empty
            if (line.startsWith('#') || line === '') {
                return;
            }
            // Remove leading slashes if present (for basename matching)
            if (line.startsWith('/')) {
                line = line.substring(1);
            }
            // Remove trailing slashes if present (for basename matching)
            if (line.endsWith('/')) {
                line = line.slice(0, -1);
            }
            patterns.push(line);
        });
    } catch (error) {
        // Ignore 'ENOENT' error (file not found) as .gitignore is optional
        if (error.code !== 'ENOENT') {
            console.warn(`Error reading .gitignore in ${rootPath}: ${error.message}`);
        }
    }
    return patterns;
}


// =============================================================================
// Directory Tree Generation Function
// =============================================================================

/**
 * Recursively reads a directory and builds a hierarchical tree structure.
 * Applies both an explicit ignore list and `.gitignore` patterns (if enabled)
 * to filter out specific files and folders.
 *
 * @param {string} dirPath - The current directory path to read.
 * @param {string} initialRootPath - The original root path from which the tree generation started.
 * Used to distinguish the initial call from recursive calls.
 * @param {string[]} ignoreList - An array of explicit folder/file names to ignore.
 * @param {boolean} useGitignore - A flag indicating whether to apply `.gitignore` rules found in directories.
 * @returns {Promise<Object|null>} A promise that resolves with the tree node object for the `dirPath`.
 * Returns `null` if the path (or any of its parents) is ignored.
 * Returns an error node if the path is inaccessible or unreadable (for non-root calls).
 * @throws {Error} Throws an error if the `initialRootPath` itself is inaccessible.
 */
async function readDirectoryRecursive(dirPath, initialRootPath, ignoreList = [], useGitignore = false) {
    const name = path.basename(dirPath); // Get the base name (folder/file name) of the current path
    const isRootCall = dirPath === initialRootPath; // Check if this is the very first directory being scanned

    // Combine explicit ignore patterns with .gitignore patterns (if applicable) for efficient lookup
    let combinedIgnoreSet = new Set(ignoreList);
    if (useGitignore) {
        // Fetch .gitignore patterns specific to the *current* directory
        const gitignorePatterns = await getGitignorePatterns(dirPath);
        gitignorePatterns.forEach(pattern => combinedIgnoreSet.add(pattern));
    }

    // If this is not the initial root call and the current item's name is in the ignore list,
    // then completely skip it and its contents by returning null.
    if (!isRootCall && combinedIgnoreSet.has(name)) {
        return null;
    }

    let stats;
    try {
        stats = await fs.stat(dirPath); // Get file system stats (e.g., is it a file or directory?)
    } catch (error) {
        console.warn(`Could not access ${dirPath}: ${error.message}`);
        // If the *initial* root directory is inaccessible, propagate the error to the caller
        if (isRootCall) {
            throw new Error(`Cannot access selected folder: ${error.message}`);
        }
        // For subdirectories that are inaccessible, return an error node in the tree
        return { name: `${name} (inaccessible)`, type: 'error' };
    }

    // If the current path points to a file
    if (stats.isFile()) {
        // If a file's name is in the ignore list, return null to exclude it
        if (combinedIgnoreSet.has(name)) {
            return null;
        }
        return { name, type: 'file' }; // Return a file node object
    }

    // If the current path points to a directory
    const node = { name, type: 'folder', children: [] }; // Initialize a folder node
    let entries;
    try {
        entries = await fs.readdir(dirPath); // Read all entries (files and subdirectories) within the current directory
    } catch (error) {
        console.warn(`Could not read directory ${dirPath}: ${error.message}`);
        return { name: `${name} (cannot read)`, type: 'error' }; // Return an error node for unreadable directories
    }

    // Process each entry found in the directory
    for (const entry of entries) {
        // Check if the individual entry (file or subfolder) itself should be ignored
        if (combinedIgnoreSet.has(entry)) {
            continue; // Skip this entry and proceed to the next
        }

        const entryPath = path.join(dirPath, entry); // Construct the full path for the current entry
        // Recursively call `readDirectoryRecursive` for each child entry,
        // passing the original root path and inherited ignore sets.
        const childNode = await readDirectoryRecursive(entryPath, initialRootPath, Array.from(combinedIgnoreSet), useGitignore);
        if (childNode) {
            // Only add the child node if it was not ignored (i.e., `childNode` is not null)
            node.children.push(childNode);
        }
    }

    // Return the constructed folder node. Even if all its children were ignored,
    // the root node (if `isRootCall` was true) will still be returned.
    return node;
}


// =============================================================================
// Electron Window Management
// =============================================================================

/**
 * Creates and configures the main Electron browser window.
 * The window is assigned to the global `mainWindow` variable.
 * Sets up preload script, disables Node.js integration, and enables context isolation for security.
 */
function createWindow() {
    mainWindow = new BrowserWindow({ // Assigns the new window instance to the global variable
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), // Path to the preload script that exposes a limited API to the renderer
            nodeIntegration: false, // Security: Disable Node.js integration in the renderer process
            contextIsolation: true, // Security: Isolate preload script context from the renderer's global scope
        }
    });

    // Load the main HTML file (your UI) into the browser window
    mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

    // Optionally uncomment the line below to open DevTools automatically for debugging
    // mainWindow.webContents.openDevTools();
}


// =============================================================================
// Application Lifecycle Events
// =============================================================================

// Event: 'ready'
// Fired when Electron has finished initialization and is ready to create browser windows.
app.whenReady().then(() => {
    createWindow(); // Call the function to create the main application window

    // Event: 'activate' (macOS specific)
    // Fired when the application is activated (e.g., dock icon clicked) and no windows are open.
    app.on('activate', () => {
        // If there are no open windows, create a new one
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Event: 'window-all-closed'
// Fired when all windows have been closed.
// On macOS, applications typically stay active in the dock even after all windows are closed.
// This condition ensures the app quits only if it's not on macOS.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit(); // Quit the application
    }
});


// =============================================================================
// IPC Main Handlers
// =============================================================================
// These functions define the responses to Inter-Process Communication (IPC)
// calls from the renderer process via `ipcRenderer.invoke` or `ipcRenderer.send`.

// IPC Handler: 'focus-main-window'
// Responds to a request from the renderer to bring the main window to focus.
ipcMain.on('focus-main-window', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus(); // Bring the window to the front and focus it
    }
});

/**
 * IPC Handler: 'select-folder'
 * Opens a native folder selection dialog for the user.
 * Remembers the last selected folder path for convenience in subsequent dialogs.
 *
 * @returns {Promise<string|null>} Resolves with the selected folder path, or `null` if the dialog was cancelled.
 */
ipcMain.handle('select-folder', async () => {
    const settings = await loadSettings(); // Load current application settings
    // Set the default path for the dialog to the last selected folder, or the user's home directory
    const defaultPath = settings.lastSelectedFolder || os.homedir();

    // Show the open dialog, configured to only allow selecting directories
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        defaultPath: defaultPath
    });

    // Explicitly focus the main window after the dialog closes (important for user experience)
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
    }

    if (canceled) {
        return null; // User cancelled the dialog
    } else {
        const selectedPath = filePaths[0]; // Get the first selected path
        // Save the newly selected folder path for future use
        await saveSettings({ ...settings, lastSelectedFolder: selectedPath });
        return selectedPath;
    }
});

/**
 * IPC Handler: 'generate-tree'
 * Initiates the generation of a directory tree structure for the given `folderPath`.
 * Applies specified `ignoreList` and optionally `.gitignore` rules.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object (automatically passed by Electron, unused here).
 * @param {string} folderPath - The root path of the folder to generate the tree from.
 * @param {string[]} ignoreList - An array of explicit folder/file names to ignore during generation.
 * @param {boolean} useGitignore - A flag indicating whether to use `.gitignore` files for exclusion.
 * @returns {Promise<Object>} Resolves with the generated tree structure object.
 * @throws {Error} Throws an error if the `folderPath` is missing or inaccessible.
 */
ipcMain.handle('generate-tree', async (event, folderPath, ignoreList, useGitignore) => {
    if (!folderPath) {
        throw new Error('Folder path is required.');
    }
    try {
        // Call the recursive function to build the tree. The initial `folderPath` serves as both current and initial root.
        const tree = await readDirectoryRecursive(folderPath, folderPath, ignoreList, useGitignore);

        // If the tree generation results in a null tree (e.g., the root itself was ignored, though handled by throw),
        // or if all children were ignored, return a valid but empty root object reflecting the chosen folder.
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
 * IPC Handler: 'save-tree-file'
 * Opens a native save file dialog and writes the provided `treeData` to a JSON file.
 * The data is pretty-printed with 2-space indentation.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object (unused here).
 * @param {Object} treeData - The directory tree data object to save.
 * @returns {Promise<Object>} Resolves with a status object `{ success: boolean, message: string }`.
 */
ipcMain.handle('save-tree-file', async (event, treeData) => {
    // Show the save dialog, suggesting a default file name and filtering for JSON files
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Directory Tree',
        defaultPath: 'directory_tree.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    // Explicitly focus the main window after the dialog closes
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
    }

    if (filePath) {
        try {
            await fs.writeFile(filePath, JSON.stringify(treeData, null, 2)); // Save with pretty printing
            return { success: true, message: 'Tree saved successfully!' };
        } catch (error) {
            console.error('Error saving file:', error);
            throw new Error(`Failed to save file: ${error.message}`);
        }
    }
    return { success: false, message: 'Save cancelled' }; // User cancelled the save dialog
});

/**
 * IPC Handler: 'load-tree-file'
 * Opens a native open file dialog and reads the content of a selected JSON file.
 * Parses the file content as a JSON tree structure.
 *
 * @returns {Promise<Object>} Resolves with a status object `{ success: boolean, tree?: Object, message: string }`.
 * Contains the loaded tree object on success, or an error message on failure.
 */
ipcMain.handle('load-tree-file', async () => {
    // Show the open dialog, configured to only allow selecting files and filtering for JSON
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    // Explicitly focus the main window after the dialog closes
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
    }

    if (!canceled && filePaths.length > 0) {
        try {
            const data = await fs.readFile(filePaths[0], 'utf8'); // Read the content of the selected file
            const tree = JSON.parse(data); // Parse the content as JSON
            return { success: true, tree };
        } catch (error) {
            console.error('Error loading or parsing file:', error);
            throw new Error(`Failed to load file: ${error.message}`);
        }
    }
    return { success: false, message: 'Load cancelled' }; // User cancelled the load dialog
});

/**
 * IPC Handler: 'get-initial-settings'
 * Provides initial application settings to the renderer process,
 * including the last selected folder path and default ignore patterns.
 *
 * @returns {Promise<Object>} Resolves with an object containing initial settings.
 * Example: `{ lastSelectedFolder: string, defaultIgnoredFolders: string }`.
 */
ipcMain.handle('get-initial-settings', async () => {
    const settings = await loadSettings(); // Load current settings
    return {
        lastSelectedFolder: settings.lastSelectedFolder || '', // Return last selected folder, or empty string if not set
        // Provide default ignored folders. This can be customized by the user and saved in settings.
        defaultIgnoredFolders: settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store'
    };
});

/**
 * IPC Handler: 'copy-to-clipboard'
 * Copies the provided `text` to the system clipboard.
 *
 * @param {Electron.IpcMainInvokeEvent} event - The IPC event object (unused here).
 * @param {string} text - The text content to copy to the clipboard.
 * @returns {Object} A status object `{ success: boolean, message: string }` indicating the result of the operation.
 */
ipcMain.handle('copy-to-clipboard', (event, text) => {
    try {
        clipboard.writeText(text); // Write the text to the system clipboard
        return { success: true, message: 'Content copied to clipboard!' };
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        return { success: false, message: `Failed to copy: ${error.message}` };
    }
});