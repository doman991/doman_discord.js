const { EmbedBuilder } = require('discord.js');
const { upsertUserStats, getUserStats, insertMessageToDelete, getAllUserStats, addSwearWord, getSwearWords, checkSwearWordExists } = require('../database');

module.exports = (client) => {
    // Load swear words from database on startup
    let swearWords = new Set();
    getSwearWords().then(words => {
        swearWords = new Set(words);
        console.log('Swear words loaded from database');
    }).catch(error => {
        console.error('Failed to load swear words from database:', error);
    });

    // Maps for tracking voice and streaming times
    const voiceJoinTimes = new Map(); // userId -> join timestamp
    const streamingStartTimes = new Map(); // userId -> streaming start timestamp

    // Helper Functions
    const countWords = (content) => {
        return content.trim().split(/\s+/).filter(word => word.length > 0).length;
    };

    const countSwears = (content) => {
        const words = content.toLowerCase().split(/\s+/);
        return words.reduce((count, word) => {
            const cleanWord = word.replace(/[^a-zA-Z]/g, '');
            return count + (swearWords.has(cleanWord) ? 1 : 0);
        }, 0);
    };

    const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    };

    // Event Listeners
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const userId = newState.id;

        // Voice Chat Tracking
        if (!oldState.channelId && newState.channelId) {
            voiceJoinTimes.set(userId, Date.now());
        } else if (oldState.channelId && !newState.channelId) {
            const joinTime = voiceJoinTimes.get(userId);
            if (joinTime) {
                const durationSeconds = Math.floor((Date.now() - joinTime) / 1000);
                await upsertUserStats(userId, 0, 0, 0, 0, 0, 0, 0, durationSeconds, 0, null);
                voiceJoinTimes.delete(userId);
            }
        }

        // Streaming Tracking
        if (!oldState.streaming && newState.streaming) {
            streamingStartTimes.set(userId, Date.now());
        } else if (oldState.streaming && !newState.streaming) {
            const startTime = streamingStartTimes.get(userId);
            if (startTime) {
                const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
                await upsertUserStats(userId, 0, 0, 0, 0, 0, 0, 0, 0, durationSeconds, null);
                streamingStartTimes.delete(userId);
            }
        }
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const currentTimeMs = Date.now();

        // Command: !swear <text>
        if (command === '!swear') {
            // Check if user is an admin
            if (!client.adminIds || !client.adminIds.includes(message.author.id)) {
                const reply = await message.reply('Only admins can use this command.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000); // 2 minutes
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            if (args.length === 0) {
                const reply = await message.reply('Please provide a swear word to add, e.g., `!swear <text>`.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const swearWord = args.join(' ').toLowerCase();
            try {
                // Check if the word already exists
                const exists = await checkSwearWordExists(swearWord);
                if (exists) {
                    const reply = await message.reply(`Swear word "${swearWord}" already exists in the list.`);
                    const deleteAt = new Date(currentTimeMs + 120 * 1000);
                    await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                    await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                    return;
                }

                // Add the swear word to the database
                await addSwearWord(swearWord);
                swearWords.add(swearWord); // Update in-memory set
                const reply = await message.reply(`Swear word "${swearWord}" added successfully.`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            } catch (error) {
                console.error('Failed to add swear word:', error);
                const reply = await message.reply('Failed to add swear word. Please try again later.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            }
            return;
        }

        // Command: !stat
        if (command === '!stat') {
            let userId = args.length === 0 ? message.author.id : (message.mentions.users.size > 0 ? message.mentions.users.first().id : args[0]);
            const stats = await getUserStats(userId);
            if (!stats) {
                const reply = await message.reply('No stats found for this user.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const user = await client.users.fetch(userId);
            const wordsPerMessage = stats.total_messages > 0 ? (stats.total_words / stats.total_messages).toFixed(2) : 0;

            const embed = new EmbedBuilder()
                .setTitle(`📊 User Stats: ${user.tag}`)
                .setDescription(
                    `**Total Messages**: ${stats.total_messages}\n` +
                    `**Total Words**: ${stats.total_words}\n` +
                    `**Words per Message**: ${wordsPerMessage}\n` +
                    `**Total Swear Words**: ${stats.total_swears}`
                )
                .setColor('#00b7ff')
                .setTimestamp();

            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 120 * 1000);
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }
        // Regular Message Tracking
        else {
            const userId = message.author.id;
            const messageContent = message.content;
            const wordCount = countWords(messageContent);
            const swearCount = countSwears(messageContent);

            await upsertUserStats(userId, 1, wordCount, 0, 0, swearCount, 0, 0, 0, 0, null);
        }
    });
};
