import { apiCall } from '../services/api.js';
import { showToast } from '../utils/toast.js';
import { Container } from '../models/types.js';
import { ContainerInfoModal } from './InfoModal.js';
import { SettingsModal } from './SettingsModal.js';
import { LogsModal } from './LogsModal.js';
import { ENDPOINTS } from '../services/endpoints.js';
import { getCurrentUser } from '../services/auth.js';

export class ContainerTable {
    private tableBody: HTMLTableSectionElement;
    private tableHead: HTMLTableSectionElement;
    private containers: Container[] = [];
    private previousContainers: Container[] = [];
    private containerUpdateStatus: Map<number, 'new' | 'updated'> = new Map();
    private isLoading = false;
    private isAdmin = false;

    // Components to trigger
    private infoModal: ContainerInfoModal;
    private settingsModal: SettingsModal;
    private logsModal: LogsModal;

    constructor(
        tableId: string,
        infoModal: ContainerInfoModal,
        settingsModal: SettingsModal,
        logsModal: LogsModal
    ) {
        this.tableBody = document.querySelector(`#${tableId} tbody`) as HTMLTableSectionElement;
        this.tableHead = document.querySelector(`#${tableId} thead`) as HTMLTableSectionElement;
        this.infoModal = infoModal;
        this.settingsModal = settingsModal;
        this.logsModal = logsModal;
        
        const user = getCurrentUser();
        this.isAdmin = user.is_admin;

        if (!this.tableBody) {
             console.error(`Table #${tableId} tbody not found`);
        }
        
        // Add Owner header if admin
        if (this.isAdmin && this.tableHead) {
            const headerRow = this.tableHead.querySelector('tr');
            if (headerRow) {
               // Check if Owner header already exists
               if (!headerRow.querySelector('.header-owner')) {
                   const th = document.createElement('th');
                   th.className = 'header-owner';
                   th.textContent = 'Owner';
                   // Insert before Status or Settings
                   // Assuming columns: Name, Status, Settings
                   // Let's insert after Name (index 1)
                   headerRow.insertBefore(th, headerRow.children[1]);
               }
            }
        }
    }

    public async refresh() {
        this.isLoading = true;
        this.render();
        
        try {
            const response = await apiCall<Container[]>(ENDPOINTS.CONTAINERS.LIST);
            
            if (response.error) {
                showToast(response.error, 'error');
            } else if (Array.isArray(response)) {
                this.containers = response;
                if (this.previousContainers.length === 0) {
                    this.previousContainers = [...response];
                }
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to fetch containers', 'error');
        } finally {
            this.isLoading = false;
            this.render();
        }
    }

    public async smartRefresh() {
        try {
            const response = await apiCall<Container[]>(ENDPOINTS.CONTAINERS.LIST);
            
            if (response.error) {
                console.warn('Auto-refresh error:', response.error);
                return;
            }
            
            if (Array.isArray(response)) {
                const newContainers = response as Container[];
                const changes = this.checkForChanges(this.previousContainers, newContainers);
                
                if (changes.hasChanges) {
                    console.log('Container changes detected, updating UI...');
                    this.containers = newContainers;
                    this.previousContainers = [...newContainers];
                    
                    this.containerUpdateStatus.clear();
                    const oldMap = new Map<number, Container>();
                    this.previousContainers.forEach(c => oldMap.set(c.id, c));
                    
                    newContainers.forEach(newC => {
                        const oldC = oldMap.get(newC.id);
                        if (!oldC) {
                            this.containerUpdateStatus.set(newC.id, 'new');
                        } else if (oldC.status !== newC.status) {
                            this.containerUpdateStatus.set(newC.id, 'updated');
                        }
                    });
                    
                    this.render();
                    
                    if (changes.newContainers > 0 || changes.updatedContainers > 0) {
                        let message = '';
                        if (changes.newContainers > 0) message += `${changes.newContainers} new container(s) added.`;
                        if (changes.updatedContainers > 0) {
                            if (message) message += ' ';
                            message += `${changes.updatedContainers} container(s) updated.`;
                        }
                        showToast(message, 'info', 3000);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    private checkForChanges(oldC: Container[], newC: Container[]) {
        let newCount = 0;
        let updatedCount = 0;
        const oldMap = new Map(oldC.map(c => [c.id, c]));
        
        newC.forEach(nc => {
            const oc = oldMap.get(nc.id);
            if (!oc) newCount++;
            else if (oc.status !== nc.status) updatedCount++;
        });

        return {
            hasChanges: newCount > 0 || updatedCount > 0,
            newContainers: newCount,
            updatedContainers: updatedCount
        };
    }

    private render() {
        if (!this.tableBody) return;
        this.tableBody.innerHTML = '';

        const colSpan = this.isAdmin ? 4 : 3;

        if (this.isLoading) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="${colSpan}" style="text-align:center">Loading containers...</td>`;
            this.tableBody.appendChild(row);
            return;
        }

        if (this.containers.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="${colSpan}" style="text-align:center">No containers found. Create your first container!</td>`;
            this.tableBody.appendChild(row);
            return;
        }

        this.containers.forEach(container => {
            const row = document.createElement('tr');
            
            // Name
            const nameCell = document.createElement('td');
            const nameLink = document.createElement('span'); // Changed from 'a' to 'span' or keep 'a' with href="#"
            // Actually keeping implementation but fixing the logic
            const nameContent = document.createElement('a');
            nameContent.href = '#';
            nameContent.textContent = container.name;
            nameContent.className = 'container-name-link';
            
            const status = this.containerUpdateStatus.get(container.id);
            // Highlight new/updated
            if (status === 'new') nameContent.classList.add('container-new');
            else if (status === 'updated') nameContent.classList.add('container-updated');
            
            nameContent.addEventListener('click', (e) => {
                e.preventDefault();
                this.infoModal.open(container);
            });
            nameCell.appendChild(nameContent);
            row.appendChild(nameCell);

            // Owner (Admin only)
            if (this.isAdmin) {
                const ownerCell = document.createElement('td');
                ownerCell.textContent = container.owner_name || 'Unknown';
                row.appendChild(ownerCell);
            }

            // Status
            const statusCell = document.createElement('td');
            const statusInd = document.createElement('span');
            statusInd.className = `status-indicator status-${container.status}`;
            if (status === 'updated') statusInd.classList.add('status-updated');
            statusCell.appendChild(statusInd);
            row.appendChild(statusCell);

            // Actions
            const actionsCell = document.createElement('td');
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'container-actions';

            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'settings-btn';
            settingsBtn.innerHTML = '⚙️';
            settingsBtn.addEventListener('click', () => this.settingsModal.open(container));
            actionsDiv.appendChild(settingsBtn);

            if (container.status === 'running') {
                const stopBtn = this.createActionBtn('Stop', 'stop-btn', () => this.handleAction(container.id, 'stop'));
                actionsDiv.appendChild(stopBtn);
                const restartBtn = this.createActionBtn('Restart', 'restart-btn', () => this.handleAction(container.id, 'restart'));
                actionsDiv.appendChild(restartBtn);
            } else {
                const startBtn = this.createActionBtn('Start', 'start-btn', () => this.handleAction(container.id, 'start'));
                actionsDiv.appendChild(startBtn);
            }

            const deleteBtn = this.createActionBtn('Delete', 'delete-btn', () => this.handleAction(container.id, 'delete'));
            actionsDiv.appendChild(deleteBtn);

            const logsBtn = this.createActionBtn('Logs', 'logs-btn', () => this.logsModal.open(container.id));
            actionsDiv.appendChild(logsBtn);

            actionsCell.appendChild(actionsDiv);
            row.appendChild(actionsCell);

            this.tableBody.appendChild(row);
        });
    }

    private createActionBtn(text: string, className: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.className = `action-btn ${className}`;
        btn.textContent = text;
        btn.addEventListener('click', onClick);
        return btn;
    }

    private async handleAction(containerId: number, action: string) {
        if (!confirm(`Are you sure you want to ${action} this container?`)) return;

        const response = await apiCall(ENDPOINTS.CONTAINERS.ACTION(containerId, action), 'POST');
        if (response.error) {
            showToast(response.error, 'error');
        } else {
            const msg = (response as any).message || `${action} successful`;
            showToast(msg, 'success');
            await this.refresh();
        }
    }
}
