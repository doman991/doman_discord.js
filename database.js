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
        // Create or update the messages_to_delete table
        const createMessagesTableQuery = `
            CREATE TABLE IF NOT EXISTS messages_to_delete (
                id INT AUTO_INCREMENT PRIMARY KEY,
                channel_id VARCHAR(255),
                message_id VARCHAR(255),
                delete_at TIMESTAMP,
                log_message_id VARCHAR(255),
                status TINYINT DEFAULT 2, -- 1: removed, 2: to be removed, 3: error
                error_log TEXT DEFAULT NULL
            )
        `;
        await pool.execute(createMessagesTableQuery);

        // Check and add status column if it doesn’t exist
        const [rowsStatus] = await pool.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'messages_to_delete'
            AND COLUMN_NAME = 'status'
        `);
        if (rowsStatus.length === 0) {
            await pool.execute(`ALTER TABLE messages_to_delete ADD COLUMN status TINYINT DEFAULT 2`);
            console.log('Added status column to messages_to_delete');
        }

        // Check and add error_log column if it doesn’t exist
        const [rowsErrorLog] = await pool.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'messages_to_delete'
            AND COLUMN_NAME = 'error_log'
        `);
        if (rowsErrorLog.length === 0) {
            await pool.execute(`ALTER TABLE messages_to_delete ADD COLUMN error_log TEXT DEFAULT NULL`);
            console.log('Added error_log column to messages_to_delete');
        }

        // Create the movies table
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

        // Create the user_data table
        const createUserDataTableQuery = `
            CREATE TABLE IF NOT EXISTS user_data (
                user_id VARCHAR(255) PRIMARY KEY,
                roles TEXT,
                connections INT DEFAULT 0,
                first_join_date TIMESTAMP DEFAULT '2024-03-10 00:00:00',
                kicks INT DEFAULT 0,
                bans INT DEFAULT 0,
                inviter_id VARCHAR(255) DEFAULT '0'
            )
        `;
        await pool.execute(createUserDataTableQuery);

        // Create the message_removal_stats table
        const createRemovalStatsTableQuery = `
            CREATE TABLE IF NOT EXISTS message_removal_stats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                total_removed INT DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user (user_id)
            )
        `;
        await pool.execute(createRemovalStatsTableQuery);

        // Create the user_stats table with nickname column
        const createUserStatsTableQuery = `
            CREATE TABLE IF NOT EXISTS user_stats (
                user_id VARCHAR(255) PRIMARY KEY,
                nickname VARCHAR(50),
                total_messages INT DEFAULT 0,
                total_words INT DEFAULT 0,
                messages_removed INT DEFAULT 0,
                messages_edited INT DEFAULT 0,
                total_swears INT DEFAULT 0,
                reactions_given INT DEFAULT 0,
                reactions_received INT DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;
        await pool.execute(createUserStatsTableQuery);

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
}

// Functions for messages_to_delete
async function insertMessageToDelete(channelId, messageId, deleteAt, logMessageId = null) {
    const mysqlDateTime = new Date(deleteAt).toISOString().replace('T', ' ').split('.')[0];
    const query = `
        INSERT INTO messages_to_delete (channel_id, message_id, delete_at, log_message_id, status)
        VALUES (?, ?, ?, ?, 2)
    `;
    try {
        await pool.execute(query, [channelId, messageId, mysqlDateTime, logMessageId]);
        console.log(`Inserted message ${messageId} into messages_to_delete with delete_at ${mysqlDateTime}`);
    } catch (error) {
        console.error(`Failed to insert message ${messageId} into messages_to_delete:`, error);
        throw error;
    }
}

async function getOverdueMessages() {
    const query = `
        SELECT id, channel_id, message_id, delete_at, log_message_id
        FROM messages_to_delete
        WHERE delete_at <= NOW() AND status = 2
    `;
    const [rows] = await pool.execute(query);
    return rows;
}

async function markMessageCompleted(id) {
    const query = 'UPDATE messages_to_delete SET status = 1 WHERE id = ?';
    await pool.execute(query, [id]);
}

async function markMessageErrored(id, errorMessage) {
    const query = 'UPDATE messages_to_delete SET status = 3, error_log = ? WHERE id = ?';
    await pool.execute(query, [errorMessage, id]);
}

async function getMessageRecordByMessageId(messageId) {
    const query = 'SELECT id, channel_id, message_id, delete_at, log_message_id, status, error_log FROM messages_to_delete WHERE message_id = ?';
    const [rows] = await pool.execute(query, [messageId]);
    return rows.length > 0 ? rows[0] : null;
}

// Functions for movies table
async function addMovie(title) {
    const query = 'INSERT INTO movies (title) VALUES (?)';
    const [result] = await pool.execute(query, [title]);
    return result.insertId;
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

// Functions for user_data table
async function upsertUserData(userId, roles = [], connections = 0, firstJoinDate = null, kicks = 0, bans = 0, inviterId = '0') {
    const mysqlDateTime = firstJoinDate ? new Date(firstJoinDate).toISOString().replace('T', ' ').split('.')[0] : '2024-03-10 00:00:00';
    const query = `
        INSERT INTO user_data (user_id, roles, connections, first_join_date, kicks, bans, inviter_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            roles = VALUES(roles),
            connections = VALUES(connections),
            first_join_date = COALESCE(first_join_date, VALUES(first_join_date)),
            kicks = VALUES(kicks),
            bans = VALUES(bans),
            inviter_id = VALUES(inviter_id)
    `;
    await pool.execute(query, [userId, JSON.stringify(roles), connections, mysqlDateTime, kicks, bans, inviterId]);
}

async function getUserData(userId) {
    const query = 'SELECT * FROM user_data WHERE user_id = ?';
    const [rows] = await pool.execute(query, [userId]);
    return rows.length > 0 ? rows[0] : null;
}

async function incrementUserField(userId, field) {
    const query = `UPDATE user_data SET ${field} = ${field} + 1 WHERE user_id = ?`;
    await pool.execute(query, [userId]);
}

// Functions for message_removal_stats table
async function updateRemovalStats(userId, count) {
    const query = `
        INSERT INTO message_removal_stats (user_id, total_removed)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
            total_removed = total_removed + VALUES(total_removed),
            last_updated = CURRENT_TIMESTAMP
    `;
    try {
        await pool.execute(query, [userId, count]);
        console.log(`Updated removal stats for user ${userId}: added ${count} messages`);
    } catch (error) {
        console.error(`Failed to update removal stats for user ${userId}:`, error);
        throw error;
    }
}

async function getTotalRemovedMessages() {
    const query = 'SELECT SUM(total_removed) as total FROM message_removal_stats';
    const [rows] = await pool.execute(query);
    return rows[0].total || 0;
}

async function getUserRemovedMessages(userId) {
    const query = 'SELECT total_removed FROM message_removal_stats WHERE user_id = ?';
    const [rows] = await pool.execute(query, [userId]);
    return rows.length > 0 ? rows[0].total_removed : 0;
}

// Updated upsertUserStats function with COALESCE to handle NULL values
async function upsertUserStats(userId, messages = 0, words = 0, removed = 0, edited = 0, swears = 0, reactionsGiven = 0, reactionsReceived = 0, nickname = null) {
    const query = `
        INSERT INTO user_stats (user_id, nickname, total_messages, total_words, messages_removed, messages_edited, total_swears, reactions_given, reactions_received)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            nickname = COALESCE(VALUES(nickname), nickname),
            total_messages = COALESCE(total_messages, 0) + VALUES(total_messages),
            total_words = COALESCE(total_words, 0) + VALUES(total_words),
            messages_removed = COALESCE(messages_removed, 0) + VALUES(messages_removed),
            messages_edited = COALESCE(messages_edited, 0) + VALUES(messages_edited),
            total_swears = COALESCE(total_swears, 0) + VALUES(total_swears),
            reactions_given = COALESCE(reactions_given, 0) + VALUES(reactions_given),
            reactions_received = COALESCE(reactions_received, 0) + VALUES(reactions_received),
            last_updated = CURRENT_TIMESTAMP
    `;
    try {
        await pool.execute(query, [userId, nickname, messages, words, removed, edited, swears, reactionsGiven, reactionsReceived]);
        console.log(`Updated stats for user ${userId}: messages +${messages}, words +${words}, removed +${removed}, edited +${edited}, swears +${swears}, reactions_given +${reactionsGiven}, reactions_received +${reactionsReceived}`);
    } catch (error) {
        console.error(`Failed to update stats for user ${userId}:`, error);
        throw error;
    }
}

async function getUserStats(userId) {
    const query = 'SELECT * FROM user_stats WHERE user_id = ?';
    const [rows] = await pool.execute(query, [userId]);
    return rows.length > 0 ? rows[0] : null;
}

// Added function to fetch all user stats
async function getAllUserStats() {
    const query = 'SELECT * FROM user_stats';
    const [rows] = await pool.execute(query);
    return rows;
}

module.exports = {
    initDatabase,
    insertMessageToDelete,
    getOverdueMessages,
    markMessageCompleted,
    markMessageErrored,
    getMessageRecordByMessageId,
    addMovie,
    approveMovie,
    getMovies,
    getMovieById,
    getMovieByTitle,
    markMovieWatched,
    removeMovieFromPool,
    editMovieTitle,
    getRandomMovie,
    upsertUserData,
    getUserData,
    incrementUserField,
    updateRemovalStats,
    getTotalRemovedMessages,
    getUserRemovedMessages,
    upsertUserStats,
    getUserStats,
    getAllUserStats // Added to exports
};
