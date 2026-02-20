export type ToastType = 'success' | 'error' | 'info';

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

export function showToast(message: string, type: ToastType = 'info', duration = 4000): void {
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
        // Use a flag or removelistener to prevent double-removal? 
        // Once: true in listener is good enough.
        toast.addEventListener('animationend', () => {
             // Removing from DOM
             if (container.contains(toast)) {
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
