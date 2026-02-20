
declare const marked: {
    parse: (markdown: string) => string;
};

interface AuthResponse {
    access_token: string;
    user_id: number;
    username: string;
}

// Global state
let containers: Container[] = [];
let currentContainer: Container | null = null;
let isLoading = false;

// DOM elements
document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#containers-table tbody') as HTMLTableSectionElement;
    const modal = document.getElementById('settings-modal') as HTMLDivElement;
    const closeBtn = document.querySelector('.close') as HTMLSpanElement;
    const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
    const createContainerBtn = document.getElementById('create-container-btn') as HTMLButtonElement;
    
    type ToastType = 'success' | 'error' | 'info';
    
    function getToastContainer(): HTMLDivElement {
        let container = document.getElementById('toast-container') as HTMLDivElement | null;
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }
    
    function showToast(message: string, type: ToastType = 'info', duration = 4000): void {
        const container = getToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        
        const msg = document.createElement('div');
        msg.className = 'toast-message';
        msg.textContent = message;
        
        const close = document.createElement('button');
        close.className = 'toast-close';
        close.type = 'button';
        close.textContent = '×';
        
        function removeToast() {
            toast.style.animation = 'toast-exit 0.18s ease-in forwards';
            toast.addEventListener('animationend', () => {
                if (toast.parentElement === container) {
                    container.removeChild(toast);
                }
            }, { once: true });
        }
        
        close.addEventListener('click', removeToast);
        toast.appendChild(msg);
        toast.appendChild(close);
        container.appendChild(toast);
        
        if (duration > 0) {
            setTimeout(removeToast, duration);
        }
    }
    
    // Helper function to get auth token
    function getAuthToken(): string | null {
        return localStorage.getItem('access_token');
    }
    
    // Helper function to make authenticated API calls
    async function apiCall<T>(endpoint: string, method: string = 'GET', data: any = null): Promise<ApiResponse<T>> {
        const token = getAuthToken();
        if (!token) {
            window.location.href = '/login';
            return { error: 'Not authenticated' } as ApiResponse<T>;
        }
        
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };
            
            const options: RequestInit = {
                method,
                headers
            };
            
            if (data) {
                options.body = JSON.stringify(data);
            }
            const response = await fetch(endpoint, options);
            
            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired, redirect to login
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('user_id');
                    localStorage.removeItem('username');
                    window.location.href = '/login';
                    return { error: 'Session expired. Please log in again.' } as ApiResponse<T>;
                }
                
                try {
                    const errorData = await response.json();
                    console.error(`${response.status} Error from ${endpoint}:`, errorData);
                    return { error: errorData.error || errorData.message || `API request failed (${response.status})` } as ApiResponse<T>;
                } catch {
                    const text = await response.text();
                    console.error(`${response.status} Error from ${endpoint}:`, text);
                    return { error: `API request failed (${response.status}): ${text}` } as ApiResponse<T>;
                }
            }
            
            return await response.json() as ApiResponse<T>;
        } catch (error) {
            console.error('API call error:', error);
            return { error: 'Network error. Please try again.' } as ApiResponse<T>;
        }
    }

    // Fetch containers from API
    async function fetchContainers() {
        isLoading = true;
        renderTable();
        
        const response = await apiCall<Container[]>('/api/containers');
        
        if (response.error) {
            showToast(response.error, 'error');
        } else if (response && Array.isArray(response)) {
            containers = response;
            // Initialize previousContainers after first successful fetch
            if (previousContainers.length === 0) {
                previousContainers = [...response];
            }
        }
        
        isLoading = false;
        renderTable();
    }

    // Render table rows
    function renderTable() {
        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (isLoading) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.textContent = 'Loading containers...';
            cell.style.textAlign = 'center';
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }

        if (containers.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.textContent = 'No containers found. Create your first container!';
            cell.style.textAlign = 'center';
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }

        containers.forEach(container => {
            const row = document.createElement('tr');

            // Name cell - make it clickable
            const nameCell = document.createElement('td');
            const nameLink = document.createElement('a');
            nameLink.href = '#';
            nameLink.textContent = container.name;
            nameLink.className = 'container-name-link';
            
            // Apply visual indicators for new/updated containers
            const containerUpdateStatusValue = containerUpdateStatus.get(container.id);
            if (containerUpdateStatusValue === 'new') {
                nameLink.classList.add('container-new');
            } else if (containerUpdateStatusValue === 'updated') {
                nameLink.classList.add('container-updated');
            }
            
            nameLink.addEventListener('click', (e) => {
                e.preventDefault();
                showContainerInfoModal(container);
            });
            nameCell.appendChild(nameLink);
            row.appendChild(nameCell);

            // Status cell
            const statusCell = document.createElement('td');
            const statusIndicator = document.createElement('span');
            statusIndicator.className = `status-indicator status-${container.status}`;
            
            // Apply updated status indicator if this container was updated
            if (containerUpdateStatusValue === 'updated') {
                statusIndicator.classList.add('status-updated');
            }
            
            statusCell.appendChild(statusIndicator);
            row.appendChild(statusCell);

            // Actions cell
            const actionsCell = document.createElement('td');
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'container-actions';
            
            // Settings button
            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'settings-btn';
            settingsBtn.innerHTML = '⚙️';
            settingsBtn.addEventListener('click', () => openSettings(container));
            actionsDiv.appendChild(settingsBtn);
            
            // Action buttons based on status
            if (container.status === 'running') {
                const stopBtn = document.createElement('button');
                stopBtn.className = 'action-btn stop-btn';
                stopBtn.textContent = 'Stop';
                stopBtn.addEventListener('click', () => handleContainerAction(container.id, 'stop'));
                actionsDiv.appendChild(stopBtn);
                
                const restartBtn = document.createElement('button');
                restartBtn.className = 'action-btn restart-btn';
                restartBtn.textContent = 'Restart';
                restartBtn.addEventListener('click', () => handleContainerAction(container.id, 'restart'));
                actionsDiv.appendChild(restartBtn);
            } else {
                const startBtn = document.createElement('button');
                startBtn.className = 'action-btn start-btn';
                startBtn.textContent = 'Start';
                startBtn.addEventListener('click', () => handleContainerAction(container.id, 'start'));
                actionsDiv.appendChild(startBtn);
            }
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => handleContainerAction(container.id, 'delete'));
            actionsDiv.appendChild(deleteBtn);
            
            // Logs button
            const logsBtn = document.createElement('button');
            logsBtn.className = 'action-btn logs-btn';
            logsBtn.textContent = 'Logs';
            logsBtn.addEventListener('click', () => showLogsModal(container));
            actionsDiv.appendChild(logsBtn);
            
            actionsCell.appendChild(actionsDiv);
            row.appendChild(actionsCell);

            tableBody.appendChild(row);
        });
    }
    
    // Handle container actions (start, stop, restart, delete)
    async function handleContainerAction(containerId: number, action: string) {
        if (!confirm(`Are you sure you want to ${action} this container?`)) {
            return;
        }
        
        const endpoint = `/api/containers/${containerId}/${action}`;
        const response = await apiCall(endpoint, 'POST');
        
        if (response.error) {
            showToast(response.error, 'error');
        } else {
            const msg = (response as ApiResponse<unknown>).message || `${action.charAt(0).toUpperCase() + action.slice(1)} successful`;
            showToast(String(msg), 'success');
            await fetchContainers();
        }
    }

    // Open settings modal
    function openSettings(container: Container) {
        currentContainer = container;

        if (!modal || !settingsForm) return;

        // Set form values
        (document.getElementById('container-title') as HTMLInputElement).value = container.name;
        (document.getElementById('container-description') as HTMLTextAreaElement).value = container.description || '';
        
        // Show GitLab tokens button when editing an existing container
        const gitlabSection = document.querySelector('.gitlab-section') as HTMLDivElement;
        if (gitlabSection) {
            gitlabSection.style.display = 'block';
        }

        modal.style.display = 'block';
    }
    
    // Close modal
    function closeModal() {
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Handle form submission
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = settingsForm.querySelector('button[type="submit"]') as HTMLButtonElement;
        if (!submitBtn) return;
        
        // Disable submit button and add spinner
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading"></span> Saving...';

        try {
            const name = (document.getElementById('container-title') as HTMLInputElement).value;
            const description = (document.getElementById('container-description') as HTMLTextAreaElement).value;
            
            // Parse environment variables
            
            const containerData = {
                name,
                description,
            };
            
            if (currentContainer) {
                // Update existing container
                const response = await apiCall(`/api/containers/${currentContainer.id}`, 'PUT', containerData);
                
                if (response.error) {
                    showToast(response.error, 'error');
                } else {
                    showToast('Container updated successfully', 'success');
                    await fetchContainers();
                    closeModal();
                }
            } else {
                // Create new container
                const response = await apiCall('/api/containers', 'POST', containerData);
                
                if (response.error) {
                    showToast(response.error, 'error');
                } else {
                    showToast('Container created successfully', 'success');
                    await fetchContainers();
                    closeModal();
                }
            }
        } catch (error) {
            showToast('An unexpected error occurred', 'error');
            console.error('Form submission error:', error);
        } finally {
            // Restore submit button
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
    
    // Set up create container button
    createContainerBtn.addEventListener('click', () => {
        currentContainer = null;
        
        // Reset form
        (document.getElementById('container-title') as HTMLInputElement).value = '';
        (document.getElementById('container-description') as HTMLTextAreaElement).value = '';
        
        // Hide GitLab tokens button when creating new container
        const gitlabSection = document.querySelector('.gitlab-section') as HTMLDivElement;
        if (gitlabSection) {
            gitlabSection.style.display = 'none';
        }
        
        // Show modal
        modal.style.display = 'block';
    });

    // Event listeners
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Initial render
    fetchContainers();
    
    // Set up smart auto-refresh every 10 seconds
    let previousContainers: Container[] = [];
    
    // Track container update status for visual feedback
    let containerUpdateStatus: Map<number, 'new' | 'updated'> = new Map();
    
    async function smartRefresh() {
        try {
            const response = await apiCall<Container[]>('/api/containers');
            
            if (response.error) {
                console.warn('Auto-refresh error:', response.error);
                return;
            }
            
            if (response && Array.isArray(response)) {
                const newContainers = response;
                
                // Compare with previous state
                const changes = checkForContainerChanges(previousContainers, newContainers);
                
                if (changes.hasChanges) {
                    console.log('Container changes detected, updating UI...');
                    containers = newContainers;
                    previousContainers = [...newContainers]; // Store a copy
                    
                    // Track which containers are new or updated for visual feedback
                    containerUpdateStatus.clear();
                    
                    // Create a map of old containers by ID for quick lookup
                    const oldContainerMap = new Map<number, Container>();
                    previousContainers.forEach(container => {
                        oldContainerMap.set(container.id, container);
                    });
                    
                    // Check each new container and mark its status
                    newContainers.forEach(newContainer => {
                        const oldContainer = oldContainerMap.get(newContainer.id);
                        
                        if (!oldContainer) {
                            // This is a new container
                            containerUpdateStatus.set(newContainer.id, 'new');
                        } else if (oldContainer.status !== newContainer.status) {
                            // This container's status has changed
                            containerUpdateStatus.set(newContainer.id, 'updated');
                        }
                    });
                    
                    renderTable();
                    
                    // Show a subtle notification for updates
                    if (changes.newContainers > 0 || changes.updatedContainers > 0) {
                        let message = '';
                        if (changes.newContainers > 0) {
                            message += `${changes.newContainers} new container(s) added.`;
                        }
                        if (changes.updatedContainers > 0) {
                            if (message) message += ' ';
                            message += `${changes.updatedContainers} container(s) updated.`;
                        }
                        showToast(message, 'info', 3000);
                    }
                }
            }
        } catch (error) {
            console.error('Auto-refresh failed:', error);
        }
    }
    
    // Set up the smart refresh interval
    const refreshInterval = setInterval(smartRefresh, 10000);
    
    // Clean up interval on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(refreshInterval);
    });
    
    // Logs Modal Functions
    let currentLogContainer: Container | null = null;
    let currentLogFilename: string | null = null;
    
    function showLogsModal(container: Container) {
        currentLogContainer = container;
        
        const logsModal = document.getElementById('logs-modal') as HTMLDivElement;
        if (!logsModal) {
            console.error('Logs modal not found');
            return;
        }
        
        // Show loading state
        const logFilesList = document.getElementById('log-files-list') as HTMLDivElement;
        const logContentViewer = document.getElementById('log-content-viewer') as HTMLDivElement;
        
        if (logFilesList && logContentViewer) {
            logFilesList.innerHTML = '<p>Loading log files...</p>';
            logContentViewer.style.display = 'none';
        }
        
        logsModal.style.display = 'block';
        
        // Fetch available log files
        fetchLogFiles(container.id);
    }
    
    async function fetchLogFiles(containerId: number) {
        const response = await apiCall<{files: string[]}>(`/api/containers/${containerId}/logs`);
        
        const logFilesList = document.getElementById('log-files-list') as HTMLDivElement;
        const logContentViewer = document.getElementById('log-content-viewer') as HTMLDivElement;
        
        if (response.error) {
            logFilesList.innerHTML = `<p class="error-message">Error loading log files: ${response.error}</p>`;
            logContentViewer.style.display = 'none';
            return;
        }
        
        // Handle the response structure properly
        const responseData = response as ApiResponse<{files: string[]}>;
        console.log("Log files response data:", responseData);
        const files = responseData.files || [];
        
        if (files.length === 0) {
            logFilesList.innerHTML = '<p>No log files found in this container.</p>';
            logContentViewer.style.display = 'none';
            return;
        }
        
        // Create log file buttons
        logFilesList.innerHTML = '<h3>Available Log Files:</h3>';
        const fileListContainer = document.createElement('div');
        fileListContainer.className = 'log-file-buttons';
        
        files.forEach((filename: string) => {
            const fileBtn = document.createElement('button');
            fileBtn.className = 'log-file-btn';
            fileBtn.textContent = filename;
            fileBtn.addEventListener('click', () => fetchLogContent(containerId, filename));
            fileListContainer.appendChild(fileBtn);
        });
        
        logFilesList.appendChild(fileListContainer);
        logContentViewer.style.display = 'none';
    }
    
    async function fetchLogContent(containerId: number, filename: string) {
        currentLogFilename = filename;
        
        const logContent = document.getElementById('log-content') as HTMLDivElement;
        const currentLogFilenameEl = document.getElementById('current-log-filename') as HTMLHeadingElement;
        const logContentViewer = document.getElementById('log-content-viewer') as HTMLDivElement;
        
        if (!logContent || !currentLogFilenameEl || !logContentViewer) {
            console.error('Log content elements not found');
            
            return;
        }
        
        // Show loading state
        logContent.innerHTML = '<p>Loading log content...</p>';
        currentLogFilenameEl.textContent = filename;
        logContentViewer.style.display = 'block';
        
        const response = await apiCall<{filename: string, content: string}>(`/api/containers/${containerId}/logs/${filename}`);
        
        if (response.error) {
            logContent.innerHTML = `<p class="error-message">Error loading log: ${response.error}</p>`;
            return;
        }
        
        // Handle the response structure properly
        const responseData = response as ApiResponse<{filename: string, content: string}>;
        const content = responseData.content || 'Log file is empty';
        
        // Format log content with monospace font and preserve whitespace
        logContent.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
        
        // Set up event listeners for action buttons
        setupLogActionButtons(containerId, filename);
    }
    
    function setupLogActionButtons(containerId: number, filename: string) {
        const refreshBtn = document.getElementById('refresh-log-btn') as HTMLButtonElement;
        const downloadBtn = document.getElementById('download-log-btn') as HTMLButtonElement;
        
        if (refreshBtn) {
            refreshBtn.onclick = () => fetchLogContent(containerId, filename);
        }
        
        if (downloadBtn) {
            downloadBtn.onclick = () => downloadLogFile(containerId, filename);
        }
    }
    
    async function downloadLogFile(containerId: number, filename: string) {
        const response = await apiCall<{filename: string, content: string}>(`/api/containers/${containerId}/logs/${filename}`);
        
        if (response.error) {
            showToast(`Failed to download log: ${response.error}`, 'error');
            return;
        }
        
        // Handle the response structure properly
        const responseData = response as ApiResponse<{filename: string, content: string}>;
        const content = responseData.content || '';
        
        // Create download link
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Downloaded ${filename} successfully`, 'success');
    }
    
    function closeLogsModal() {
        const logsModal = document.getElementById('logs-modal') as HTMLDivElement;
        if (logsModal) {
            logsModal.style.display = 'none';
        }
    }
    
    // Helper function to check for container changes
    function checkForContainerChanges(oldContainers: Container[], newContainers: Container[]): {
        hasChanges: boolean;
        newContainers: number;
        updatedContainers: number;
    } {
        let newContainerCount = 0;
        let updatedContainerCount = 0;
        
        // Create a map of old containers by ID for quick lookup
        const oldContainerMap = new Map<number, Container>();
        oldContainers.forEach(container => {
            oldContainerMap.set(container.id, container);
        });
        
        // Check each new container
        newContainers.forEach(newContainer => {
            const oldContainer = oldContainerMap.get(newContainer.id);
            
            if (!oldContainer) {
                // This is a new container
                newContainerCount++;
            } else if (oldContainer.status !== newContainer.status) {
                // This container's status has changed
                updatedContainerCount++;
            }
            // Note: We don't remove the old container from the map here
            // because we want to detect all changes in one pass
        });
        
        const hasChanges = newContainerCount > 0 || updatedContainerCount > 0;
        
        return {
            hasChanges,
            newContainers: newContainerCount,
            updatedContainers: updatedContainerCount
        };
    }
    
    // Helper function to escape HTML for safe display
    function escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Container Info Modal Functions
    function showContainerInfoModal(container: Container) {
        const modal = document.getElementById('container-info-modal') as HTMLDivElement;
        if (!modal) {
            console.error('Container info modal not found');
            return;
        }
        
        // Set modal content
        document.getElementById('container-info-name')!.textContent = container.name;
        document.getElementById('container-info-status')!.textContent = container.status;
        
        // Folder path
        const folderPathEl = document.getElementById('container-info-folder-path')!;
        folderPathEl.textContent = container.folder_path || 'N/A';
        
        // Port - extract last 4 digits if ports exist
        const portEl = document.getElementById('container-info-port')!;
        if (container.ports) {
            const ports = container.ports.split('_');
            if (ports.length > 0) {
                const lastPort = ports[ports.length - 1];
                portEl.textContent = lastPort.length > 4 ? lastPort.slice(-4) : lastPort;
            } else {
                portEl.textContent = container.ports;
            }
        } else {
            portEl.textContent = 'N/A';
        }
        
        // Public URL
        const urlEl = document.getElementById('container-info-url') as HTMLAnchorElement;
        if (container.public_url) {
            urlEl.href = container.public_url;
            urlEl.textContent = container.public_url;
        } else {
            urlEl.href = '#';
            urlEl.textContent = 'N/A';
        }
        
        // Instructions
        const instructionsEl = document.getElementById('container-info-instructions')!;
        if (container.instructions) {
            // Format instructions with markdown-like formatting
            instructionsEl.innerHTML = formatInstructions(container.instructions);
            // instructionsEl.innerHTML = container.instructions;
        } else {
            instructionsEl.innerHTML = '<p>No instructions available.</p>';
        }
        
        modal.style.display = 'block';
    }
    
    function formatInstructions(text: string): string {
        if (typeof marked !== 'undefined') {
            return marked.parse(text);
        }
        return text;
    }
    
    function closeContainerInfoModal() {
        const modal = document.getElementById('container-info-modal') as HTMLDivElement;
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    // Add event listener for container info modal close button
    const containerInfoModal = document.getElementById('container-info-modal') as HTMLDivElement;
    const containerInfoCloseBtn = document.querySelector('#container-info-modal .close') as HTMLSpanElement;
    
    if (containerInfoCloseBtn) {
        containerInfoCloseBtn.addEventListener('click', closeContainerInfoModal);
    }
    
    window.addEventListener('click', (event) => {
        if (event.target === containerInfoModal) {
            closeContainerInfoModal();
        }
    });
    
    // Add event listener for logs modal close button
    const logsModal = document.getElementById('logs-modal') as HTMLDivElement;
    const logsCloseBtn = document.querySelector('#logs-modal .close') as HTMLSpanElement;
    
    if (logsCloseBtn) {
        logsCloseBtn.addEventListener('click', closeLogsModal);
    }
    
    window.addEventListener('click', (event) => {
        if (event.target === logsModal) {
            closeLogsModal();
        }
    });

    // GitLab Repositories Modal
    let currentGitlabRepos: GitlabRepository[] = [];
    const gitlabModal = document.getElementById('gitlab-modal') as HTMLDivElement;
    const editGitlabTokensBtn = document.getElementById('edit-gitlab-tokens-btn') as HTMLButtonElement;
    const gitlabReposList = document.getElementById('gitlab-repos-list') as HTMLDivElement;
    const addGitlabRepoBtn = document.getElementById('add-gitlab-repo-btn') as HTMLButtonElement;
    const saveGitlabReposBtn = document.getElementById('save-gitlab-repos-btn') as HTMLButtonElement;

    if (editGitlabTokensBtn) {
        editGitlabTokensBtn.addEventListener('click', () => {
            if (currentContainer) {
                openGitlabModal(currentContainer.id);
            }
        });
    }

    const gitlabModalCloseBtn = document.querySelector('#gitlab-modal .close') as HTMLSpanElement;
    if (gitlabModalCloseBtn) {
        gitlabModalCloseBtn.addEventListener('click', closeGitlabModal);
    }

    window.addEventListener('click', (event) => {
        if (event.target === gitlabModal) {
            closeGitlabModal();
        }
    });

    if (addGitlabRepoBtn) {
        addGitlabRepoBtn.addEventListener('click', addGitlabRepoRow);
    }

    if (saveGitlabReposBtn) {
        saveGitlabReposBtn.addEventListener('click', saveGitlabRepos);
    }

    async function openGitlabModal(containerId: number) {
        const response = await apiCall<GitlabRepository[]>(`/api/containers/${containerId}/gitlab-repositories`);
        
        if (response.error) {
            showToast(response.error, 'error');
            return;
        }

        currentGitlabRepos = response as GitlabRepository[] || [];
        renderGitlabReposList();
        gitlabModal.style.display = 'block';
    }

    function closeGitlabModal() {
        if (gitlabModal) {
            gitlabModal.style.display = 'none';
        }
    }

    function renderGitlabReposList() {
        if (!gitlabReposList) return;
        
        gitlabReposList.innerHTML = '';

        currentGitlabRepos.forEach((repo, index) => {
            const row = document.createElement('div');
            row.className = 'gitlab-repo-row';
            row.dataset.index = String(index);

            const urlGroup = document.createElement('div');
            urlGroup.className = 'form-group';
            const urlLabel = document.createElement('label');
            urlLabel.textContent = 'GitLab URL';
            const urlInput = document.createElement('input');
            urlInput.type = 'text';
            urlInput.value = repo.url;
            urlInput.placeholder = 'https://gitlab.com/username/repo';
            urlGroup.appendChild(urlLabel);
            urlGroup.appendChild(urlInput);

            const tokenGroup = document.createElement('div');
            tokenGroup.className = 'form-group';
            const tokenLabel = document.createElement('label');
            tokenLabel.textContent = 'Access Token';
            const tokenInput = document.createElement('input');
            tokenInput.type = 'password';
            tokenInput.value = repo.access_token === '••••••••' ? '' : (repo.access_token || '');
            tokenInput.placeholder = repo.access_token === '••••••••' ? '••••••••' : 'Enter token';
            tokenGroup.appendChild(tokenLabel);
            tokenGroup.appendChild(tokenInput);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-gitlab-repo-btn';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => removeGitlabRepoRow(index));

            row.appendChild(urlGroup);
            row.appendChild(tokenGroup);
            row.appendChild(removeBtn);
            gitlabReposList.appendChild(row);
        });
    }

    function addGitlabRepoRow() {
        const newRepo: GitlabRepository = {
            id: 0,
            url: '',
            access_token: '',
            container_id: currentContainer?.id || 0
        };
        currentGitlabRepos.push(newRepo);
        renderGitlabReposList();
    }

    function removeGitlabRepoRow(index: number) {
        currentGitlabRepos.splice(index, 1);
        renderGitlabReposList();
    }

    async function saveGitlabRepos() {
        if (!currentContainer) {
            showToast('No container selected', 'error');
            return;
        }

        const rows = gitlabReposList.querySelectorAll('.gitlab-repo-row');
        const updatedRepos: { url: string; access_token: string }[] = [];

        rows.forEach((row) => {
            const urlInput = row.querySelector('input[type="text"]') as HTMLInputElement;
            const tokenInput = row.querySelector('input[type="password"]') as HTMLInputElement;
            
            if (urlInput && urlInput.value.trim()) {
                updatedRepos.push({
                    url: urlInput.value.trim(),
                    access_token: tokenInput.value
                });
            }
        });

        try {
            const existingReposResponse = await apiCall<GitlabRepository[]>(`/api/containers/${currentContainer.id}/gitlab-repositories`);
            const existingRepos = (existingReposResponse as GitlabRepository[]) || [];
            
            // Map existing repos by URL for easy lookup
            const existingRepoMap = new Map<string, GitlabRepository>();
            existingRepos.forEach(repo => existingRepoMap.set(repo.url, repo));
            
            // Track processed URLs to find deletions later
            const processedUrls = new Set<string>();

            // Process updates and creations
            for (const repo of updatedRepos) {
                processedUrls.add(repo.url);
                const existingRepo = existingRepoMap.get(repo.url);
                
                if (existingRepo) {
                    // Update existing repo if token is provided
                    if (repo.access_token) {
                        await apiCall(`/api/containers/${currentContainer.id}/gitlab-repositories/${encodeURIComponent(repo.url)}`, 'PUT', repo);
                    }
                } else {
                    // Create new repo
                    await apiCall(`/api/containers/${currentContainer.id}/gitlab-repositories`, 'POST', repo);
                }
            }

            // Process deletions (repos that exist but were not in the updated list)
            for (const existingRepo of existingRepos) {
                if (!processedUrls.has(existingRepo.url)) {
                    await apiCall(`/api/containers/${currentContainer.id}/gitlab-repositories/${encodeURIComponent(existingRepo.url)}`, 'DELETE');
                }
            }

            showToast('GitLab repositories saved successfully', 'success');
            closeGitlabModal();
            await fetchContainers();
        } catch (error) {
            showToast('Failed to save GitLab repositories', 'error');
            console.error('Error saving gitlab repos:', error);
        }
    }
});