import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";

// ── Required for session cookies to work cross-origin ─────────────────────────
axios.defaults.withCredentials = true;

export const generalAPI = {
    health:       async ()       => (await axios.get(`${API_URL}/api/health`)).data,
    movieUrl:     (fileName)     => `${API_URL}/api/movies/${fileName}`,
    thumbnailUrl: (fileName)     => `${API_URL}/api/thumbnails/${fileName}`,
};

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authAPI = {
    me:             async ()                     => (await axios.get(`${API_URL}/api/auth/me`)).data,
    login:          async (username, password)   => (await axios.post(`${API_URL}/api/auth/login`, { username, password })).data,
    logout:         async ()                     => (await axios.post(`${API_URL}/api/auth/logout`)).data,
    changePassword: async (currentPassword, newPassword) =>
        (await axios.post(`${API_URL}/api/auth/change-password`, { currentPassword, newPassword })).data,

    // Account request (public)
    submitRequest:  async (username, email, reason) =>
        (await axios.post(`${API_URL}/api/auth/request`, { username, email, reason })).data,

    // Admin — users
    getUsers:       async ()           => (await axios.get(`${API_URL}/api/auth/users`)).data,
    setUserRole:    async (id, role)   => (await axios.patch(`${API_URL}/api/auth/users/${id}/role`, { role })).data,
    setUserActive:  async (id, isActive) => (await axios.patch(`${API_URL}/api/auth/users/${id}/active`, { isActive })).data,

    // Admin — requests
    getRequests:    async (status = 'pending') =>
        (await axios.get(`${API_URL}/api/auth/requests`, { params: { status } })).data,
    approveRequest: async (id) => (await axios.post(`${API_URL}/api/auth/requests/${id}/approve`)).data,
    rejectRequest:  async (id) => (await axios.post(`${API_URL}/api/auth/requests/${id}/reject`)).data,
};

// ─── Favorites API ────────────────────────────────────────────────────────────
export const favoritesAPI = {
    getMyFavorites: async (params = {}) =>
        (await axios.get(`${API_URL}/api/favorites`, { params })).data,

    toggle: async (itemId, itemType) =>
        (await axios.post(`${API_URL}/api/favorites/toggle`, { itemId, itemType })).data,

    getIds: async () =>
        (await axios.get(`${API_URL}/api/favorites/ids`)).data,
};

// ─── Activity API ─────────────────────────────────────────────────────────────
export const activityAPI = {
    ping: async () => {
        try { await axios.post(`${API_URL}/api/activity/ping`); } catch (_) {}
    },
};

// ─── Video API ────────────────────────────────────────────────────────────────
export const videoAPI = {
    getVideos: async (params = {}) =>
        (await axios.get(`${API_URL}/api/videos`, { params })).data,

    getVideo: async (id) =>
        (await axios.get(`${API_URL}/api/videos/${id}`)).data,

    uploadVideo: async (formData, onUploadProgress) =>
        (await axios.post(`${API_URL}/api/videos/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress,
        })).data,

    updateVideo: async (id, video) =>
        (await axios.put(`${API_URL}/api/videos/${id}`, video)).data,

    toggleFavorite: async (id) =>
        (await axios.patch(`${API_URL}/api/videos/${id}/favorite`)).data,

    deleteVideo: async (id) =>
        (await axios.delete(`${API_URL}/api/videos/${id}`)).data,

    replaceVideo: async (id, formData, onUploadProgress) =>
        (await axios.put(`${API_URL}/api/videos/${id}/replace-video`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress,
        })).data,

    getStreamUrl: (id, quality) =>
        `${API_URL}/api/videos/${id}/stream${quality ? `?quality=${quality}` : ''}`,

    trackView: async (id) =>
        (await axios.patch(`${API_URL}/api/videos/${id}/view`)).data,

    getTags:       async () => (await axios.get(`${API_URL}/api/videos/metadata/tags`)).data,
    getStudios:    async () => (await axios.get(`${API_URL}/api/videos/metadata/studios`)).data,
    getActors:     async () => (await axios.get(`${API_URL}/api/videos/metadata/actors`)).data,
    getCharacters: async () => (await axios.get(`${API_URL}/api/videos/metadata/characters`)).data,
};

// ─── Series API ───────────────────────────────────────────────────────────────
export const seriesAPI = {
    getSeries: async (params = {}) =>
        (await axios.get(`${API_URL}/api/series`, { params })).data,

    getSeriesWithEpisodes: async (id) =>
        (await axios.get(`${API_URL}/api/series/${id}`)).data,

    createSeries: async (formData) =>
        (await axios.post(`${API_URL}/api/series`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })).data,

    updateSeries: async (id, formData) =>
        (await axios.put(`${API_URL}/api/series/${id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })).data,

    toggleFavorite: async (id) =>
        (await axios.patch(`${API_URL}/api/series/${id}/favorite`)).data,

    deleteSeries: async (id) =>
        (await axios.delete(`${API_URL}/api/series/${id}`)).data,

    getEpisodes: async (seriesId, season = null) => {
        const params = season ? { season } : {};
        return (await axios.get(`${API_URL}/api/series/${seriesId}/episodes`, { params })).data;
    },

    thumbnailUrl: (fileName) => generalAPI.thumbnailUrl(fileName),

    getTags:       async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/tags`)).data,
    getStudios:    async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/studios`)).data,
    getActors:     async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/actors`)).data,
    getCharacters: async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/characters`)).data,
};

// ─── Stats API ────────────────────────────────────────────────────────────────
export const statsAPI = {
    getStats: async () => (await axios.get(`${API_URL}/api/stats`)).data,
};