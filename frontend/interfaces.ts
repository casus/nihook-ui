interface GitlabRepository {
    id: number;
    url: string;
    access_token?: string;
    container_id: number;
}

interface Container {
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

type ApiResponse<T> = T & {
    error?: string;
    message?: string;
};