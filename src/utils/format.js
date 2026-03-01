function formatViews(views) {
    if (!views) return 0;
    const thousands = Math.floor(views / 1000);
    const millions = Math.floor(views / 1000000);
    return millions > 0 ? `${millions}M` : (thousands > 0 ? `${thousands}K` : views);
};

function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);  
    const secondsRemaining = Math.floor(seconds % 60);
    return hours > 0 ? `${hours}h ${minutes}m` : (minutes > 0 ? `${minutes}m ${secondsRemaining}s` : `${secondsRemaining}s`);
};

function formatFileSize(bytes) {
    if (!bytes) return "N/A";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
}

export {
    formatDuration,
    formatViews, 
    formatFileSize
}