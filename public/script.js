// --- script.js ---

// =============================================================================
// DOM Element References
// =============================================================================
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
const messageContainer = document.getElementById('messageContainer'); // Container for non-blocking UI messages


// =============================================================================
// Global State Variables
// =============================================================================
// These variables store important data and states for the application.
let currentTreeData = null; // Stores the current directory tree structure as a JavaScript object.
// Each node in the tree object will have properties like 'name', 'type', 'children', 'id', and 'collapsed'.
let currentRootFolderPath = null; // Stores the file system path of the currently selected folder.
let nodeBeingEdited = null; // Stores the unique ID of the tree node that is currently in rename/edit mode.

// Initialize a counter for generating unique IDs for tree nodes.
// This ensures that new nodes or nodes without IDs get a distinct identifier.
let nextId = 1;


// =============================================================================
// UI Message System
// =============================================================================
/**
 * Displays a non-blocking message in the UI using the designated messageContainer.
 * Messages are temporary by default but can be made permanent.
 * @param {string} message - The text message to display.
 * @param {'info'|'success'|'error'} type - The type of message (influences styling: 'info', 'success', 'error').
 * @param {number} [duration=4000] - How long the message should be visible in milliseconds.
 * Set to 0 for a permanent message (until a new message replaces it).
 */
function displayMessage(message, type = 'info', duration = 4000) {
    if (!messageContainer) {
        console.error('Message container not found. Cannot display message:', message);
        return;
    }

    // Replace newline characters with <br> tags for HTML rendering
    const htmlMessage = message.replace(/\n/g, '<br/>');

    // Set message content and apply CSS classes for styling and visibility.
    messageContainer.innerHTML = htmlMessage;
    messageContainer.className = `message-container show ${type}`; // Reset classes and add new ones.

    // If a duration is specified, set a timeout to hide the message.
    if (duration > 0) {
        setTimeout(() => {
            messageContainer.classList.remove('show'); // Start hide transition.
            // Clear text and reset base class after transition completes.
            setTimeout(() => {
                messageContainer.textContent = '';
                messageContainer.className = 'message-container';
            }, 500); // Matches CSS transition duration for a smooth hide.
        }, duration);
    }
}


// =============================================================================
// Helper Functions for Tree Data Management & Operations
// =============================================================================

/**
 * Toggles the disabled state of buttons related to tree output and actions
 * based on whether there's valid, non-empty tree data available.
 */
function toggleTreeOutputButtons() {
    // Determine if the current tree data is empty (no root or no children under the root).
    const isTreeContentEmpty = currentTreeData === null || !currentTreeData.children || currentTreeData.children.length === 0;

    // Set the disabled property for each button accordingly.
    showAsciiBtn.disabled = isTreeContentEmpty;
    showMarkdownBtn.disabled = isTreeContentEmpty;
    saveTreeBtn.disabled = isTreeContentEmpty;
    copyToClipboardBtn.disabled = isTreeContentEmpty;
}

/**
 * Custom comparison function for sorting tree nodes.
 * The sorting logic prioritizes folders over files and handles special 'userOrder' items.
 * 1. Folders before files.
 * 2. Within the same type, items WITHOUT `userOrder` come before items WITH `userOrder`
 * (this pushes user-added items with the special name '...' to the end of their type group).
 * 3. If both have `userOrder`, sort by `userOrder` (useful for chronological ordering if userOrder is a timestamp).
 * 4. Otherwise (if no `userOrder` involved, or userOrder sorted), sort alphabetically by name.
 * @param {Object} a - First node to compare.
 * @param {Object} b - Second node to compare.
 * @returns {number} A negative, zero, or positive value indicating sort order.
 */
function customNodeSort(a, b) {
    const aIsFolder = a.type === 'folder';
    const bIsFolder = b.type === 'folder';

    const aHasUserOrder = typeof a.userOrder === 'number';
    const bHasUserOrder = typeof b.userOrder === 'number';

    // Rule 1: Primary sort - Folders before files
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;

    // Rule 2: Within the same type, non-user-ordered items come before user-ordered items
    if (!aHasUserOrder && bHasUserOrder) return -1;
    if (aHasUserOrder && !bHasUserOrder) return 1;

    // Rule 3: If both have userOrder, sort by userOrder (e.g., chronological for timestamps)
    if (aHasUserOrder && bHasUserOrder) {
        return a.userOrder - b.userOrder;
    }

    // Rule 4: If neither has userOrder (or both had userOrder and were sorted by Rule 3),
    // sort alphabetically by name.
    return a.name.localeCompare(b.name);
}

/**
 * Generates a simple unique ID for a tree node using a counter.
 * @returns {string} A unique ID string (e.g., 'node-1', 'node-2').
 */
function generateUniqueId() {
    return 'node-' + nextId++;
}

/**
 * Recursively assigns unique IDs to nodes if they don't have one and
 * initializes the 'collapsed' state for folder nodes if it's undefined.
 * This is crucial for interactive editing and preserving UI state.
 * @param {Object} node - The current node to process within the tree structure.
 */
function assignIdsAndCollapsedState(node) {
    // Assign a new unique ID if the node doesn't already have one.
    if (!node.id) {
        node.id = generateUniqueId();
    }

    // If the node is a folder, ensure it has a 'collapsed' state.
    if (node.type === 'folder') {
        if (typeof node.collapsed === 'undefined') {
            node.collapsed = false; // Default new or loaded folders to expanded.
        }
        // Recursively apply to children if they exist.
        if (node.children) {
            node.children.forEach(child => assignIdsAndCollapsedState(child));
        }
    }
}

/**
 * Finds a node in the tree by its unique ID using a depth-first search.
 * @param {Object} root - The root of the tree (or subtree) to search from.
 * @param {string} id - The unique ID of the node to find.
 * @returns {Object|null} The found node object, or null if no node with the given ID is found.
 */
function findNodeById(root, id) {
    if (!root) return null; // Base case: if root is null, node cannot be found.

    if (root.id === id) {
        return root; // Node found!
    }

    // If the current node has children, recursively search within them.
    if (root.children) {
        for (const child of root.children) {
            const found = findNodeById(child, id);
            if (found) {
                return found; // Return if found in a child's subtree.
            }
        }
    }
    return null; // Node not found in this subtree.
}

/**
 * Finds a node's parent in the tree by the node's ID.
 * This is essential for modifying the tree structure (e.g., deleting or moving nodes).
 * @param {Object} root - The root of the tree to search.
 * @param {string} id - The ID of the node whose parent we need to find.
 * @returns {Object|null} The parent node object, or null if the parent is not found
 * (e.g., for the absolute root node itself, which has no parent).
 */
function findNodeParent(root, id) {
    // Check if any immediate child of the current root has the target ID.
    if (root.children && root.children.some(child => child.id === id)) {
        return root; // Current root is the parent.
    }

    // If the current root has children, recursively search in their subtrees.
    if (root.children) {
        for (const child of root.children) {
            const foundParent = findNodeParent(child, id);
            if (foundParent) {
                return foundParent; // Return if parent found in a child's subtree.
            }
        }
    }
    return null; // Parent not found in this subtree.
}

/**
 * Validates if a given object has the basic structure of a tree node expected by the application.
 * This check ensures that loaded JSON files conform to the expected data model.
 * @param {Object} tree - The object to validate.
 * @returns {boolean} True if the object has the basic tree node structure (name, type, children), false otherwise.
 */
function isValidTreeStructure(tree) {
    return (
        typeof tree === 'object' && tree !== null &&
        'name' in tree && typeof tree.name === 'string' &&
        'type' in tree && (tree.type === 'folder' || tree.type === 'file') && // Ensures 'type' is 'folder' or 'file'.
        'children' in tree && Array.isArray(tree.children) // Ensures 'children' exists and is an array.
    );
}


// =============================================================================
// Tree Generation & Formatting Functions
// =============================================================================
// These functions convert the internal tree data structure into displayable formats (ASCII, Markdown).

/**
 * Recursively generates an ASCII art representation of the directory tree.
 * Handles different rendering for the conceptual root versus regular nodes.
 * @param {Object} node - The current node in the tree (folder or file) to render.
 * @param {string} indent - The current indentation string (e.g., '│   ', '    ').
 * @param {boolean} isLast - True if the current node is the last child of its parent,
 * affecting the connector (└── vs ├──).
 * @returns {string} The ASCII string representation of the node and its children.
 */
function generateAsciiTree(node, indent = '', isLast = true) {
    let output = '';

    // Special handling for the absolute conceptual root node (which has id 'root').
    // The root itself doesn't get a prefix, only its name and then its children.
    if (node.id === 'root') {
        output += node.name + '\n';

        if (node.children && node.children.length > 0) {
            // Sort children of the root using the custom sort function.
            const sortedChildren = [...node.children].sort(customNodeSort);

            // Recursively call for children of the root.
            // They start with an empty initial 'indent' and 'isLast' determined by their position.
            sortedChildren.forEach((child, index) => {
                output += generateAsciiTree(child, '', index === sortedChildren.length - 1);
            });
        }
        return output; // Return early after processing the root and its direct children.
    }

    // Normal handling for all other nodes (non-root).
    // Determine the connector prefix based on whether it's the last child.
    const prefix = indent + (isLast ? '└── ' : '├── ');
    output += prefix + node.name + '\n'; // Add the current node's name with its prefix.

    // If the node is a folder and has children, process them.
    if (node.children && node.children.length > 0) {
        // Calculate the indentation for children: add '    ' if parent is last, '│   ' if not.
        const childIndent = indent + (isLast ? '    ' : '│   ');
        // Sort children using the custom sort function for consistent output.
        const sortedChildren = [...node.children].sort(customNodeSort);

        // Recursively call for each child.
        sortedChildren.forEach((child, index) => {
            output += generateAsciiTree(child, childIndent, index === sortedChildren.length - 1);
        });
    }
    return output;
}

/**
 * Recursively generates a Markdown list representation of the directory tree.
 * Each level is indented with two spaces.
 * @param {Object} node - The current node in the tree to render.
 * @param {number} level - The current indentation level (0 for root, 1 for its children, etc.).
 * @returns {string} The Markdown string representation of the node and its children.
 */
function generateMarkdownTree(node, level = 0) {
    let output = '';
    const indent = '  '.repeat(level); // Use two spaces per level for Markdown list indentation.
    output += `${indent}- ${node.name}\n`; // Add the current node as a list item.

    // If the node is a folder and has children, process them.
    if (node.children && node.children.length > 0) {
        // Sort children using the custom sort function for consistent output.
        const sortedChildren = [...node.children].sort(customNodeSort);
        // Recursively call for each child, increasing the indentation level.
        sortedChildren.forEach(child => {
            output += generateMarkdownTree(child, level + 1);
        });
    }
    return output;
}

/**
 * Manages the active and disabled states of the tree display buttons.
 * @param {HTMLElement} activeButton - The button to set as active (e.g., showAsciiBtn).
 * @param {HTMLElement} inactiveButton - The button to set as inactive (e.g., showMarkdownBtn).
 */
function setActiveDisplayButton(activeButton, inactiveButton) {
    // Add active class and disable the active button
    activeButton.classList.add('active');
    activeButton.disabled = true;

    // Remove active class and enable the inactive button
    inactiveButton.classList.remove('active');
    inactiveButton.disabled = false;
}


// =============================================================================
// Interactive Tree Editor Functions
// =============================================================================
// These functions manage the visual display and user interactions for editing the tree (add, rename, delete, collapse).

/**
 * Renders a single tree node into the DOM for the interactive editor.
 * This function is specifically designed for child nodes, not the conceptual root, which is handled separately in `refreshInteractiveTreeEditor`.
 * @param {Object} node - The tree node object to render.
 * @param {HTMLElement} parentElement - The DOM element to append this node's structure to.
 * @param {number} level - Current indentation level for visual display (0 for direct children of root).
 * @param {Array<boolean>} indentationLines - Array indicating if vertical lines should be drawn at each parent level's indentation.
 * @param {boolean} isLastChild - True if this node is the last child of its parent, affecting visual connectors.
 */
function renderInteractiveTreeNode(node, parentElement, level, indentationLines, isLastChild) {
    // Sanity check: This function should not be called for the main conceptual root node.
    if (node.id === 'root') {
        console.error("renderInteractiveTreeNode was called with the root node. This function is intended for rendering child nodes only.");
        return;
    }

    const nodeElement = document.createElement('div');
    nodeElement.classList.add('tree-node');
    nodeElement.dataset.nodeId = node.id; // Store node's unique ID for easy lookup.

    const nodeLine = document.createElement('div');
    nodeLine.classList.add('node-line'); // Container for the visual line components of a node.

    // --- Indentation and Vertical Lines (Visual Tree Structure) ---
    // Create indentation divs to control spacing and draw vertical lines for parent branches.
    for (let i = 0; i < level; i++) {
        const indentDiv = document.createElement('div');
        indentDiv.classList.add('node-indent');
        // If a vertical line should be drawn at this level (i.e., parent at this level is not its last child)
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
        // Use setTimeout to ensure focus and selection work after DOM update.
        // A small delay helps ensure the browser/Electron window has fully gained focus.
        setTimeout(() => {
            nameElement.focus();
            nameElement.select();
        }, 50);

        // Function to save the new name when input loses focus or Enter is pressed.
        const saveName = () => {
            const newName = nameElement.value.trim();
            if (newName === '') {
                displayMessage('Name cannot be empty.', 'error'); // Replaced alert()
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
                displayMessage(`An item named "${newName}" already exists in this directory.`, 'error'); // Replaced alert()
                nameElement.focus(); // Keep focus if duplicate.
                return;
            }

            node.name = newName; // Update node's name in the data.

            // --- Special sorting logic for "..." name ---
            // Assign userOrder for special sorting if name becomes '...'.
            // Remove userOrder if renamed away from "..."
            if (newName === '...') {
                node.userOrder = Date.now();
            } else if (typeof node.userOrder === 'number') {
                delete node.userOrder;
            }
            // --- End special sorting logic ---

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

        // Sort children for consistent display using the custom sort function.
        const sortedChildren = [...node.children].sort(customNodeSort);

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
 * Regenerates and renders the entire interactive tree display from the `currentTreeData`.
 * This function handles the conceptual root node separately and then calls
 * `renderInteractiveTreeNode` for its children.
 */
function refreshInteractiveTreeEditor() {
    interactiveTreeEditor.innerHTML = ''; // Clear existing content to re-render from scratch.

    // If no tree data exists (e.g., initial state), display a placeholder message.
    if (!currentTreeData) {
        interactiveTreeEditor.innerHTML = '<p class="placeholder-text">Select a folder or load a tree to get started, or add items manually.</p>';
        return;
    }

    // Ensure all nodes have unique IDs and a 'collapsed' state for folders, important for UI interactions.
    assignIdsAndCollapsedState(currentTreeData);

    // --- Render the conceptual root's dedicated line ---
    const rootLineDiv = document.createElement('div');
    rootLineDiv.classList.add('root-display-line');
    rootLineDiv.dataset.nodeId = currentTreeData.id; // Store root's ID for potential interactions.

    // Root toggle (always visible, but functionally hidden if no children)
    const rootToggle = document.createElement('span');
    rootToggle.classList.add('node-toggle');
    if (currentTreeData.children && currentTreeData.children.length > 0) {
        // Display caret based on collapsed state.
        rootToggle.innerHTML = currentTreeData.collapsed ? '<i class="bi bi-caret-right-fill"></i>' : '<i class="bi bi-caret-down-fill"></i>';
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
    rootIcon.classList.add('node-icon', 'bi', 'bi-folder-fill'); // Root is always a folder icon.
    rootLineDiv.appendChild(rootIcon);

    // Root name (editable input or display span)
    let rootNameElement;
    if (nodeBeingEdited === currentTreeData.id) {
        // If root is in edit mode, render an input field.
        rootNameElement = document.createElement('input');
        rootNameElement.type = 'text';
        rootNameElement.classList.add('node-name-input');
        rootNameElement.value = currentTreeData.name;
        // Use setTimeout for root name input focus to ensure proper focus after DOM update.
        setTimeout(() => {
            rootNameElement.focus();
            rootNameElement.select();
        }, 50);

        const saveRootName = () => {
            const newName = rootNameElement.value.trim();
            if (newName === '') {
                displayMessage('Root name cannot be empty.', 'error'); // Replaced alert()
                rootNameElement.focus();
                return;
            }
            currentTreeData.name = newName; // Update root's name in the data.
            nodeBeingEdited = null; // Exit edit mode.
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
        // If not in edit mode, render a display span.
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
        // Use native confirm for critical, destructive actions.
        if (confirm('Are you sure you want to clear all contents of this tree? This cannot be undone.')) {
            currentTreeData.children = []; // Clear children array.
            nodeBeingEdited = null; // Exit any active edit mode.
            refreshInteractiveTreeEditor(); // Re-render.
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII.
            toggleTreeOutputButtons(); // Update button states.
            displayMessage('All tree contents cleared.', 'success'); // Confirmation message
        }
    });
    rootActions.appendChild(deleteBtnRoot);

    rootLineDiv.appendChild(rootActions);
    interactiveTreeEditor.appendChild(rootLineDiv);


    // --- Render children of the root ---
    // Only render children if the root is a folder and not collapsed.
    if (currentTreeData.type === 'folder' && currentTreeData.children && !currentTreeData.collapsed) {
        // Sort the root's children before rendering using the custom sort function.
        const sortedRootChildren = [...currentTreeData.children].sort(customNodeSort);

        const rootChildrenContainer = document.createElement('div');
        rootChildrenContainer.classList.add('node-children');
        interactiveTreeEditor.appendChild(rootChildrenContainer);

        // Initial indentation lines for children of the root: empty array (level 0 for renderInteractiveTreeNode).
        const initialIndentationLines = [];

        // Call renderInteractiveTreeNode for each child, starting at visual level 0.
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
 * Toggles the 'collapsed' state of a folder node by its ID and re-renders the interactive tree.
 * Collapsing a folder hides its children in the interactive editor.
 * @param {string} nodeId - The ID of the folder node to toggle.
 */
function toggleNodeCollapse(nodeId) {
    const node = findNodeById(currentTreeData, nodeId);
    if (node && node.type === 'folder') {
        node.collapsed = !node.collapsed; // Flip the collapsed state (true to false, or false to true).
        refreshInteractiveTreeEditor(); // Re-render to show/hide children based on new collapsed state.
    }
}

/**
 * Adds a new file or folder node to the tree as a child of a specified parent node.
 * The new node is given a unique default name and immediately put into edit mode.
 * The `userOrder` property is NOT assigned here; it will be assigned if the user renames the node to '...'.
 * @param {string} parentNodeId - The ID of the parent node to add the new item to.
 * @param {'file'|'folder'} type - The type of node to add ('file' or 'folder').
 */
function promptAddNode(parentNodeId, type) {
    const parentNode = findNodeById(currentTreeData, parentNodeId);
    // Ensure parent exists and is a folder before attempting to add children.
    if (!parentNode || parentNode.type !== 'folder') {
        displayMessage('Cannot add items to this. It must be a folder.', 'error'); // Replaced alert()
        return;
    }

    // Generate a unique default name for the new node to avoid immediate conflicts.
    const defaultBaseName = type === 'folder' ? 'new_folder' : 'new_file';
    const extension = type === 'file' ? '.txt' : '';
    let newName = defaultBaseName + extension;
    let counter = 1;

    // Increment counter until a truly unique name is found among siblings of the same type.
    while (parentNode.children && parentNode.children.some(child => child.name === newName && child.type === type)) {
        newName = `${defaultBaseName}_${counter}${extension}`;
        counter++;
    }

    // Create the new node object. 'userOrder' is intentionally omitted here.
    const newNode = {
        id: generateUniqueId(), // Assign a new unique ID.
        name: newName,
        type: type,
        children: type === 'folder' ? [] : undefined, // Initialize children array for new folders.
        collapsed: type === 'folder' ? false : undefined // Default new folders to expanded.
    };

    // Initialize children array for parent if it doesn't exist yet.
    if (!parentNode.children) {
        parentNode.children = [];
    }
    parentNode.children.push(newNode); // Add the new node to parent's children array.

    // If the parent folder was collapsed, expand it to make the new child visible.
    if (parentNode.collapsed) {
        parentNode.collapsed = false;
    }

    nodeBeingEdited = newNode.id; // Set the new node as the one currently in edit mode.

    refreshInteractiveTreeEditor(); // Re-render the tree to show the newly added node.
    treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII output.
    toggleTreeOutputButtons(); // Update button states.
}

/**
 * Deletes a node from the tree by its ID after confirming with the user.
 * This action is irreversible.
 * @param {string} nodeIdToDelete - The ID of the node to delete.
 */
function deleteNode(nodeIdToDelete) {
    const nodeToDelete = findNodeById(currentTreeData, nodeIdToDelete);

    // Confirmation dialog before a destructive action. Native confirm is used for this.
    if (!nodeToDelete || !confirm(`Are you sure you want to delete "${nodeToDelete.name}"? This action cannot be undone.`)) {
        return; // If node not found or user cancels, stop.
    }

    const parentNode = findNodeParent(currentTreeData, nodeIdToDelete);
    if (parentNode && parentNode.children) {
        // Filter out the node to be deleted from its parent's children array.
        parentNode.children = parentNode.children.filter(child => child.id !== nodeIdToDelete);
        displayMessage(`"${nodeToDelete.name}" deleted successfully.`, 'success'); // Confirmation message.
    } else {
        console.error("Could not find parent for node to delete:", nodeIdToDelete);
        displayMessage("Error: Could not delete item. Parent not found or item is the root.", 'error'); // Replaced alert()
        return;
    }

    // If the deleted node was in edit mode, exit edit mode.
    if (nodeBeingEdited === nodeIdToDelete) {
        nodeBeingEdited = null;
    }

    refreshInteractiveTreeEditor(); // Re-render the tree to reflect the deletion.
    treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII output.
    toggleTreeOutputButtons(); // Update button states.
}


// =============================================================================
// Initial Setup and Event Listeners
// =============================================================================

// This code runs once the DOM (Document Object Model) is fully loaded.
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch initial settings (like last selected folder or default ignored folders) from the main process.
        const settings = await window.electronAPI.getInitialSettings();
        if (settings.lastSelectedFolder) {
            currentRootFolderPath = settings.lastSelectedFolder;
            selectedFolderPathSpan.textContent = settings.lastSelectedFolder;
        }
        // Populate the ignored folders input with default or previously saved settings.
        ignoredFoldersInput.value = settings.defaultIgnoredFolders || '.git, node_modules, .DS_Store';
    } catch (error) {
        console.error('Error loading initial settings:', error);
        displayMessage('Error loading initial settings. Check console for details.', 'error');
    }

    // Initialize the currentTreeData with a conceptual root node.
    currentTreeData = {
        id: 'root',
        name: "project_root",
        type: "folder",
        children: []
    };

    refreshInteractiveTreeEditor(); // Render the initial (potentially empty) interactive tree.
    treeOutput.textContent = generateAsciiTree(currentTreeData); // Generate initial ASCII output for display.

    // IMPORTANT: Call toggleTreeOutputButtons first (if it manages other buttons or initial disabled states)
    // Then, immediately override the ASCII/Markdown button states using setActiveDisplayButton.
    toggleTreeOutputButtons();
    setActiveDisplayButton(showAsciiBtn, showMarkdownBtn); // This sets ASCII as active/disabled, Markdown as inactive/enabled.
});


// --- Event Listeners for User Actions ---

// Event listener for the "Select Folder" button.
selectFolderBtn.addEventListener('click', async () => {
    try {
        // Call the main process to open a native folder selection dialog.
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) {
            currentRootFolderPath = folderPath; // Store the selected path.
            selectedFolderPathSpan.textContent = folderPath; // Display the path in the UI.
            displayMessage(`Folder selected: ${folderPath}. \n<i>Generate Tree</i> to render`, 'info'); // Confirmation message.
        } else {
            selectedFolderPathSpan.textContent = 'No folder selected';
            currentRootFolderPath = null;
            displayMessage('Folder selection cancelled.', 'info'); // User cancelled message.
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
        displayMessage('Error selecting folder. Check console for details.', 'error'); // Replaced alert()
    }
});

// Event listener for the "Generate Tree" button.
generateTreeBtn.addEventListener('click', async () => {
    if (!currentRootFolderPath) {
        displayMessage('Please select a folder first before generating a tree.', 'info'); // Replaced alert()
        return;
    }

    // Parse the ignored folders input, cleaning and filtering empty items.
    const ignoredFoldersText = ignoredFoldersInput.value.trim();
    const ignoreList = ignoredFoldersText ?
        ignoredFoldersText.split(',').map(item => item.trim()).filter(item => item !== '') :
        [];
    const useGitignore = useGitignoreCheckbox.checked;

    // Create a deep copy of the current tree data before attempting to generate a new one.
    // This allows rolling back to the previous state if tree generation fails or results in an empty tree.
    const previousTreeData = JSON.parse(JSON.stringify(currentTreeData));

    try {
        // Call the main process to generate the directory tree based on selected folder and ignore rules.
        const generatedRootNode = await window.electronAPI.generateTree(currentRootFolderPath, ignoreList, useGitignore);

        // Check if the generated tree is effectively empty (e.g., all contents ignored or folder was empty).
        if (generatedRootNode.type === 'folder' && (!generatedRootNode.children || generatedRootNode.children.length === 0)) {
            displayMessage(`The selected folder "${generatedRootNode.name}" or its contents were fully ignored or empty, resulting in an empty tree. The previous tree view has been retained.`, 'info', 7000); // Replaced alert()
            // Revert to previous tree data if the newly generated tree is empty.
            currentTreeData = previousTreeData;
            refreshInteractiveTreeEditor();
            treeOutput.textContent = generateAsciiTree(currentTreeData);
            toggleTreeOutputButtons();
            return;
        }

        // Update the current tree data with the newly generated tree.
        currentTreeData = generatedRootNode;
        currentTreeData.id = 'root'; // Ensure the generated root is marked as the conceptual root.

        // Assign IDs and collapsed state for all nodes in the new tree for interactive editing.
        assignIdsAndCollapsedState(currentTreeData);
        refreshInteractiveTreeEditor(); // Re-render the interactive editor with the new tree.
        treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII output.
        toggleTreeOutputButtons(); // Update button states based on the new tree's content.
        displayMessage('Directory tree generated successfully!', 'success'); // Success message.
    } catch (error) {
        console.error('Error generating tree:', error);
        displayMessage(`An error occurred while generating the tree: ${error.message}`, 'error', 7000); // Replaced alert()
        // On error, revert to the previous tree data to avoid data loss or blank screen.
        currentTreeData = previousTreeData;
        refreshInteractiveTreeEditor();
        treeOutput.textContent = generateAsciiTree(currentTreeData);
        toggleTreeOutputButtons();
    }
});

// Event listener for showing ASCII tree output.
showAsciiBtn.addEventListener('click', () => {
    // Only generate and display if there's valid tree data with children.
    if (currentTreeData) {
        treeOutput.textContent = generateAsciiTree(currentTreeData);
        setActiveDisplayButton(showAsciiBtn, showMarkdownBtn);
    } else {
        displayMessage('No tree data available to show. Generate or load a tree first.', 'info'); // Replaced alert()
    }
});

// Event listener for showing Markdown tree output.
showMarkdownBtn.addEventListener('click', () => {
    // Only generate and display if there's valid tree data with children.
    if (currentTreeData) {
        treeOutput.textContent = generateMarkdownTree(currentTreeData);
        setActiveDisplayButton(showMarkdownBtn, showAsciiBtn);
    } else {
        displayMessage('No tree data available to show. Generate or load a tree first.', 'info'); // Replaced alert()
    }
});

// Event listener for "Save Tree" button.
saveTreeBtn.addEventListener('click', async () => {
    // Ensure there's a tree to save.
    if (!currentTreeData || !currentTreeData.children || currentTreeData.children.length === 0) {
        displayMessage('No tree to save. Please generate or load one first, or add items to the editor.', 'info'); // Replaced alert()
        return;
    }

    try {
        // Create a deep copy of the tree data to avoid modifying the live object and to remove temporary properties.
        const treeDataForSave = JSON.parse(JSON.stringify(currentTreeData));

        // Function to clean up temporary properties (id, collapsed) before saving.
        // NOTE: 'userOrder' is intentionally NOT deleted here, as it defines user-intended sorting for "..." items.
        function cleanNodeForSave(node) {
            delete node.id; // Remove internal IDs that are not part of the standard tree structure.
            delete node.collapsed; // Remove collapse state, as it's a UI-specific property.
            // Recursively apply cleanup to children.
            if (node.children) {
                node.children.forEach(cleanNodeForSave);
            }
        }
        cleanNodeForSave(treeDataForSave); // Clean the data before sending to main process for saving.

        // Call the main process to open a save dialog and save the cleaned tree data.
        const result = await window.electronAPI.saveTreeFile(treeDataForSave);
        if (result.success) {
            displayMessage(result.message, 'success'); // Replaced alert()
        } else {
            // If save was cancelled or failed for another reason not caught by try/catch.
            displayMessage(result.message || 'Tree saving was cancelled or encountered an unknown issue.', 'info');
        }
    } catch (error) {
        console.error('Error saving tree:', error);
        displayMessage(`An error occurred while saving the tree: ${error.message}`, 'error'); // Replaced alert()
    }
});

// Event listener for "Load Tree" button.
loadTreeBtn.addEventListener('click', async () => {
    try {
        const result = await window.electronAPI.loadTreeFile();
        if (result.success) {
            let loadedTree = result.tree;

            // Validate the structure of the loaded JSON to ensure it's a valid tree.
            if (!isValidTreeStructure(loadedTree)) {
                displayMessage('The selected file does not appear to contain a valid directory tree structure. Please ensure it\'s a JSON file generated by this application.', 'error', 7000);
                return; // Stop execution, preserving the previous tree view.
            }

            // Ensure the loaded tree's root has the correct ID and a default name if missing.
            if (!loadedTree.id || loadedTree.id !== 'root') {
                loadedTree.id = 'root';
            }
            if (loadedTree.id === 'root' && !loadedTree.name) {
                loadedTree.name = "project_root";
            }

            // If validation passes, update the current tree data and refresh the UI components.
            currentTreeData = loadedTree;
            assignIdsAndCollapsedState(currentTreeData); // Assign/ensure IDs and collapsed states for interactive editing.
            refreshInteractiveTreeEditor(); // Re-render the interactive editor.
            treeOutput.textContent = generateAsciiTree(currentTreeData); // Update ASCII output.
            toggleTreeOutputButtons(); // Update button states.

            displayMessage('Tree loaded successfully!', 'success'); // Success message.
        }
        // If result.success is false (e.g., user cancelled the file dialog),
        // nothing happens here, and currentTreeData remains unchanged, which is the desired behavior.

    } catch (error) {
        // This catch block handles errors like file not found, permission issues, or
        // fundamental JSON parsing errors (if the file is not valid JSON at all).
        displayMessage(`Error loading file: ${error.message}. Please ensure it's a valid JSON file.`, 'error', 7000);
        console.error('Error loading file:', error);

        // On a critical error (like invalid JSON), reset the interactive editor
        // to a clear state, but preserve the previous tree data if possible.
        // If 'currentTreeData' was already bad, it's reset to an empty conceptual tree.
        if (!currentTreeData || !isValidTreeStructure(currentTreeData)) {
            currentTreeData = { id: 'root', name: "project_root", type: "folder", children: [] };
        }
        interactiveTreeEditor.innerHTML = '<p class="placeholder-text error">Could not load tree. Please ensure it\'s a valid JSON structure.</p>';
        treeOutput.textContent = '';
        toggleTreeOutputButtons();
    }
});

// Event listener for "Copy to Clipboard" button.
copyToClipboardBtn.addEventListener('click', async () => {
    const textToCopy = treeOutput.textContent; // Get the content from the text area.
    // Ensure there's content to copy (text is not empty and tree actually has children).
    if (!textToCopy || !currentTreeData || !currentTreeData.children || currentTreeData.children.length === 0) {
        displayMessage('Nothing to copy. Please generate or load a tree first.', 'info');
        return;
    }
    try {
        // Call the main process to copy text to the system clipboard.
        const result = await window.electronAPI.copyToClipboard(textToCopy);
        if (result.success) {
            displayMessage(result.message, 'success');
        } else {
            // This might catch cases where clipboard access is denied or other OS-level issues.
            displayMessage(`Failed to copy to clipboard: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error copying to clipboard:', error);
        displayMessage(`An unexpected error occurred while copying to clipboard: ${error.message}`, 'error');
    }
});