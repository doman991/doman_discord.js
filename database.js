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

// Initialize the database and check for the log_message_id column
async function initDatabase() {
    try {
        // Create the table if it doesn't exist (without log_message_id initially)
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS messages_to_delete (
                id INT AUTO_INCREMENT PRIMARY KEY,
                channel_id VARCHAR(255),
                message_id VARCHAR(255),
                delete_at TIMESTAMP
            )
        `;
        await pool.execute(createTableQuery);

        // Check if the log_message_id column exists
        const [rows] = await pool.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'messages_to_delete'
            AND COLUMN_NAME = 'log_message_id'
        `);

        if (rows.length === 0) {
            // Column doesn't exist, so add it
            const alterTableQuery = `
                ALTER TABLE messages_to_delete
                ADD COLUMN log_message_id VARCHAR(255)
            `;
            await pool.execute(alterTableQuery);
            console.log('Added log_message_id column to messages_to_delete');
        }

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error; // Re-throw to let index.js handle it
    }
}

// Insert a message to delete with its log message ID
async function insertMessageToDelete(channelId, messageId, deleteAt, logMessageId = null) {
    const mysqlDateTime = new Date(deleteAt).toISOString().replace('T', ' ').split('.')[0];
    const query = 'INSERT INTO messages_to_delete (channel_id, message_id, delete_at, log_message_id) VALUES (?, ?, ?, ?)';
    await pool.execute(query, [channelId, messageId, mysqlDateTime, logMessageId]);
}

// Get messages that are overdue for deletion, including their log message IDs
async function getOverdueMessages() {
    const query = 'SELECT id, channel_id, message_id, delete_at, log_message_id FROM messages_to_delete WHERE delete_at <= NOW()';
    const [rows] = await pool.execute(query);
    return rows;
}

// Delete a message record by its ID
async function deleteMessageRecord(id) {
    const query = 'DELETE FROM messages_to_delete WHERE id = ?';
    await pool.execute(query, [id]);
}

// Get a message record by its message ID
async function getMessageRecordByMessageId(messageId) {
    const query = 'SELECT id, channel_id, message_id, delete_at, log_message_id FROM messages_to_delete WHERE message_id = ?';
    const [rows] = await pool.execute(query, [messageId]);
    return rows.length > 0 ? rows[0] : null;
}

module.exports = {
    initDatabase,
    insertMessageToDelete,
    getOverdueMessages,
    deleteMessageRecord,
    getMessageRecordByMessageId
};
