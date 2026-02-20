// The current apiCall in `app.ts` is basically `fetch` utility.
import { getAuthToken } from './auth.js';

// Define ApiResponse type that wraps success or error.
// The existing `app.ts` uses `type ApiResponse<T> = T & { error?: string; message?: string; }`.
// This is slightly confusing if T is an array, e.g. Container[].
// Array<Container> & { error?: string } is valid in TS.

export type ApiResponse<T> = T & {
    error?: string;
    message?: string;
};

export async function apiCall<T>(endpoint: string, method: string = 'GET', data: any = null): Promise<ApiResponse<T>> {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login';
        // Force type cast for error return
        return { error: 'Not authenticated' } as ApiResponse<T>;
    }
    
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        
        const options: RequestInit = {
            method,
            headers
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
            if (response.status === 401) {
                // Token expired, redirect to login
                localStorage.removeItem('access_token');
                localStorage.removeItem('user_id');
                localStorage.removeItem('username');
                window.location.href = '/login';
                return { error: 'Session expired. Please log in again.' } as ApiResponse<T>;
            }
            
            try {
                const errorData = await response.json();
                console.error(`${response.status} Error from ${endpoint}:`, errorData);
                return { error: errorData.error || errorData.message || `API request failed (${response.status})` } as ApiResponse<T>;
            } catch {
                const text = await response.text();
                console.error(`${response.status} Error from ${endpoint}:`, text);
                return { error: `API request failed (${response.status}): ${text}` } as ApiResponse<T>;
            }
        }
        
        return await response.json() as ApiResponse<T>;
    } catch (error) {
        console.error('API call error:', error);
        return { error: 'Network error. Please try again.' } as ApiResponse<T>;
    }
}
