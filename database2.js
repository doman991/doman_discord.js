const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize the database for series and episodes
async function initDatabase2() {
    try {
        // Create series table
        const createSeriesTableQuery = `
            CREATE TABLE IF NOT EXISTS series (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                added_by VARCHAR(255),
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended BOOLEAN DEFAULT FALSE
            )
        `;
        await pool.execute(createSeriesTableQuery);

        // Create episodes table
        const createEpisodesTableQuery = `
            CREATE TABLE IF NOT EXISTS episodes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                series_id INT,
                season_number INT,
                episode_number INT,
                watched BOOLEAN DEFAULT FALSE,
                watched_at TIMESTAMP NULL,
                UNIQUE(series_id, season_number, episode_number),
                FOREIGN KEY (series_id) REFERENCES series(id) ON DELETE CASCADE
            )
        `;
        await pool.execute(createEpisodesTableQuery);

        console.log('[database2] Database initialized successfully');
    } catch (error) {
        console.error('[database2] Database initialization failed:', error);
        throw error;
    }
}

// Add a new series
async function addSeries(title, addedBy, episodesPerSeason = []) {
    const [result] = await pool.execute('INSERT INTO series (title, added_by) VALUES (?, ?)', [title, addedBy]);
    const seriesId = result.insertId;
    for (let season = 1; season <= episodesPerSeason.length; season++) {
        const episodes = episodesPerSeason[season - 1];
        for (let episode = 1; episode <= episodes; episode++) {
            await pool.execute(
                'INSERT INTO episodes (series_id, season_number, episode_number) VALUES (?, ?, ?)',
                [seriesId, season, episode]
            );
        }
    }
    console.log(`[database2] Added series "${title}" with ID ${seriesId}`);
    return seriesId;
}

// Add a new season to a series
async function addSeason(seriesId, numberOfEpisodes) {
    const [rows] = await pool.execute('SELECT MAX(season_number) as maxSeason FROM episodes WHERE series_id = ?', [seriesId]);
    const nextSeason = (rows[0].maxSeason || 0) + 1;
    for (let episode = 1; episode <= numberOfEpisodes; episode++) {
        await pool.execute(
            'INSERT INTO episodes (series_id, season_number, episode_number) VALUES (?, ?, ?)',
            [seriesId, nextSeason, episode]
        );
    }
    console.log(`[database2] Added season ${nextSeason} with ${numberOfEpisodes} episodes to series ID ${seriesId}`);
    return nextSeason;
}

// Add a single episode to a season
async function addEpisode(seriesId, seasonNumber) {
    const [rows] = await pool.execute(
        'SELECT MAX(episode_number) as maxEpisode FROM episodes WHERE series_id = ? AND season_number = ?',
        [seriesId, seasonNumber]
    );
    const nextEpisode = (rows[0].maxEpisode || 0) + 1;
    await pool.execute(
        'INSERT INTO episodes (series_id, season_number, episode_number) VALUES (?, ?, ?)',
        [seriesId, seasonNumber, nextEpisode]
    );
    console.log(`[database2] Added episode ${nextEpisode} to series ID ${seriesId} season ${seasonNumber}`);
    return nextEpisode;
}

// Mark an episode as watched
async function markEpisodeWatched(seriesId, seasonNumber, episodeNumber) {
    const watchedAt = new Date().toISOString().replace('T', ' ').split('.')[0];
    await pool.execute(
        'UPDATE episodes SET watched = TRUE, watched_at = ? WHERE series_id = ? AND season_number = ? AND episode_number = ?',
        [watchedAt, seriesId, seasonNumber, episodeNumber]
    );
    console.log(`[database2] Marked series ID ${seriesId} S${seasonNumber}E${episodeNumber} as watched`);
}

// Get all series
async function getSeries() {
    const [rows] = await pool.execute('SELECT * FROM series WHERE ended = FALSE ORDER BY title ASC');
    console.log('[database2] Retrieved all active series');
    return rows;
}

// Get series by ID
async function getSeriesById(id) {
    const [rows] = await pool.execute('SELECT * FROM series WHERE id = ?', [id]);
    console.log(`[database2] Retrieved series with ID ${id}`);
    return rows.length > 0 ? rows[0] : null;
}

// Get episodes by series ID
async function getEpisodesBySeries(seriesId) {
    const [rows] = await pool.execute('SELECT * FROM episodes WHERE series_id = ? ORDER BY season_number, episode_number', [seriesId]);
    console.log(`[database2] Retrieved episodes for series ID ${seriesId}`);
    return rows;
}

// Get episodes by series ID and season number
async function getEpisodesBySeason(seriesId, seasonNumber) {
    const [rows] = await pool.execute('SELECT * FROM episodes WHERE series_id = ? AND season_number = ? ORDER BY episode_number', [seriesId, seasonNumber]);
    console.log(`[database2] Retrieved episodes for series ID ${seriesId} season ${seasonNumber}`);
    return rows;
}

// Edit the number of episodes in a season
async function editSeasonEpisodes(seriesId, seasonNumber, newEpisodeCount) {
    const currentEpisodes = await getEpisodesBySeason(seriesId, seasonNumber);
    const currentCount = currentEpisodes.length;
    if (newEpisodeCount > currentCount) {
        for (let episode = currentCount + 1; episode <= newEpisodeCount; episode++) {
            await pool.execute(
                'INSERT INTO episodes (series_id, season_number, episode_number) VALUES (?, ?, ?)',
                [seriesId, seasonNumber, episode]
            );
        }
    } else if (newEpisodeCount < currentCount) {
        await pool.execute(
            'DELETE FROM episodes WHERE series_id = ? AND season_number = ? AND episode_number > ?',
            [seriesId, seasonNumber, newEpisodeCount]
        );
    }
    console.log(`[database2] Updated season ${seasonNumber} of series ID ${seriesId} to ${newEpisodeCount} episodes`);
}

// End a series
async function endSeries(seriesId) {
    await pool.execute('UPDATE series SET ended = TRUE WHERE id = ?', [seriesId]);
    console.log(`[database2] Ended series with ID ${seriesId}`);
}

module.exports = {
    initDatabase2,
    addSeries,
    addSeason,
    addEpisode,
    markEpisodeWatched,
    getSeries,
    getSeriesById,
    getEpisodesBySeries,
    getEpisodesBySeason,
    editSeasonEpisodes,
    endSeries
};
