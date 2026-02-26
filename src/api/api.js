import axios from "axios";

const API_URL = "";  //"http://localhost:5000";

export const generalAPI = {
    health: async () => {
        const response = await axios.get(`${API_URL}/api/health`);
        return response.data;
    },
    movieUrl: (fileName) => `${API_URL}/api/movies/${fileName}`,
    thumbnailUrl: (fileName) => `${API_URL}/api/thumbnails/${fileName}`
};

// ─── Video API ────────────────────────────────────────────────────────────────
export const videoAPI = {
    // Standalone videos only (no series episodes)
    getVideos: async (params = {}) => {
        const response = await axios.get(`${API_URL}/api/videos`, { params });
        return response.data;
    },
    getVideo: async (id) => {
        const response = await axios.get(`${API_URL}/api/videos/${id}`);
        return response.data;
    },
    uploadVideo: async (formData, onUploadProgress) => {
        const response = await axios.post(`${API_URL}/api/videos/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress
        });
        return response.data;
    },
    updateVideo: async (id, video) => {
        const response = await axios.put(`${API_URL}/api/videos/${id}`, video);
        return response.data;
    },
    toggleFavorite: async (id) => {
        const response = await axios.patch(`${API_URL}/api/videos/${id}/favorite`);
        return response.data;
    },
    deleteVideo: async (id) => {
        const response = await axios.delete(`${API_URL}/api/videos/${id}`);
        return response.data;
    },
    replaceVideo: async (id, formData, onUploadProgress) => {
        const response = await axios.put(`${API_URL}/api/videos/${id}/replace-video`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress
        });
        return response.data;
    },
    getStreamUrl: (id, quality) =>
        `${API_URL}/api/videos/${id}/stream${quality ? `?quality=${quality}` : ''}`,

    // Metadata
    getTags: async () => {
        const response = await axios.get(`${API_URL}/api/videos/metadata/tags`);
        return response.data;
    },
    getStudios: async () => {
        const response = await axios.get(`${API_URL}/api/videos/metadata/studios`);
        return response.data;
    },
    getActors: async () => {
        const response = await axios.get(`${API_URL}/api/videos/metadata/actors`);
        return response.data;
    },
    getCharacters: async () => {
        const response = await axios.get(`${API_URL}/api/videos/metadata/characters`);
        return response.data;
    }
};

// ─── Series API ───────────────────────────────────────────────────────────────
export const seriesAPI = {
    // Get all series with optional filters
    getSeries: async (params = {}) => {
        const response = await axios.get(`${API_URL}/api/series`, { params });
        return response.data;
    },
    // Get single series with all episodes
    getSeriesWithEpisodes: async (id) => {
        const response = await axios.get(`${API_URL}/api/series/${id}`);
        return response.data;
    },
    // Create a new series (FormData for optional thumbnail)
    createSeries: async (formData) => {
        const response = await axios.post(`${API_URL}/api/series`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    // Update series metadata
    updateSeries: async (id, formData) => {
        const response = await axios.put(`${API_URL}/api/series/${id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    // Toggle favorite
    toggleFavorite: async (id) => {
        const response = await axios.patch(`${API_URL}/api/series/${id}/favorite`);
        return response.data;
    },
    // Delete series and all episodes
    deleteSeries: async (id) => {
        const response = await axios.delete(`${API_URL}/api/series/${id}`);
        return response.data;
    },
    // Get episodes for a series, optionally by season
    getEpisodes: async (seriesId, season = null) => {
        const params = season ? { season } : {};
        const response = await axios.get(`${API_URL}/api/series/${seriesId}/episodes`, { params });
        return response.data;
    },
    // Thumbnail URL helper
    thumbnailUrl: (fileName) => generalAPI.thumbnailUrl(fileName),
    // Metadata
    getTags: async (serialId) => {
        const response = await axios.get(`${API_URL}/api/series/metadata/${serialId}/tags`);
        return response.data;
    },
    getStudios: async (serialId) => {
        const response = await axios.get(`${API_URL}/api/series/metadata/${serialId}/studios`);
        return response.data;
    },
    getActors: async (serialId) => {
        const response = await axios.get(`${API_URL}/api/series/metadata/${serialId}/actors`);
        return response.data;
    },
    getCharacters: async (serialId) => {
        const response = await axios.get(`${API_URL}/api/series/metadata/${serialId}/characters`);
        return response.data;
    }
};