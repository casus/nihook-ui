export function getAuthToken(): string | null {
    return localStorage.getItem('access_token');
}

export function getCurrentUser(): { id: string | null; username: string | null } {
    return {
        id: localStorage.getItem('user_id'),
        username: localStorage.getItem('username')
    };
}

export function logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    window.location.href = '/login';
}

export function checkAuth(): void {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login';
    }
}
