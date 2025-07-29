// --- DOM Element References ---
// Get references to various HTML elements by their IDs.
// These elements are used to display information, trigger actions, or capture user input.
const selectFolderBtn = document.getElementById('selectFolderBtn');
const selectedFolderPathSpan = document.getElementById('selectedFolderPath');
const generateTreeBtn = document.getElementById('generateTreeBtn');
const ignoredFoldersInput = document.getElementById('ignoredFolders');
const useGitignoreCheckbox = document.getElementById('useGitignore');
const treeOutput = document.getElementById('treeOutput'); // Where ASCII/Markdown tree is displayed
const showAsciiBtn = document.getElementById('showAsciiBtn');
const showMarkdownBtn = document.getElementById('showMarkdownBtn');
const saveTreeBtn = document.getElementById('saveTreeBtn');
const loadTreeBtn = document.getElementById('loadTreeBtn');
const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');
const interactiveTreeEditor = document.getElementById('interactiveTreeEditor'); // Container for the editable tree


// --- Global State Variables ---
// These variables store important data and states for the application.
let currentTreeData = null; // Stores the current directory tree structure as a JavaScript object.
                            // Each node in the tree object will have properties like 'name', 'type', 'children', 'id', and 'collapsed'.
let currentRootFolderPath = null; // Stores the file system path of the currently selected folder.
let nodeBeingEdited = null; // Stores the unique ID of the tree node that is currently in rename/edit mode.

// --- Helper Function for Button State Management ---
/**
 * Toggles the disabled state of buttons related to tree output and actions
 * based on whether there's valid tree data available.
 */
function toggleTreeOutputButtons() {
    // Determine if the current tree data is empty (no root or no children under the root).
    const isTreeContentEmpty = currentTreeData === null || !currentTreeData.children || currentTreeData.children.length === 0;

    // Set the disabled property for each button.
    showAsciiBtn.disabled = isTreeContentEmpty;
    showMarkdownBtn.disabled = isTreeContentEmpty;
    saveTreeBtn.disabled = isTreeContentEmpty;
    copyToClipboardBtn.disabled = isTreeContentEmpty;
}

// --- Tree Generation & Formatting Functions ---
// These functions convert the internal tree data structure into displayable formats.

/**
 * Recursively generates an ASCII art representation of the directory tree.
 * @param {Object} node - The current node in the tree (folder or file).
 * @param {string} indent - The current indentation string (e.g., '│   ').
 * @param {boolean} isLast - True if the current node is the last child of its parent.
 * @returns {string} The ASCII string representation of the node and its children.
 */
function generateAsciiTree(node, indent = '', isLast = true) {
    let output = '';
    // Determine the prefix (├── or └──) based on whether it's the last child.
    const prefix = indent + (isLast ? '└── ' : '├── ');
    output += prefix + node.name + '\n'; // Add the current node's name.

    // If the node is a folder and has children, process them.
    if (node.children && node.children.length > 0) {
        // Calculate the indentation for children: add '    ' if parent is last, '│   ' if not.
        const childIndent = indent + (isLast ? '    ' : '│   ');
        // Sort children alphabetically, folders before files.
        const sortedChildren = [...node.children].sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1; // Folders come first
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name); // Then sort by name
        });

        // Recursively call for each child.
        sortedChildren.forEach((child, index) => {
            output += generateAsciiTree(child, childIndent, index === sortedChildren.length - 1);
        });
    }
    return output;
}

/**
 * Recursively generates a Markdown list representation of the directory tree.
 * @param {Object} node - The current node in the tree.
 * @param {number} level - The current indentation level (0 for root, 1 for its children, etc.).
 * @returns {string} The Markdown string representation of the node and its children.
 */
function generateMarkdownTree(node, level = 0) {
    let output = '';
    const indent = '  '.repeat(level); // Use two spaces per level for Markdown list indentation.
    output += `${indent}- ${node.name}\n`; // Add the current node as a list item.

    // If the node is a folder and has children, process them.
    if (node.children && node.children.length > 0) {
        // Sort children alphabetically, folders before files.
        const sortedChildren = [...node.children].sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });
        // Recursively call for each child, increasing the level.
        sortedChildren.forEach(child => {
            output += generateMarkdownTree(child, level + 1);
        });
    }
    return output;
}


// --- Interactive Tree Editor Functions ---
// These functions manage the visual display and user interactions for editing the tree.

/**
 * Renders a single tree node into the DOM for the interactive editor.
 * This function is specifically designed for child nodes, not the conceptual root.
 * @param {Object} node - The tree node object to render.
 * @param {HTMLElement} parentElement - The DOM element to append this node's structure to.
 * @param {number} level - Current indentation level for visual display.
 * @param {Array<boolean>} indentationLines - Array indicating if vertical lines should be drawn at each parent level.
 * @param {boolean} isLastChild - True if this node is the last child of its parent.
 */
function renderInteractiveTreeNode(node, parentElement, level, indentationLines, isLastChild) {
    // Sanity check: This function should not be called for the main conceptual root node.
    if (node.id === 'root') {
        console.error("renderInteractiveTreeNode called with root node. This function is for children only.");
        return;
    }

    const nodeElement = document.createElement('div');
    nodeElement.classList.add('tree-node');
    nodeElement.dataset.nodeId = node.id; // Store node's unique ID as a data attribute.

    const nodeLine = document.createElement('div');
    nodeLine.classList.add('node-line'); // Container for the visual line components of a node.

    // --- Indentation and Vertical Lines ---
    // Create indentation divs to control spacing and draw vertical lines for parent branches.
    for (let i = 0; i < level; i++) {
        const indentDiv = document.createElement('div');
        indentDiv.classList.add('node-indent');
        // If a vertical line should be drawn at this level (i.e., parent is not its last child)
        if (indentationLines[i]) {
            indentDiv.classList.add('has-line');
        }
        nodeLine.appendChild(indentDiv);
    }

    // --- Node Connector (├── or └──) ---
    const connector = document.createElement('span');
    connector.classList.add('node-connector');
    connector.textContent = isLastChild ? '└── ' : '├── '; // Choose connector based on last child status.
    nodeLine.appendChild(connector);


    // --- Toggle (Caret for Folders) ---
    const toggle = document.createElement('span');
    toggle.classList.add('node-toggle');
    if (node.type === 'folder') {
        // Show caret only if the folder has children.
        if (node.children && node.children.length > 0) {
            toggle.innerHTML = node.collapsed ? '<i class="bi bi-caret-right-fill"></i>' : '<i class="bi bi-caret-down-fill"></i>';
            // Add click listener to toggle collapsed state.
            toggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling up.
                toggleNodeCollapse(node.id);
            });
        } else {
            // Hide toggle if folder has no children.
            toggle.classList.add('hidden');
        }
    } else {
        // Hide toggle for files.
        toggle.classList.add('hidden');
    }
    nodeLine.appendChild(toggle);

    // --- Node Icon (Folder or File) ---
    const icon = document.createElement('i');
    icon.classList.add('node-icon');
    if (node.type === 'folder') {
        icon.classList.add('bi', 'bi-folder-fill'); // Bootstrap folder icon.
    } else {
        icon.classList.add('bi', 'bi-file-earmark-fill'); // Bootstrap file icon.
    }
    nodeLine.appendChild(icon);

    // --- Node Name (Editable Input or Display Span) ---
    let nameElement;
    // If this node is currently being edited, render an input field.
    if (nodeBeingEdited === node.id) {
        nameElement = document.createElement('input');
        nameElement.type = 'text';
        nameElement.classList.add('node-name-input');
        nameElement.value = node.name; // Pre-fill with current name.
        // Use requestAnimationFrame to ensure focus and selection work after DOM update.
        requestAnimationFrame(() => {
            nameElement.focus();
            nameElement.select();
        });

        // Function to save the new name when input loses focus or Enter is pressed.
        const saveName = () => {
            const newName = nameElement.value.trim();
            if (newName === '') {
                alert('Name cannot be empty.');
                nameElement.focus(); // Keep focus if name is empty.
                return;
            }

            // Check for duplicate names within the same parent folder.
            const parentNode = findNodeParent(currentTreeData, node.id);
            const siblings = parentNode ? parentNode.children : [];
            const isDuplicate = siblings.some(
                (sibling) => sibling.id !== node.id && sibling.name === newName && sibling.type === node.type
            );

            if (isDuplicate) {
                alert(`An item named "${newName}" already exists in this directory.`);
                nameElement.focus(); // Keep focus if duplicate.
                return;
            }

            node.name = newName; // Update node's name in the data.
            nodeBeingEdited = null; // Exit edit mode.
            refreshInteractiveTreeEditor(); // Re-render the tree to reflect changes.
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII output.
            toggleTreeOutputButtons(); // Update button states.
        };

        nameElement.addEventListener('blur', saveName); // Save on blur.
        nameElement.addEventListener('keypress', (e) => { // Save on Enter key.
            if (e.key === 'Enter') {
                saveName();
            }
        });
    } else {
        // If not in edit mode, render a display span.
        nameElement = document.createElement('span');
        nameElement.classList.add('node-name');
        nameElement.textContent = node.name;
        // Add click listener to enter edit mode.
        nameElement.addEventListener('click', (e) => {
            e.stopPropagation();
            nodeBeingEdited = node.id;
            refreshInteractiveTreeEditor();
        });
    }
    nodeLine.appendChild(nameElement);


    // --- Action Buttons (Add File, Add Folder, Delete) ---
    // These buttons appear on hover due to CSS, but are always present in the DOM.
    const nodeActions = document.createElement('div');
    nodeActions.classList.add('node-actions');

    // Add File Button (only for folders)
    if (node.type === 'folder') {
        const addFileBtn = document.createElement('button');
        addFileBtn.classList.add('action-btn', 'file');
        addFileBtn.innerHTML = '<i class="bi bi-file-earmark-plus-fill"></i>'; // Bootstrap icon.
        addFileBtn.title = `Add new file to "${node.name}"`;
        addFileBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            promptAddNode(node.id, 'file');
        });
        nodeActions.appendChild(addFileBtn);

        // Add Folder Button (only for folders)
        const addFolderBtn = document.createElement('button');
        addFolderBtn.classList.add('action-btn', 'folder');
        addFolderBtn.innerHTML = '<i class="bi bi-folder-plus"></i>'; // Bootstrap icon.
        addFolderBtn.title = `Add new folder to "${node.name}"`;
        addFolderBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            promptAddNode(node.id, 'folder');
        });
        nodeActions.appendChild(addFolderBtn);
    }

    // Delete Button (for any node except the absolute conceptual root 'id:root' - handled in refresh)
    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('action-btn', 'delete');
    deleteBtn.innerHTML = '<i class="bi bi-trash-fill"></i>'; // Bootstrap icon.
    deleteBtn.title = `Delete "${node.name}"`;
    deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteNode(node.id);
    });
    nodeActions.appendChild(deleteBtn);

    nodeLine.appendChild(nodeActions);
    nodeElement.appendChild(nodeLine);

    // --- Children Container ---
    // If the node is a folder and has children, create a container for them.
    if (node.type === 'folder' && node.children) {
        const childrenContainer = document.createElement('div');
        childrenContainer.classList.add('node-children');
        if (node.collapsed) {
            childrenContainer.classList.add('collapsed'); // Hide children if folder is collapsed.
        }

        // Sort children for consistent display.
        const sortedChildren = [...node.children].sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });

        // Calculate new indentation lines for children.
        // Add 'true' to indentationLines if the current node is NOT the last child,
        // indicating that a vertical line needs to continue below it.
        const newIndentationLines = [...indentationLines, !isLastChild];
        
        // Recursively render children.
        sortedChildren.forEach((child, index) => {
            renderInteractiveTreeNode(child, childrenContainer, level + 1, newIndentationLines, index === sortedChildren.length - 1);
        });
        nodeElement.appendChild(childrenContainer);
    }

    parentElement.appendChild(nodeElement);
}

/**
 * Regenerates the entire interactive tree display from the `currentTreeData`.
 * This function handles the conceptual root node separately and then calls
 * `renderInteractiveTreeNode` for its children.
 */
function refreshInteractiveTreeEditor() {
    interactiveTreeEditor.innerHTML = ''; // Clear existing content to re-render.

    // If no tree data exists, display a placeholder message.
    if (!currentTreeData) {
        interactiveTreeEditor.innerHTML = '<p class="placeholder-text">Select a folder or load a tree to get started, or add items manually.</p>';
        return;
    }

    // Ensure all nodes have unique IDs and a 'collapsed' state for folders.
    assignIdsAndCollapsedState(currentTreeData);

    // --- Render the conceptual root's dedicated line ---
    const rootLineDiv = document.createElement('div');
    rootLineDiv.classList.add('root-display-line');
    rootLineDiv.dataset.nodeId = currentTreeData.id; // Store root's ID.

    // Root toggle (always visible, but functionally hidden if no children)
    const rootToggle = document.createElement('span');
    rootToggle.classList.add('node-toggle');
    if (currentTreeData.children && currentTreeData.children.length > 0) {
        // Display caret based on collapsed state.
        rootToggle.innerHTML = currentTreeData.collapsed ? '<i class="fbi bi-caret-right-fill"></i>' : '<i class="bi bi-caret-down-fill"></i>';
        // Toggle collapse on click.
        rootToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNodeCollapse(currentTreeData.id);
        });
    } else {
        rootToggle.classList.add('hidden'); // Hide toggle if root has no children.
    }
    rootLineDiv.appendChild(rootToggle);

    // Root icon
    const rootIcon = document.createElement('i');
    rootIcon.classList.add('node-icon', 'bi', 'bi-folder-fill');
    rootLineDiv.appendChild(rootIcon);

    // Root name (editable input or display span)
    let rootNameElement;
    if (nodeBeingEdited === currentTreeData.id) {
        rootNameElement = document.createElement('input');
        rootNameElement.type = 'text';
        rootNameElement.classList.add('node-name-input');
        rootNameElement.value = currentTreeData.name;
        requestAnimationFrame(() => {
            rootNameElement.focus();
            rootNameElement.select();
        });

        const saveRootName = () => {
            const newName = rootNameElement.value.trim();
            if (newName === '') {
                alert('Root name cannot be empty.');
                rootNameElement.focus();
                return;
            }
            currentTreeData.name = newName;
            nodeBeingEdited = null;
            refreshInteractiveTreeEditor(); // Re-render to show updated name.
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII.
            toggleTreeOutputButtons(); // Update button states.
        };

        rootNameElement.addEventListener('blur', saveRootName);
        rootNameElement.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveRootName();
            }
        });
    } else {
        rootNameElement = document.createElement('span');
        rootNameElement.classList.add('node-name');
        rootNameElement.textContent = currentTreeData.name;
        rootNameElement.addEventListener('click', (e) => {
            e.stopPropagation();
            nodeBeingEdited = currentTreeData.id;
            refreshInteractiveTreeEditor();
        });
    }
    rootLineDiv.appendChild(rootNameElement);

    // Root Action buttons (Add File, Add Folder, Clear All Children)
    const rootActions = document.createElement('div');
    rootActions.classList.add('node-actions');

    // Add File Button for Root
    const addFileBtnRoot = document.createElement('button');
    addFileBtnRoot.classList.add('action-btn', 'file');
    addFileBtnRoot.innerHTML = '<i class="bi bi-file-earmark-plus-fill"></i>';
    addFileBtnRoot.title = `Add new file to "${currentTreeData.name}"`;
    addFileBtnRoot.addEventListener('click', (event) => {
        event.stopPropagation();
        promptAddNode(currentTreeData.id, 'file');
    });
    rootActions.appendChild(addFileBtnRoot);

    // Add Folder Button for Root
    const addFolderBtnRoot = document.createElement('button');
    addFolderBtnRoot.classList.add('action-btn', 'folder');
    addFolderBtnRoot.innerHTML = '<i class="bi bi-folder-plus"></i>';
    addFolderBtnRoot.title = `Add new folder to "${currentTreeData.name}"`;
    addFolderBtnRoot.addEventListener('click', (event) => {
        event.stopPropagation();
        promptAddNode(currentTreeData.id, 'folder');
    });
    rootActions.appendChild(addFolderBtnRoot);

    // Delete Button for Root (to clear its children, not delete the root itself)
    const deleteBtnRoot = document.createElement('button');
    deleteBtnRoot.classList.add('action-btn', 'delete');
    deleteBtnRoot.innerHTML = '<i class="bi bi-trash-fill"></i>';
    deleteBtnRoot.title = 'Clear all children from this tree';
    deleteBtnRoot.addEventListener('click', (event) => {
        event.stopPropagation();
        if (confirm('Are you sure you want to clear all contents of this tree? This cannot be undone.')) {
            currentTreeData.children = []; // Clear children array.
            nodeBeingEdited = null; // Exit any active edit mode.
            refreshInteractiveTreeEditor(); // Re-render.
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII.
            toggleTreeOutputButtons(); // Update button states.
        }
    });
    rootActions.appendChild(deleteBtnRoot);

    rootLineDiv.appendChild(rootActions);
    interactiveTreeEditor.appendChild(rootLineDiv);


    // --- Render children of the root ---
    // Only render children if the root is a folder and not collapsed.
    if (currentTreeData.type === 'folder' && currentTreeData.children && !currentTreeData.collapsed) {
        // Sort the root's children before rendering.
        const sortedRootChildren = [...currentTreeData.children].sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') return -1;
            if (a.type !== 'folder' && b.type === 'folder') return 1;
            return a.name.localeCompare(b.name);
        });

        const rootChildrenContainer = document.createElement('div');
        rootChildrenContainer.classList.add('node-children');
        interactiveTreeEditor.appendChild(rootChildrenContainer);

        // Initial indentation lines for children of the root: empty array (level 0).
        const initialIndentationLines = [];

        // Call renderInteractiveTreeNode for each child, starting at level 0.
        sortedRootChildren.forEach((child, index) => {
            renderInteractiveTreeNode(child, rootChildrenContainer, 0, initialIndentationLines, index === sortedRootChildren.length - 1);
        });
    }

    // If the tree (root's children) is empty, show a specific placeholder message.
    if (!currentTreeData.children || currentTreeData.children.length === 0) {
        const placeholder = document.createElement('p');
        placeholder.classList.add('placeholder-text');
        placeholder.textContent = 'Tree is empty. Use the buttons on the "' + currentTreeData.name + '" line to add items, or generate a tree.';
        interactiveTreeEditor.appendChild(placeholder);
    }
}

/**
 * Recursively assigns unique IDs to nodes if they don't have one and
 * initializes the 'collapsed' state for folder nodes if it's undefined.
 * This is crucial for interactive editing and preserving state.
 * @param {Object} node - The current node to process.
 */
function assignIdsAndCollapsedState(node) {
    if (!node.id) {
        node.id = generateUniqueId(); // Assign a new unique ID if missing.
    }
    if (node.type === 'folder') {
        if (typeof node.collapsed === 'undefined') {
            node.collapsed = false; // Default to expanded for new or loaded folders.
        }
        if (node.children) {
            node.children.forEach(child => assignIdsAndCollapsedState(child)); // Recurse for children.
        }
    }
}

let nextId = 1; // Simple counter to generate unique IDs.
/**
 * Generates a simple unique ID for a tree node.
 * @returns {string} A unique ID string.
 */
function generateUniqueId() {
    return 'node-' + nextId++;
}

/**
 * Finds a node in the tree by its unique ID.
 * Performs a depth-first search.
 * @param {Object} root - The root of the tree to search.
 * @param {string} id - The ID of the node to find.
 * @returns {Object|null} The found node object, or null if not found.
 */
function findNodeById(root, id) {
    if (!root) return null;

    if (root.id === id) {
        return root; // Found the node.
    }
    if (root.children) {
        // Recursively search in children.
        for (const child of root.children) {
            const found = findNodeById(child, id);
            if (found) {
                return found; // Return if found in a child's subtree.
            }
        }
    }
    return null; // Not found in this subtree.
}

/**
 * Finds a node's parent in the tree by the node's ID.
 * Useful for modifying the tree structure (e.g., deleting a node).
 * @param {Object} root - The root of the tree to search.
 * @param {string} id - The ID of the node whose parent we need.
 * @returns {Object|null} The parent node object, or null if parent not found (e.g., for the absolute root itself).
 */
function findNodeParent(root, id) {
    // Check if any immediate child has the target ID.
    if (root.children && root.children.some(child => child.id === id)) {
        return root; // Found the parent.
    }

    if (root.children) {
        // Recursively search in children's subtrees.
        for (const child of root.children) {
            const foundParent = findNodeParent(child, id);
            if (foundParent) {
                return foundParent; // Return if parent found in a child's subtree.
            }
        }
    }
    return null; // Parent not found.
}


/**
 * Toggles the 'collapsed' state of a folder node and re-renders the interactive tree.
 * @param {string} nodeId - The ID of the folder node to toggle.
 */
function toggleNodeCollapse(nodeId) {
    const node = findNodeById(currentTreeData, nodeId);
    if (node && node.type === 'folder') {
        node.collapsed = !node.collapsed; // Flip the collapsed state.
        refreshInteractiveTreeEditor(); // Re-render to show/hide children.
    }
}

/**
 * Adds a new file or folder node to the tree as a child of a specified parent.
 * The new node is given a default name and immediately put into edit mode.
 * @param {string} parentNodeId - The ID of the parent node to add the new item to.
 * @param {'file'|'folder'} type - The type of node to add ('file' or 'folder').
 */
function promptAddNode(parentNodeId, type) {
    const parentNode = findNodeById(currentTreeData, parentNodeId);
    // Ensure parent exists and is a folder.
    if (!parentNode || parentNode.type !== 'folder') {
        alert('Cannot add to this item. It must be a folder.');
        return;
    }

    // Generate a unique default name to avoid conflicts.
    const defaultBaseName = type === 'folder' ? 'new_folder' : 'new_file';
    const extension = type === 'file' ? '.txt' : '';
    let newName = defaultBaseName + extension;
    let counter = 1;

    // Increment counter until a unique name is found among siblings.
    while (parentNode.children && parentNode.children.some(child => child.name === newName && child.type === type)) {
        newName = `${defaultBaseName}_${counter}${extension}`;
        counter++;
    }

    // Create the new node object.
    const newNode = {
        id: generateUniqueId(), // Assign a new unique ID.
        name: newName,
        type: type,
        children: type === 'folder' ? [] : undefined, // Initialize children array for folders.
        collapsed: type === 'folder' ? false : undefined // Default new folders to expanded.
    };

    // Initialize children array for parent if it doesn't exist.
    if (!parentNode.children) {
        parentNode.children = [];
    }
    parentNode.children.push(newNode); // Add the new node to parent's children.

    // If the parent was collapsed, expand it to show the new child.
    if (parentNode.collapsed) {
        parentNode.collapsed = false;
    }

    nodeBeingEdited = newNode.id; // Set new node as the one being edited.

    refreshInteractiveTreeEditor(); // Re-render.
    treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII.
    toggleTreeOutputButtons(); // Update button states.
}

/**
 * Deletes a node from the tree by its ID.
 * Prompts for confirmation before deletion.
 * @param {string} nodeIdToDelete - The ID of the node to delete.
 */
function deleteNode(nodeIdToDelete) {
    // Confirmation dialog.
    if (!confirm(`Are you sure you want to delete "${findNodeById(currentTreeData, nodeIdToDelete).name}"? This action cannot be undone.`)) {
        return;
    }

    const parentNode = findNodeParent(currentTreeData, nodeIdToDelete);
    if (parentNode && parentNode.children) {
        // Filter out the node to be deleted from its parent's children array.
        parentNode.children = parentNode.children.filter(child => child.id !== nodeIdToDelete);
    } else {
        console.error("Could not find parent for node to delete:", nodeIdToDelete);
        alert("Error: Could not delete item. Parent not found.");
        return;
    }

    // If the deleted node was in edit mode, exit edit mode.
    if (nodeBeingEdited === nodeIdToDelete) {
        nodeBeingEdited = null;
    }

    refreshInteractiveTreeEditor(); // Re-render.
    treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII.
    toggleTreeOutputButtons(); // Update button states.
}


// --- Initial Setup and Event Listeners ---

// This code runs once the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch initial settings from the main process.
        const settings = await window.electronAPI.getInitialSettings();
        if (settings.lastSelectedFolder) {
            currentRootFolderPath = settings.lastSelectedFolder;
            selectedFolderPathSpan.textContent = settings.lastSelectedFolder;
        }
        // Populate the ignored folders input with default or saved settings.
        ignoredFoldersInput.value = settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store';
    } catch (error) {
        console.error('Error loading initial settings:', error);
    }

    // Initialize the currentTreeData with a conceptual root node.
    // This root isn't a real file system folder but serves as the editable container.
    currentTreeData = {
        id: 'root', // Special ID for the conceptual root.
        name: "project_root", // Default name for the conceptual root.
        type: "folder",
        children: [] // Start with an empty array of children.
    };

    refreshInteractiveTreeEditor(); // Render the initial empty interactive tree.
    treeOutput.textContent = generateAsciiTree(currentTreeData); // Generate initial ASCII output.
    toggleTreeOutputButtons(); // Set initial button states.
});

// --- Event Listeners for User Actions ---

// Event listener for the "Select Folder" button.
selectFolderBtn.addEventListener('click', async () => {
    try {
        // Call the main process to open a native folder selection dialog.
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
            currentRootFolderPath = folderPath; // Store the selected path.
            selectedFolderPathSpan.textContent = folderPath; // Display the path.
        } else {
            selectedFolderPathSpan.textContent = 'No folder selected';
            currentRootFolderPath = null;
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        alert('Error selecting folder. Check console for details.');
    }
});

// Event listener for the "Generate Tree" button.
generateTreeBtn.addEventListener('click', async () => {
    if (!currentRootFolderPath) {
        alert('Please select a folder first.');
        return;
    }

    // Parse the ignored folders input.
    const ignoredFoldersText = ignoredFoldersInput.value.trim();
    const ignoreList = ignoredFoldersText
        ? ignoredFoldersText.split(',').map(item => item.trim()).filter(item => item !== '')
        : [];
    const useGitignore = useGitignoreCheckbox.checked;

    // Create a deep copy of the current tree data before attempting to generate a new one.
    // This allows rolling back if tree generation fails or results in an empty tree.
    const previousTreeData = JSON.parse(JSON.stringify(currentTreeData));

    try {
        // Call the main process to generate the directory tree.
        const generatedRootNode = await window.electronAPI.generateTree(currentRootFolderPath, ignoreList, useGitignore);

        // Check if the generated tree is effectively empty due to ignored content.
        if (generatedRootNode.type === 'folder' && (!generatedRootNode.children || generatedRootNode.children.length === 0)) {
            alert(`The selected folder "${generatedRootNode.name}" or its contents were fully ignored or empty, resulting in an empty tree. The previous tree view has been retained.`);
            // Revert to previous tree data if new tree is empty.
            currentTreeData = previousTreeData;
            refreshInteractiveTreeEditor();
            treeOutput.textContent = generateAsciiTree(currentTreeData);
            toggleTreeOutputButtons();
            return;
        }

        // Update the current tree data with the newly generated tree.
        currentTreeData = generatedRootNode;
        currentTreeData.id = 'root'; // Ensure the generated root is marked as the conceptual root.

        // Assign IDs and collapsed state for all nodes in the new tree.
        assignIdsAndCollapsedState(currentTreeData);
        refreshInteractiveTreeEditor(); // Re-render the interactive editor.
        treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII output.
        toggleTreeOutputButtons(); // Update button states.
    } catch (error) {
        console.error('Error generating tree:', error);
        alert(`An error occurred while generating the tree: ${error.message}`);
        // On error, revert to the previous tree data.
        currentTreeData = previousTreeData;
        refreshInteractiveTreeEditor();
        treeOutput.textContent = generateAsciiTree(currentTreeData);
        toggleTreeOutputButtons();
    }
});

// Event listener for showing ASCII tree.
showAsciiBtn.addEventListener('click', () => {
    // Only generate if there's valid tree data with children.
    if (currentTreeData && currentTreeData.children && currentTreeData.children.length > 0) {
        treeOutput.textContent = generateAsciiTree(currentTreeData);
    } else {
        alert('No tree data available to show. Generate or load a tree first.');
    }
});

// Event listener for showing Markdown tree.
showMarkdownBtn.addEventListener('click', () => {
    // Only generate if there's valid tree data with children.
    if (currentTreeData && currentTreeData.children && currentTreeData.children.length > 0) {
        treeOutput.textContent = generateMarkdownTree(currentTreeData);
    } else {
        alert('No tree data available to show. Generate or load a tree first.');
    }
});

// Event listener for "Save Tree" button.
saveTreeBtn.addEventListener('click', async () => {
    // Ensure there's a tree to save.
    if (!currentTreeData || !currentTreeData.children || currentTreeData.children.length === 0) {
        alert('No tree to save. Please generate or load one first, or add items to the editor.');
        return;
    }

    try {
        // Create a deep copy of the tree data to avoid modifying the live object.
        const treeDataForSave = JSON.parse(JSON.stringify(currentTreeData));

        // Function to clean up temporary properties (id, collapsed) before saving.
        function cleanNodeForSave(node) {
            delete node.id; // Remove internal IDs.
            delete node.collapsed; // Remove collapse state.
            if (node.children) {
                node.children.forEach(cleanNodeForSave); // Recurse for children.
            }
        }
        cleanNodeForSave(treeDataForSave); // Clean the data before sending to main process.

        // Call the main process to open a save dialog and save the tree data.
        const result = await window.electronAPI.saveTreeFile(treeDataForSave);
        if (result.success) {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error saving tree:', error);
        alert(`An error occurred while saving the tree: ${error.message}`);
    }
});

// Event listener for "Load Tree" button.
loadTreeBtn.addEventListener('click', async () => {
    try {
        // Call the main process to open an open dialog and load a JSON tree file.
        const result = await window.electronAPI.loadTreeFile();
        if (result.success) {
            currentTreeData = result.tree; // Update current tree data with loaded tree.
            
            // Ensure the loaded root has the special 'root' ID and a default name if missing.
            if (!currentTreeData.id || currentTreeData.id !== 'root') {
                 currentTreeData.id = 'root';
            }
            if (currentTreeData.id === 'root' && !currentTreeData.name) {
                currentTreeData.name = "project_root"; // Default name if not specified in loaded file.
            }

            // Assign IDs and collapsed states to all nodes in the loaded tree.
            assignIdsAndCollapsedState(currentTreeData);
            refreshInteractiveTreeEditor(); // Re-render interactive editor.
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII output.
            alert('Tree loaded successfully!');
            toggleTreeOutputButtons(); // Update button states.
        }
    } catch (error) {
        alert(`Error loading JSON file: ${error.message}. Please ensure it's a valid JSON tree structure.`);
        console.error('Error loading file:', error);
        // On error, reset to an empty default tree and clear display.
        currentTreeData = { id: 'root', name: "project_root", type: "folder", children: [] };
        interactiveTreeEditor.innerHTML = '<p class="placeholder-text error">Error loading tree. Please ensure it\'s a valid JSON tree structure.</p>';
        treeOutput.textContent = '';
        toggleTreeOutputButtons();
    }
});

// Event listener for "Copy to Clipboard" button.
copyToClipboardBtn.addEventListener('click', async () => {
    const textToCopy = treeOutput.textContent; // Get the content from the text area.
    // Ensure there's content to copy.
    if (!textToCopy || !currentTreeData || !currentTreeData.children || currentTreeData.children.length === 0) {
        alert('Nothing to copy. Please generate or load a tree first.');
        return;
    }
    try {
        // Call the main process to copy text to the system clipboard.
        const result = await window.electronAPI.copyToClipboard(textToCopy);
        if (result.success) {
            alert(result.message);
        } else {
            alert(`Failed to copy to clipboard: ${result.message}`);
        }
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        alert(`An unexpected error occurred while copying to clipboard: ${error.message}`);
    }
});