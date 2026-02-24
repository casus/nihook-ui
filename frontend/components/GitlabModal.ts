import { apiCall, ApiResponse } from '../services/api.js';
import { showToast } from '../utils/toast.js';
import { GitlabRepository } from '../models/types.js';
import { ENDPOINTS } from '../services/endpoints.js';

export class GitlabManager {
    private modal: HTMLDivElement;
    private listElement: HTMLDivElement;
    private currentRepos: GitlabRepository[] = [];
    private currentContainerId: number | null = null;
    private onUpdate: () => void;

    constructor(
        modalId: string, 
        listContainerId: string,
        onUpdateCallback: () => void = () => {}
    ) {
        this.modal = document.getElementById(modalId) as HTMLDivElement;
        this.listElement = document.getElementById(listContainerId) as HTMLDivElement;
        this.onUpdate = onUpdateCallback;
        
        this.bindEvents();
    }

    private bindEvents() {
        const addBtn = document.getElementById('add-gitlab-repo-btn');
        const saveBtn = document.getElementById('save-gitlab-repos-btn');
        const closeBtn = this.modal.querySelector('.close');

        if (addBtn) addBtn.addEventListener('click', () => this.addRepoRow());
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveRepos());
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    public async openForContainer(containerId: number) {
        this.currentContainerId = containerId;
        const response = await apiCall<GitlabRepository[]>(ENDPOINTS.CONTAINERS.GITLAB.LIST(containerId));
        
        if (response.error) {
            showToast(response.error, 'error');
            return;
        }

        this.currentRepos = (response as GitlabRepository[]) || [];
        this.render();
        this.modal.style.display = 'block';
    }

    public close() {
        this.modal.style.display = 'none';
        this.currentContainerId = null;
        this.currentRepos = [];
    }

    private render() {
        if (!this.listElement) return;
        this.listElement.innerHTML = '';
        
        this.currentRepos.forEach((repo, index) => {
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
            
            // Should add change listener to update internal model? 
            // Or just read from DOM on save. DOM read is simpler for now.
            
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
            removeBtn.addEventListener('click', () => {
                this.currentRepos.splice(index, 1);
                this.render();
            });

            row.appendChild(urlGroup);
            row.appendChild(tokenGroup);
            row.appendChild(removeBtn);
            this.listElement.appendChild(row);
        });
    }

    private addRepoRow() {
        if (!this.currentContainerId) return;
        
        this.currentRepos.push({
            id: 0,
            url: '',
            access_token: '',
            container_id: this.currentContainerId
        });
        this.render();
    }

    private async saveRepos() {
        if (!this.currentContainerId) return;
        
        // Read from DOM to get edited values
        const rows = this.listElement.querySelectorAll('.gitlab-repo-row');
        const updatedRepos: { url: string; access_token: string }[] = [];
        
        rows.forEach(row => {
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
            // New logic: Fetch existing, Diff, Sync
            const existingReposResponse = await apiCall<GitlabRepository[]>(ENDPOINTS.CONTAINERS.GITLAB.LIST(this.currentContainerId));
            const existingRepos = (existingReposResponse as GitlabRepository[]) || [];
            
            const existingRepoMap = new Map<string, GitlabRepository>();
            (existingRepos as GitlabRepository[]).forEach(r => existingRepoMap.set(r.url, r));
            
            const processedUrls = new Set<string>();
            let hasError = false;

            for (const repo of updatedRepos) {
                processedUrls.add(repo.url);
                const existing = existingRepoMap.get(repo.url);
                let res: ApiResponse<any>;
                
                if (existing) {
                    if (repo.access_token) {
                         res = await apiCall(ENDPOINTS.CONTAINERS.GITLAB.UPDATE(this.currentContainerId, repo.url), 'PUT', repo);
                         if (res.error) {
                             showToast(`Failed to update ${repo.url}: ${res.error}`, 'error');
                             hasError = true;
                         }
                    }
                } else {
                    res = await apiCall(ENDPOINTS.CONTAINERS.GITLAB.CREATE(this.currentContainerId), 'POST', repo);
                    if (res.error) {
                        showToast(`Failed to create ${repo.url}: ${res.error}`, 'error');
                        hasError = true;
                    }
                }
            }
            
            for (const existing of existingRepos) {
                if (!processedUrls.has(existing.url)) {
                    const res = await apiCall(ENDPOINTS.CONTAINERS.GITLAB.DELETE(this.currentContainerId, existing.url), 'DELETE');
                    if (res.error) {
                        showToast(`Failed to delete ${existing.url}: ${res.error}`, 'error');
                        hasError = true;
                    }
                }
            }

            if (!hasError) {
                showToast('GitLab repositories saved successfully', 'success');
                this.close();
            }
            if (this.onUpdate) this.onUpdate();
            
        } catch (error) {
            showToast('Failed to save GitLab repositories', 'error');
            console.error(error);
        }
    }
}
