import { apiCall, ApiResponse } from '../services/api.js';
import { showToast } from '../utils/toast.js';
import { Container, User } from '../models/types.js';
import { getCurrentUser } from '../services/auth.js';
import { ENDPOINTS } from '../services/endpoints.js';

export class SettingsModal {
    private modal: HTMLDivElement;
    private form: HTMLFormElement;
    private currentContainer: Container | null = null;
    private onUpdate: () => void;
    private onEditTokens: (container: Container) => void; 
    private ownerSelect: HTMLSelectElement | null = null;

    constructor(
        modalId: string, 
        formId: string, 
        onUpdateCallback: () => void,
        onEditTokensContainer: (c: Container) => void
    ) {
        this.modal = document.getElementById(modalId) as HTMLDivElement;
        this.form = document.getElementById(formId) as HTMLFormElement;
        this.ownerSelect = document.getElementById('owner-select') as HTMLSelectElement;
        this.onUpdate = onUpdateCallback;
        this.onEditTokens = onEditTokensContainer;
        
        this.bindEvents();
    }

    private bindEvents() {
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        const tokensBtn = document.getElementById('edit-gitlab-tokens-btn');
        if (tokensBtn) {
            tokensBtn.addEventListener('click', () => {
                if (this.currentContainer) {
                    this.onEditTokens(this.currentContainer);
                }
            });
        }

        if (this.form) {
             this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }

    public async open(container: Container | null = null) {
        this.currentContainer = container;
        const user = getCurrentUser();
        
        // Reset form or set values
        const titleInput = document.getElementById('container-title') as HTMLInputElement;
        const descInput = document.getElementById('container-description') as HTMLTextAreaElement;
        
        if (titleInput) titleInput.value = container ? container.name : '';
        if (descInput) descInput.value = container ? (container.description || '') : '';

        // Show/Hide Owner change section for admin
        const ownerSection = document.getElementById('owner-change-section');
        if (ownerSection && user.is_admin && container) {
            ownerSection.style.display = 'block';
            await this.loadUsers(container.owner_id);
        } else if (ownerSection) {
            ownerSection.style.display = 'none';
        }

        // Toggle GitLab section
        const gitlabSection = document.querySelector('.gitlab-section') as HTMLDivElement;
        if (gitlabSection) {
            // Only show if editing existing container
            gitlabSection.style.display = container ? 'block' : 'none';
        }

        this.modal.style.display = 'block';
    }

    private async loadUsers(currentOwnerId?: number) {
        if (!this.ownerSelect) return;
        
        try {
            const token = localStorage.getItem('access_token');
            // Assuming this endpoint exists and returns User[]
            const response = await fetch('/api/users/', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const users: User[] = await response.json();
                this.ownerSelect.innerHTML = '';
                users.forEach(u => {
                    const option = document.createElement('option');
                    option.value = u.id.toString();
                    option.textContent = u.username + (u.is_admin ? ' (Admin)' : '');
                    if (currentOwnerId && u.id === currentOwnerId) {
                        option.selected = true;
                    }
                    this.ownerSelect!.appendChild(option);
                });
            }
        } catch (e) {
            console.error('Failed to load users for owner select', e);
        }
    }

    public close() {
        this.modal.style.display = 'none';
        this.currentContainer = null;
        if (this.ownerSelect) this.ownerSelect.innerHTML = '';
    }

    private async handleSubmit(e: Event) {
        e.preventDefault();
        
        const submitBtn = this.form.querySelector('button[type="submit"]') as HTMLButtonElement;
        if (!submitBtn) return;

        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        
        const titleInput = document.getElementById('container-title') as HTMLInputElement;
        const descInput = document.getElementById('container-description') as HTMLTextAreaElement;
        
        const name = titleInput.value;
        const description = descInput.value;

        const data: any = { name, description };
        
        // Include owner_id if present and visible
        const ownerSection = document.getElementById('owner-change-section');
        if (ownerSection && ownerSection.style.display !== 'none' && this.ownerSelect) {
            const newOwnerId = parseInt(this.ownerSelect.value);
            if (!isNaN(newOwnerId)) {
                data['owner_id'] = newOwnerId;
            }
        }
        
        let result: any; // Using generic any to simplify response handling here
        
        try {
            const token = localStorage.getItem('access_token');
            const url = this.currentContainer 
                ? `/api/containers/${this.currentContainer.id}`
                : '/api/containers/'; // Endpoints.CONTAINERS.CREATE might need slash handling

            const response = await fetch(url, {
                method: this.currentContainer ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            
            result = await response.json();
            
            if (response.ok) {
                showToast('Saved successfully', 'success');
                this.close();
                this.onUpdate();
            } else {
                 showToast(result.error || 'Failed to save', 'error');
            }
        } catch (error) {
             console.error(error);
             showToast('Network error', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    }
}
