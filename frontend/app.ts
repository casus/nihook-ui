// Container interface
interface Container {
    id: number;
    name: string;
    status: string;
    description: string;
}

// API Response interfaces
interface ApiResponse<T> {
    data?: T;
    error?: string;
    message?: string;
}

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
            return { error: 'Not authenticated' };
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
                    return { error: 'Session expired. Please log in again.' };
                }
                
                try {
                    const errorData = await response.json();
                    console.error(`${response.status} Error from ${endpoint}:`, errorData);
                    return { error: errorData.error || errorData.message || `API request failed (${response.status})` };
                } catch {
                    const text = await response.text();
                    console.error(`${response.status} Error from ${endpoint}:`, text);
                    return { error: `API request failed (${response.status}): ${text}` };
                }
            }
            
            return await response.json();
        } catch (error) {
            console.error('API call error:', error);
            return { error: 'Network error. Please try again.' };
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

            // Name cell
            const nameCell = document.createElement('td');
            nameCell.textContent = container.name;
            row.appendChild(nameCell);

            // Status cell
            const statusCell = document.createElement('td');
            const statusIndicator = document.createElement('span');
            statusIndicator.className = `status-indicator status-${container.status}`;
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
        
        // Set environment variables
        const envContainer = document.getElementById('environment-variables') as HTMLDivElement;
        envContainer.innerHTML = '';

        modal.style.display = 'block';
    }
    
    // Add environment variable input
    function addEnvironmentVariable(key: string = '', value: string = '') {
        const envContainer = document.getElementById('environment-variables') as HTMLDivElement;
        const envRow = document.createElement('div');
        envRow.className = 'env-row';
        
        envRow.innerHTML = `
            <input type="text" class="env-key" placeholder="KEY" value="${key}">
            <input type="text" class="env-value" placeholder="VALUE" value="${value}">
            <button type="button" class="remove-env-btn">×</button>
        `;
        
        envContainer.appendChild(envRow);
        
        // Add event listener to remove button
        envRow.querySelector('.remove-env-btn')?.addEventListener('click', () => {
            envContainer.removeChild(envRow);
        });
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
    });
    
    // Set up add environment variable button
    document.getElementById('add-env-btn')?.addEventListener('click', () => {
        addEnvironmentVariable();
    });
    
    // Set up create container button
    createContainerBtn.addEventListener('click', () => {
        currentContainer = null;
        
        // Reset form
        (document.getElementById('container-title') as HTMLInputElement).value = '';
        (document.getElementById('container-description') as HTMLTextAreaElement).value = '';
        
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
});