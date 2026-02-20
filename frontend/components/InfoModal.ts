import { Container } from '../models/types.js';

export class ContainerInfoModal {
    private modal: HTMLDivElement;
    private modalId: string = 'container-info-modal';

    constructor() {
        this.modal = document.getElementById(this.modalId) as HTMLDivElement;
        
        if (!this.modal) throw new Error(`${this.modalId} not found`);

        this.bindEvents();
    }

    private bindEvents() {
        const closeBtn = this.modal.querySelector('.close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });
    }

    public open(container: Container) {
        if (!this.modal) return;
        
        // Show info
        const nameElem = document.getElementById('container-info-name');
        const statusElem = document.getElementById('container-info-status');
        const pathElem = document.getElementById('container-info-folder-path');
        const portElem = document.getElementById('container-info-port');
        const urlElem = document.getElementById('container-info-url') as HTMLAnchorElement;
        const instElem = document.getElementById('container-info-instructions');

        if (nameElem) nameElem.textContent = container.name;
        if (statusElem) statusElem.textContent = container.status;
        if (pathElem) pathElem.textContent = container.folder_path || 'N/A';
        
        if (portElem) {
            if (container.ports) {
                const ports = container.ports.split('_');
                if (ports.length > 0) {
                     const lastPort = ports[ports.length - 1];
                     portElem.textContent = lastPort.length > 4 ? lastPort.slice(-4) : lastPort;
                } else {
                     portElem.textContent = container.ports;
                }
            } else {
                 portElem.textContent = 'N/A';
            }
        }
        
        if (urlElem) {
            if (container.public_url) {
                urlElem.href = container.public_url;
                urlElem.textContent = container.public_url;
            } else {
                urlElem.href = '#';
                urlElem.textContent = 'N/A';
            }
        }

        if (instElem) {
            if (container.instructions) {
                if (typeof (window as any).marked !== 'undefined') {
                     instElem.innerHTML = (window as any).marked.parse(container.instructions);
                } else {
                     instElem.innerText = container.instructions;
                }
            } else {
                 instElem.innerHTML = '<p>No instructions available.</p>';
            }
        }

        this.modal.style.display = 'block';
    }

    public close() {
        this.modal.style.display = 'none';
        // Clear references
    }
}
