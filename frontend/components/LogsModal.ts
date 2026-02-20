import { apiCall, ApiResponse } from '../services/api.js';
import { showToast } from '../utils/toast.js';
import { ENDPOINTS } from '../services/endpoints.js';

export class LogsModal {
    private modal: HTMLDivElement;
    private containerId: number | null = null;
    private currentFilename: string | null = null;
    private filesList: HTMLDivElement;
    private viewer: HTMLDivElement;
    private content: HTMLDivElement;
    private filenameEl: HTMLHeadingElement;

    constructor() {
        this.modal = document.getElementById('logs-modal') as HTMLDivElement;
        this.filesList = document.getElementById('log-files-list') as HTMLDivElement;
        this.viewer = document.getElementById('log-content-viewer') as HTMLDivElement;
        this.content = document.getElementById('log-content') as HTMLDivElement;
        this.filenameEl = document.getElementById('current-log-filename') as HTMLHeadingElement;

        this.bindEvents();
    }

    private bindEvents() {
        if (!this.modal) return;
        
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());

        window.addEventListener('click', (e: MouseEvent) => { // Use explicit type
            if (e.target === this.modal) this.close();
        });

        const refreshBtn = document.getElementById('refresh-log-btn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshLog());
        
        const downloadBtn = document.getElementById('download-log-btn');
        if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadLog());
    }

    public open(containerId: number) {
        this.containerId = containerId;
        this.currentFilename = null;
        
        if (!this.filesList || !this.viewer) return;

        this.filesList.innerHTML = '<p>Loading log files...</p>';
        this.viewer.style.display = 'none';
        
        this.modal.style.display = 'block';
        this.fetchLogFiles();
    }

    public close() {
        if (this.modal) this.modal.style.display = 'none';
        this.containerId = null;
    }

    private async fetchLogFiles() {
        if (!this.containerId) return;

        try {
            const response = await apiCall<{files: string[]}>(ENDPOINTS.CONTAINERS.LOGS.LIST(this.containerId));
            
            if (response.error) {
                if (this.filesList) 
                    this.filesList.innerHTML = `<p class="error-message">Error loading log files: ${response.error}</p>`;
                return;
            }

            const files = (response as any).files || [];
            
            if (files.length === 0) {
                if (this.filesList) 
                    this.filesList.innerHTML = '<p>No log files found in this container.</p>';
                return;
            }

            if (this.filesList) {
                this.filesList.innerHTML = '<h3>Available Log Files:</h3>';
                const container = document.createElement('div');
                container.className = 'log-file-buttons';
                
                files.forEach((name: string) => {
                    const btn = document.createElement('button');
                    btn.className = 'log-file-btn';
                    btn.textContent = name;
                    btn.addEventListener('click', () => this.fetchLogContent(name));
                    container.appendChild(btn);
                });
                
                this.filesList.appendChild(container);
            }
        } catch (e) {
            console.error(e);
            if (this.filesList) this.filesList.innerHTML = '<p class="error-message">Error fetching logs.</p>';
        }
    }

    private async fetchLogContent(filename: string) {
        if (!this.containerId) return;
        this.currentFilename = filename;

        if (this.viewer) this.viewer.style.display = 'block';
        if (this.content) this.content.innerHTML = '<p>Loading log content...</p>';
        if (this.filenameEl) this.filenameEl.textContent = filename;

        try {
            const response = await apiCall<{filename: string, content: string}>(
                ENDPOINTS.CONTAINERS.LOGS.GET(this.containerId, filename)
            );

            if (response.error) {
                if (this.content) this.content.innerHTML = `<p class="error-message">Error loading log: ${response.error}</p>`;
                return;
            }

            const content = (response as any).content || 'Log file is empty';
            if (this.content) this.content.innerHTML = `<pre>${this.escapeHtml(content)}</pre>`;
        } catch (e) {
            console.error(e);
            if (this.content) this.content.innerHTML = '<p class="error-message">Error fetching content.</p>';
        }
    }

    private refreshLog() {
        if (this.currentFilename) {
            this.fetchLogContent(this.currentFilename);
        }
    }

    private async downloadLog() {
        if (!this.containerId || !this.currentFilename) return;
        
        try {
            const response = await apiCall<{filename: string, content: string}>(
                ENDPOINTS.CONTAINERS.LOGS.GET(this.containerId, this.currentFilename)
            );
            
            if (response.error) {
                showToast(`Failed to download log: ${response.error}`, 'error');
                return;
            }
            
            const content = (response as any).content || '';
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = this.currentFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast(`Downloaded ${this.currentFilename} successfully`, 'success');
        } catch (e) {
            console.error(e);
            showToast('Download failed', 'error');
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
