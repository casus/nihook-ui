export const ENDPOINTS = {
    CONTAINERS: {
        LIST: '/api/containers',
        CREATE: '/api/containers',
        GET: (id: number | string) => `/api/containers/${id}`,
        UPDATE: (id: number | string) => `/api/containers/${id}`,
        // Actions
        ACTION: (id: number | string, action: string) => `/api/containers/${id}/${action}`,
        START: (id: number | string) => `/api/containers/${id}/start`,
        STOP: (id: number | string) => `/api/containers/${id}/stop`,
        RESTART: (id: number | string) => `/api/containers/${id}/restart`,
        DELETE: (id: number | string) => `/api/containers/${id}/delete`,
        
        LOGS: {
            LIST: (id: number | string) => `/api/containers/${id}/logs`,
            GET: (id: number | string, filename: string) => `/api/containers/${id}/logs/${filename}`
        },
        
        GITLAB: {
            LIST: (id: number | string) => `/api/containers/${id}/gitlab-repositories`,
            CREATE: (id: number | string) => `/api/containers/${id}/gitlab-repositories`,
            UPDATE: (id: number | string, url: string) => `/api/containers/${id}/gitlab-repositories/${encodeURIComponent(url)}`,
            DELETE: (id: number | string, url: string) => `/api/containers/${id}/gitlab-repositories/${encodeURIComponent(url)}`
        }
    },
    SCHEMAS: {
        LIST: '/api/schemas',
        CREATE: '/api/schemas',
        GET: (id: number | string) => `/api/schemas/${id}`,
        UPDATE: (id: number | string) => `/api/schemas/${id}`,
        DELETE: (id: number | string) => `/api/schemas/${id}`,
        DOWNLOAD: (id: number | string) => `/api/schemas/${id}/download`,
        CREATE_TABLE: '/api/schemas/create-table'
    }
};
