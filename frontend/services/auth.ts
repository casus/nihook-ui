export function getAuthToken(): string | null {
    return localStorage.getItem('access_token');
}

export function getCurrentUser(): { id: string | null; username: string | null; is_admin: boolean } {
    return {
        id: localStorage.getItem('user_id'),
        username: localStorage.getItem('username'),
        is_admin: localStorage.getItem('is_admin') === 'true'
    };
}

export function logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
    window.location.href = '/login';
}

export function checkAuth(): void {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login';
    }
}
