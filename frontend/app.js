"use strict";
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
    function getToastContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }
    function showToast(message, type = 'info', duration = 4000) {
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
                        return { error: 'Session expired. Please log in again.' };
                    }
                    try {
                        const errorData = yield response.json();
                        console.error(`${response.status} Error from ${endpoint}:`, errorData);
                        return { error: errorData.error || errorData.message || `API request failed (${response.status})` };
                    }
                    catch (_a) {
                        const text = yield response.text();
                        console.error(`${response.status} Error from ${endpoint}:`, text);
                        return { error: `API request failed (${response.status}): ${text}` };
                    }
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
                showToast(response.error, 'error');
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
                showToast(response.error, 'error');
            }
            else {
                const msg = response.message || `${action.charAt(0).toUpperCase() + action.slice(1)} successful`;
                showToast(String(msg), 'success');
                yield fetchContainers();
            }
        });
    }
    // Open settings modal
    function openSettings(container) {
        currentContainer = container;
        if (!modal || !settingsForm)
            return;
        // Set form values
        document.getElementById('container-title').value = container.name;
        document.getElementById('container-description').value = container.description || '';
        // Set environment variables
        const envContainer = document.getElementById('environment-variables');
        envContainer.innerHTML = '';
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
    settingsForm.addEventListener('submit', (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        const name = document.getElementById('container-title').value;
        const description = document.getElementById('container-description').value;
        // Parse environment variables
        const containerData = {
            name,
            description,
        };
        if (currentContainer) {
            // Update existing container
            const response = yield apiCall(`/api/containers/${currentContainer.id}`, 'PUT', containerData);
            if (response.error) {
                showToast(response.error, 'error');
            }
            else {
                showToast('Container updated successfully', 'success');
                yield fetchContainers();
                closeModal();
            }
        }
        else {
            // Create new container
            const response = yield apiCall('/api/containers', 'POST', containerData);
            if (response.error) {
                showToast(response.error, 'error');
            }
            else {
                showToast('Container created successfully', 'success');
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
