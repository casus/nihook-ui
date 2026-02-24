import { Container, User } from '../models/types.js';

export class AdminManager {
    private usersTableBody: HTMLElement;
    private userRoleModal!: HTMLElement;
    private userIdToEdit: number | null = null;
    private refreshCallback: () => void;

    constructor(
        usersTableId: string, 
        refreshCallback: () => void
    ) {
        const table = document.getElementById(usersTableId);
        this.usersTableBody = table?.querySelector('tbody') as HTMLElement;
        this.refreshCallback = refreshCallback;
        
        this.createUserRoleModal();
    }

    private createUserRoleModal() {
        // Create modal for user role editing if it doesn't exist
        let modalDiv = document.getElementById('user-role-modal') as HTMLElement;
        
        if (!modalDiv) {
            modalDiv = document.createElement('div');
            modalDiv.id = 'user-role-modal';
            modalDiv.className = 'modal';
            modalDiv.innerHTML = `
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2>Edit User Role</h2>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="is-admin-checkbox"> Is Admin
                        </label>
                    </div>
                    <button id="save-role-btn">Save</button>
                </div>
            `;
            document.body.appendChild(modalDiv);
        }
        
        this.userRoleModal = modalDiv;

        // Event listeners (bind regardless of whether we created it or found it)
        const closeBtn = this.userRoleModal.querySelector('.close');
        if (closeBtn) {
            // Remove old listener to prevent duplicates if any (though unlikely with cloneNode)
            // A simple approach is just to replace the element or assign onclick.
            // But here addEventListener is standard. Let's rely on single instantiation.
            closeBtn.addEventListener('click', () => {
                this.userRoleModal.style.display = 'none';
            });
        }
        
        window.addEventListener('click', (event) => {
            if (event.target === this.userRoleModal) {
                this.userRoleModal.style.display = 'none';
            }
        });

        const saveBtn = document.getElementById('save-role-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveUserRole());
        }
    }

    public async fetchUsers() {
        if (!this.usersTableBody) return;

        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch('/api/users/', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const users: User[] = await response.json();
                this.renderUsers(users);
            } else {
                console.error('Failed to fetch users');
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }

    private renderUsers(users: User[]) {
        this.usersTableBody.innerHTML = '';
        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.email || ''}</td>
                <td>${user.is_admin ? '<span class="status-running">Admin</span>' : 'User'}</td>
                <td>
                    <button class="action-btn edit-role-btn" data-id="${user.id}" data-admin="${user.is_admin}">Edit Role</button>
                </td>
            `;
            this.usersTableBody.appendChild(row);
        });

        // Add event listeners for edit buttons
        const editBtns = this.usersTableBody.querySelectorAll('.edit-role-btn');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const userId = parseInt(target.getAttribute('data-id') || '0');
                const isAdmin = target.getAttribute('data-admin') === 'true';
                this.openRoleModal(userId, isAdmin);
            });
        });
    }

    private openRoleModal(userId: number, isAdmin: boolean) {
        this.userIdToEdit = userId;
        const checkbox = document.getElementById('is-admin-checkbox') as HTMLInputElement;
        if (checkbox) {
            checkbox.checked = isAdmin;
        }
        this.userRoleModal.style.display = 'block';
    }

    private async saveUserRole() {
        if (this.userIdToEdit === null) return;

        const checkbox = document.getElementById('is-admin-checkbox') as HTMLInputElement;
        const isAdmin = checkbox.checked;

        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(`/api/users/${this.userIdToEdit}/role`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_admin: isAdmin })
            });

            if (response.ok) {
                this.userRoleModal.style.display = 'none';
                this.fetchUsers();
            } else {
                console.error('Failed to update user role');
                alert('Failed to update user role');
            }
        } catch (error) {
            console.error('Error updating user role:', error);
        }
    }
}
