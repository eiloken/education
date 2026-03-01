import axios from "axios";

const API_URL = ""; //"http://localhost:5001";

export const generalAPI = {
    health: async () => {
        const response = await axios.get(`${API_URL}/api/health`);
        return response.data;
    },
    movieUrl:     (fileName) => `${API_URL}/api/movies/${fileName}`,
    thumbnailUrl: (fileName) => `${API_URL}/api/thumbnails/${fileName}`
};

// ─── Video API ────────────────────────────────────────────────────────────────
export const videoAPI = {
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

    /**
     * Track a view for a video.
     * Called by VideoPlayer after the user has watched ≥ 30 seconds.
     */
    trackView: async (id) => {
        const response = await axios.patch(`${API_URL}/api/videos/${id}/view`);
        return response.data;
    },

    // Metadata
    getTags:       async () => (await axios.get(`${API_URL}/api/videos/metadata/tags`)).data,
    getStudios:    async () => (await axios.get(`${API_URL}/api/videos/metadata/studios`)).data,
    getActors:     async () => (await axios.get(`${API_URL}/api/videos/metadata/actors`)).data,
    getCharacters: async () => (await axios.get(`${API_URL}/api/videos/metadata/characters`)).data,
};

// ─── Series API ───────────────────────────────────────────────────────────────
export const seriesAPI = {
    getSeries: async (params = {}) => {
        const response = await axios.get(`${API_URL}/api/series`, { params });
        return response.data;
    },
    getSeriesWithEpisodes: async (id) => {
        const response = await axios.get(`${API_URL}/api/series/${id}`);
        return response.data;
    },
    createSeries: async (formData) => {
        const response = await axios.post(`${API_URL}/api/series`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    updateSeries: async (id, formData) => {
        const response = await axios.put(`${API_URL}/api/series/${id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    toggleFavorite: async (id) => {
        const response = await axios.patch(`${API_URL}/api/series/${id}/favorite`);
        return response.data;
    },
    deleteSeries: async (id) => {
        const response = await axios.delete(`${API_URL}/api/series/${id}`);
        return response.data;
    },
    getEpisodes: async (seriesId, season = null) => {
        const params = season ? { season } : {};
        const response = await axios.get(`${API_URL}/api/series/${seriesId}/episodes`, { params });
        return response.data;
    },
    thumbnailUrl: (fileName) => generalAPI.thumbnailUrl(fileName),

    // Metadata
    getTags:       async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/tags`)).data,
    getStudios:    async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/studios`)).data,
    getActors:     async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/actors`)).data,
    getCharacters: async (id) => (await axios.get(`${API_URL}/api/series/metadata/${id}/characters`)).data,
};