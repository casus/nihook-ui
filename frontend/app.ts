// Main Entry Point
import { checkAuth, logout, getCurrentUser } from './services/auth.js';
import { ContainerTable } from './components/ContainerTable.js';
import { SettingsModal } from './components/SettingsModal.js';
import { ContainerInfoModal } from './components/InfoModal.js';
import { LogsModal } from './components/LogsModal.js';
import { GitlabManager } from './components/GitlabModal.js';

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    const user = getCurrentUser();
    if (!user.username || !localStorage.getItem('access_token')) {
        window.location.href = '/login';
        return;
    }
    
    const display = document.getElementById('username-display');
    if (display) display.textContent = `Logged in as: ${user.username}`;
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => logout());
    }

    // Initialize Modals - Pass IDs or Element selectors if needed, or rely on hardcoded IDs
    const infoModal = new ContainerInfoModal();
    const logsModal = new LogsModal();
    
    // Gitlab Modal
    const gitlabModal = new GitlabManager('gitlab-modal', 'gitlab-repos-list', () => {
        // Optional callback if needed after saving repos
    });

    // Settings Modal
    const settingsModal = new SettingsModal(
        'settings-modal', 
        'settings-form',
        () => {
             // On success callback -> refresh table
             if (table) table.refresh();
        },
        (container) => {
             // On edit tokens callback -> open gitlab modal
             gitlabModal.openForContainer(container.id);
        }
    );

    // Container Table
    const table = new ContainerTable(
        'containers-table',
        infoModal,
        settingsModal,
        logsModal
    );

    // Initial Load
    table.refresh();

    // Create Container Button
    const createBtn = document.getElementById('create-container-btn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            settingsModal.open(null);
        });
    }

    // Auto Refresh
    const refreshInterval = setInterval(() => {
        table.smartRefresh();
    }, 10000);

    window.addEventListener('beforeunload', () => {
        clearInterval(refreshInterval);
    });
});
