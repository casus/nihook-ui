// Move interfaces from app.ts and interfaces.ts here.
// I will need to check interfaces.ts content again, read it fully.

export interface ApiResponse<T> {
    error?: string;
    message?: string;
    data?: T; 
}

// Actually, the original type was `T & { ... }`.
// Let's stick to the original flexible type to minimize refactor friction,
// or define a proper response structure if backend is consistent.
// Backend returns `jsonify(container.to_dict())` or `jsonify([list])`.
// So the response body IS the data T.
// But if error, it returns `{"error": "..."}`.
// So `T & { error?: string }` is accurate enough for JSON parsing result.

export type ApiResult<T> = T & {
    error?: string;
    message?: string;
};

// Check interfaces from app.ts (GitlabRepository, Container, AuthResponse)

export interface GitlabRepository {
    id: number;
    url: string;
    access_token?: string;
    container_id: number;
}

export interface Container {
    id: number;
    name: string;
    status: string;
    description: string;
    folder_path?: string;
    podman_id?: string;
    ports?: string;
    public_url?: string;
    instructions?: string;
    gitlab_repositories?: GitlabRepository[];
}

export interface AuthResponse {
    access_token: string;
    user_id: number;
    username: string;
}
