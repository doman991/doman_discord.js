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

// Log connection details for debugging
console.log('Attempting to connect to MySQL with:', {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
});

// Initialize the database and check for necessary tables and columns
async function initDatabase() {
    try {
        // Create the messages_to_delete table if it doesn't exist (existing functionality)
        const createMessagesTableQuery = `
            CREATE TABLE IF NOT EXISTS messages_to_delete (
                id INT AUTO_INCREMENT PRIMARY KEY,
                channel_id VARCHAR(255),
                message_id VARCHAR(255),
                delete_at TIMESTAMP
            )
        `;
        await pool.execute(createMessagesTableQuery);

        // Check if log_message_id column exists in messages_to_delete
        const [rowsMessages] = await pool.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'messages_to_delete'
            AND COLUMN_NAME = 'log_message_id'
        `);
        if (rowsMessages.length === 0) {
            const alterMessagesTableQuery = `
                ALTER TABLE messages_to_delete
                ADD COLUMN log_message_id VARCHAR(255)
            `;
            await pool.execute(alterMessagesTableQuery);
            console.log('Added log_message_id column to messages_to_delete');
        }

        // Create the movies table for the movies.js cog
        const createMoviesTableQuery = `
            CREATE TABLE IF NOT EXISTS movies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                last_watched TIMESTAMP NULL,
                is_removed_from_pool BOOLEAN DEFAULT FALSE,
                INDEX (title) -- For faster lookups by title
            )
        `;
        await pool.execute(createMoviesTableQuery);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error; // Re-throw to let index.js handle it
    }
}

// Existing functions for messages_to_delete
async function insertMessageToDelete(channelId, messageId, deleteAt, logMessageId = null) {
    const mysqlDateTime = new Date(deleteAt).toISOString().replace('T', ' ').split('.')[0];
    const query = 'INSERT INTO messages_to_delete (channel_id, message_id, delete_at, log_message_id) VALUES (?, ?, ?, ?)';
    await pool.execute(query, [channelId, messageId, mysqlDateTime, logMessageId]);
}

async function getOverdueMessages() {
    const query = 'SELECT id, channel_id, message_id, delete_at, log_message_id FROM messages_to_delete WHERE delete_at <= NOW()';
    const [rows] = await pool.execute(query);
    return rows;
}

async function deleteMessageRecord(id) {
    const query = 'DELETE FROM messages_to_delete WHERE id = ?';
    await pool.execute(query, [id]);
}

async function getMessageRecordByMessageId(messageId) {
    const query = 'SELECT id, channel_id, message_id, delete_at, log_message_id FROM messages_to_delete WHERE message_id = ?';
    const [rows] = await pool.execute(query, [messageId]);
    return rows.length > 0 ? rows[0] : null;
}

// New functions for movies table
async function addMovie(title) {
    const query = 'INSERT INTO movies (title) VALUES (?)';
    const [result] = await pool.execute(query, [title]);
    return result.insertId; // Return the ID of the newly inserted movie
}

async function approveMovie(id) {
    const query = 'UPDATE movies SET last_watched = NULL WHERE id = ?';
    await pool.execute(query, [id]);
}

async function getMovies() {
    const query = 'SELECT id, title, last_watched, is_removed_from_pool FROM movies ORDER BY id ASC';
    const [rows] = await pool.execute(query);
    return rows;
}

async function getMovieById(id) {
    const query = 'SELECT id, title, last_watched, is_removed_from_pool FROM movies WHERE id = ?';
    const [rows] = await pool.execute(query, [id]);
    return rows.length > 0 ? rows[0] : null;
}

async function getMovieByTitle(title) {
    const query = 'SELECT id, title, last_watched, is_removed_from_pool FROM movies WHERE title = ?';
    const [rows] = await pool.execute(query, [title]);
    return rows.length > 0 ? rows[0] : null;
}

async function markMovieWatched(id) {
    const watchedTimestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    const query = 'UPDATE movies SET last_watched = ?, is_removed_from_pool = FALSE WHERE id = ?';
    await pool.execute(query, [watchedTimestamp, id]);
}

async function removeMovieFromPool(id) {
    const query = 'UPDATE movies SET is_removed_from_pool = TRUE WHERE id = ?';
    await pool.execute(query, [id]);
}

async function editMovieTitle(id, newTitle) {
    const query = 'UPDATE movies SET title = ? WHERE id = ?';
    await pool.execute(query, [newTitle, id]);
}

async function getRandomMovie(daysCooldown) {
    const cooldownTimestamp = new Date(Date.now() - daysCooldown * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];
    const query = `
        SELECT id, title, last_watched, is_removed_from_pool 
        FROM movies 
        WHERE (last_watched IS NULL OR last_watched < ?) AND is_removed_from_pool = FALSE 
        ORDER BY RAND() 
        LIMIT 1
    `;
    const [rows] = await pool.execute(query, [cooldownTimestamp]);
    return rows.length > 0 ? rows[0] : null;
}

module.exports = {
    initDatabase,
    insertMessageToDelete,
    getOverdueMessages,
    deleteMessageRecord,
    getMessageRecordByMessageId,
    addMovie,
    approveMovie,
    getMovies,
    getMovieById,
    getMovieByTitle,
    markMovieWatched,
    removeMovieFromPool,
    editMovieTitle,
    getRandomMovie
};
