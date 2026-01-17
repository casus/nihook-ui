var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// Global state
let containers = [];
let currentContainer = null;
let isLoading = false;
// DOM elements
document.addEventListener('DOMContentLoaded', () => {
    var _a;
    const tableBody = document.querySelector('#containers-table tbody');
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.querySelector('.close');
    const settingsForm = document.getElementById('settings-form');
    const createContainerBtn = document.getElementById('create-container-btn');
    // Helper function to get auth token
    function getAuthToken() {
        return localStorage.getItem('access_token');
    }
    // Helper function to make authenticated API calls
    function apiCall(endpoint_1) {
        return __awaiter(this, arguments, void 0, function* (endpoint, method = 'GET', data = null) {
            const token = getAuthToken();
            if (!token) {
                window.location.href = '/login';
                return { error: 'Not authenticated' };
            }
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                };
                const options = {
                    method,
                    headers
                };
                if (data) {
                    options.body = JSON.stringify(data);
                }
                const response = yield fetch(endpoint, options);
                if (!response.ok) {
                    if (response.status === 401) {
                        // Token expired, redirect to login
                        localStorage.removeItem('access_token');
                        localStorage.removeItem('user_id');
                        localStorage.removeItem('username');
                        window.location.href = '/login';
                    }
                    const errorData = yield response.json();
                    return { error: errorData.error || 'API request failed' };
                }
                return yield response.json();
            }
            catch (error) {
                console.error('API call error:', error);
                return { error: 'Network error. Please try again.' };
            }
        });
    }
    // Fetch containers from API
    function fetchContainers() {
        return __awaiter(this, void 0, void 0, function* () {
            isLoading = true;
            renderTable();
            const response = yield apiCall('/api/containers');
            if (response.error) {
                alert(response.error);
            }
            else if (response && Array.isArray(response)) {
                containers = response;
            }
            isLoading = false;
            renderTable();
        });
    }
    // Render table rows
    function renderTable() {
        if (!tableBody)
            return;
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
            }
            else {
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
    function handleContainerAction(containerId, action) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!confirm(`Are you sure you want to ${action} this container?`)) {
                return;
            }
            const endpoint = `/api/containers/${containerId}/${action}`;
            const response = yield apiCall(endpoint, 'POST');
            if (response.error) {
                alert(response.error);
            }
            else {
                alert(response.message || `${action.charAt(0).toUpperCase() + action.slice(1)} successful`);
                yield fetchContainers();
            }
        });
    }
    // Open settings modal
    function openSettings(container) {
        var _a, _b;
        currentContainer = container;
        if (!modal || !settingsForm)
            return;
        // Set form values
        document.getElementById('container-title').value = container.name;
        document.getElementById('container-description').value = container.description || '';
        document.getElementById('container-image').value = container.image || 'alpine';
        document.getElementById('container-ports').value = ((_a = container.ports) === null || _a === void 0 ? void 0 : _a.join(', ')) || '';
        document.getElementById('container-volumes').value = ((_b = container.volumes) === null || _b === void 0 ? void 0 : _b.join(', ')) || '';
        // Set environment variables
        const envContainer = document.getElementById('environment-variables');
        envContainer.innerHTML = '';
        if (container.environment && Object.keys(container.environment).length > 0) {
            for (const [key, value] of Object.entries(container.environment)) {
                addEnvironmentVariable(key, value);
            }
        }
        else {
            addEnvironmentVariable('', '');
        }
        modal.style.display = 'block';
    }
    // Add environment variable input
    function addEnvironmentVariable(key = '', value = '') {
        var _a;
        const envContainer = document.getElementById('environment-variables');
        const envRow = document.createElement('div');
        envRow.className = 'env-row';
        envRow.innerHTML = `
            <input type="text" class="env-key" placeholder="KEY" value="${key}">
            <input type="text" class="env-value" placeholder="VALUE" value="${value}">
            <button type="button" class="remove-env-btn">×</button>
        `;
        envContainer.appendChild(envRow);
        // Add event listener to remove button
        (_a = envRow.querySelector('.remove-env-btn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
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
    settingsForm.addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
        e.preventDefault();
        const name = document.getElementById('container-title').value;
        const description = document.getElementById('container-description').value;
        const image = document.getElementById('container-image').value;
        const portsInput = document.getElementById('container-ports').value;
        const volumesInput = document.getElementById('container-volumes').value;
        // Parse ports and volumes
        const ports = portsInput.split(',').map(p => p.trim()).filter(p => p);
        const volumes = volumesInput.split(',').map(v => v.trim()).filter(v => v);
        // Parse environment variables
        const envRows = document.querySelectorAll('.env-row');
        const environment = {};
        envRows.forEach(row => {
            const key = row.querySelector('.env-key').value.trim();
            const value = row.querySelector('.env-value').value.trim();
            if (key) {
                environment[key] = value;
            }
        });
        const containerData = {
            name,
            description,
            image,
            ports,
            volumes,
            environment
        };
        if (currentContainer) {
            // Update existing container
            const response = yield apiCall(`/api/containers/${currentContainer.id}`, 'PUT', containerData);
            if (response.error) {
                alert(response.error);
            }
            else {
                alert('Container updated successfully');
                yield fetchContainers();
                closeModal();
            }
        }
        else {
            // Create new container
            const response = yield apiCall('/api/containers', 'POST', containerData);
            if (response.error) {
                alert(response.error);
            }
            else {
                alert('Container created successfully');
                yield fetchContainers();
                closeModal();
            }
        }
    }));
    // Set up add environment variable button
    (_a = document.getElementById('add-env-btn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => {
        addEnvironmentVariable();
    });
    // Set up create container button
    createContainerBtn.addEventListener('click', () => {
        currentContainer = null;
        // Reset form
        document.getElementById('container-title').value = '';
        document.getElementById('container-description').value = '';
        document.getElementById('container-image').value = 'alpine';
        document.getElementById('container-ports').value = '';
        document.getElementById('container-volumes').value = '';
        // Reset environment variables
        const envContainer = document.getElementById('environment-variables');
        envContainer.innerHTML = '';
        addEnvironmentVariable();
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
    renderTable();
});
