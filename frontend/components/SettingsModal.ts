import { apiCall, ApiResponse } from '../services/api.js';
import { showToast } from '../utils/toast.js';
import { Container } from '../models/types.js';
import { ENDPOINTS } from '../services/endpoints.js';

export class SettingsModal {
    private modal: HTMLDivElement;
    private form: HTMLFormElement;
    private currentContainer: Container | null = null;
    private onUpdate: () => void;
    private onEditTokens: (container: Container) => void;

    constructor(
        modalId: string, 
        formId: string, 
        onUpdateCallback: () => void,
        onEditTokensCallback: (c: Container) => void
    ) {
        this.modal = document.getElementById(modalId) as HTMLDivElement;
        this.form = document.getElementById(formId) as HTMLFormElement;
        this.onUpdate = onUpdateCallback;
        this.onEditTokens = onEditTokensCallback;
        
        this.bindEvents();
    }

    private bindEvents() {
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
        
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

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    public open(container: Container | null = null) {
        this.currentContainer = container;
        
        // Reset form or set values
        const titleInput = document.getElementById('container-title') as HTMLInputElement;
        const descInput = document.getElementById('container-description') as HTMLTextAreaElement;
        
        if (titleInput) titleInput.value = container ? container.name : '';
        if (descInput) descInput.value = container ? (container.description || '') : '';

        // Toggle GitLab section
        const gitlabSection = document.querySelector('.gitlab-section') as HTMLDivElement;
        if (gitlabSection) {
            gitlabSection.style.display = container ? 'block' : 'none';
        }

        this.modal.style.display = 'block';
    }

    public close() {
        this.modal.style.display = 'none';
        this.currentContainer = null;
    }

    private async handleSubmit(e: Event) {
        e.preventDefault();
        
        const submitBtn = this.form.querySelector('button[type="submit"]') as HTMLButtonElement;
        if (!submitBtn) return;

        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading"></span> Saving...';

        try {
            const name = (document.getElementById('container-title') as HTMLInputElement).value;
            const description = (document.getElementById('container-description') as HTMLTextAreaElement).value;
            
            const data = { name, description };
            
            let response: ApiResponse<any>;
            
            if (this.currentContainer) {
                response = await apiCall(ENDPOINTS.CONTAINERS.UPDATE(this.currentContainer.id), 'PUT', data);
            } else {
                response = await apiCall(ENDPOINTS.CONTAINERS.CREATE, 'POST', data);
            }

            if (response.error) {
                showToast(response.error, 'error');
            } else {
                showToast(
                    this.currentContainer ? 'Container updated successfully' : 'Container created successfully', 
                    'success'
                );
                this.close();
                this.onUpdate();
            }
        } catch (error) {
            showToast('An unexpected error occurred', 'error');
            console.error(error);
        } finally {
            if (submitBtn && originalBtnText) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        }
    }
}
