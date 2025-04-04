const { EmbedBuilder } = require('discord.js');
const { upsertUserStats, getUserStats, insertMessageToDelete, getAllUserStats, addSwearWord, getSwearWords, checkSwearWordExists } = require('../database');

module.exports = (client) => {
    // Load swear words from database on startup
    let swearWords = new Set();
    getSwearWords().then(words => {
        swearWords = new Set(words);
        console.log('[userStat] Swear words loaded from database');
    }).catch(error => {
        console.error('[userStat] Failed to load swear words from database:', error);
    });

    // Maps to track voice chat and streaming start times
    const voiceJoinTimes = new Map(); // userId -> join timestamp
    const streamingStartTimes = new Map(); // userId -> streaming start timestamp

    // **Helper Functions**

    // Count total words in a message
    const countWords = (content) => {
        return content.trim().split(/\s+/).filter(word => word.length > 0).length;
    };

    // Count swear words in a message using the in-memory swearWords set
    const countSwears = (content) => {
        const words = content.toLowerCase().split(/\s+/);
        return words.reduce((count, word) => {
            const cleanWord = word.replace(/[^a-zA-Z]/g, '');
            return count + (swearWords.has(cleanWord) ? 1 : 0);
        }, 0);
    };

    // Convert seconds to a readable format (e.g., "1h 30m 45s")
    const formatDuration = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        const minutes = Math.floor(seconds / 60);
        seconds = Math.floor(seconds % 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    };

    // **Event Listeners**

    // Voice State Updates (for voice chat and streaming time tracking)
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const userId = newState.id;

        // Voice Chat Tracking
        if (!oldState.channelId && newState.channelId) {
            // User joined a voice channel
            voiceJoinTimes.set(userId, Date.now());
        } else if (oldState.channelId && !newState.channelId) {
            // User left a voice channel
            const joinTime = voiceJoinTimes.get(userId);
            if (joinTime) {
                const durationSeconds = Math.floor((Date.now() - joinTime) / 1000);
                await upsertUserStats(userId, 0, 0, 0, 0, 0, 0, 0, durationSeconds, 0, null);
                voiceJoinTimes.delete(userId);
            }
        } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            // User switched channels
            const joinTime = voiceJoinTimes.get(userId);
            if (joinTime) {
                const durationSeconds = Math.floor((Date.now() - joinTime) / 1000);
                await upsertUserStats(userId, 0, 0, 0, 0, 0, 0, 0, durationSeconds, 0, null);
                voiceJoinTimes.set(userId, Date.now());
            }
        }

        // Streaming Tracking
        if (!oldState.streaming && newState.streaming) {
            // User started streaming
            streamingStartTimes.set(userId, Date.now());
        } else if (oldState.streaming && !newState.streaming) {
            // User stopped streaming
            const startTime = streamingStartTimes.get(userId);
            if (startTime) {
                const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
                await upsertUserStats(userId, 0, 0, 0, 0, 0, 0, 0, 0, durationSeconds, null);
                streamingStartTimes.delete(userId);
            }
        } else if (oldState.streaming && !newState.channelId) {
            // User left the channel while streaming
            const startTime = streamingStartTimes.get(userId);
            if (startTime) {
                const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
                await upsertUserStats(userId, 0, 0, 0, 0, 0, 0, 0, 0, durationSeconds, null);
                streamingStartTimes.delete(userId);
            }
        }
    });

    // Message Create (commands and regular message tracking)
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const currentTimeMs = Date.now();

        // **Command: !swear <text> (Add swear word to database, admin only)**
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

                // Add the swear word to the database and in-memory set
                await addSwearWord(swearWord);
                swearWords.add(swearWord);
                const reply = await message.reply(`Swear word "${swearWord}" added successfully.`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            } catch (error) {
                console.error('[userStat] Failed to add swear word:', error);
                const reply = await message.reply('Failed to add swear word. Please try again later.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            }
            return;
        }

        // **Command: !stat**
        if (command === '!stat') {
            let userId = args.length === 0 ? message.author.id : (message.mentions.users.size > 0 ? message.mentions.users.first().id : args[0]);

            // Validate user ID if provided as an argument
            if (args.length > 0 && !message.mentions.users.size && !/^\d{17,19}$/.test(userId)) {
                const reply = await message.reply('Invalid user ID or mention. Use a valid ID or @user.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

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
                    `**ID**: ${userId}\n` +
                    `**Total Messages**: ${stats.total_messages}\n` +
                    `**Total Words**: ${stats.total_words}\n` +
                    `**Words per Message**: ${wordsPerMessage}\n` +
                    `**Messages Removed**: ${stats.messages_removed}\n` +
                    `**Messages Edited**: ${stats.messages_edited}\n` +
                    `**Total Swear Words**: ${stats.total_swears}\n` +
                    `**Reactions Given**: ${stats.reactions_given}\n` +
                    `**Reactions Received**: ${stats.reactions_received}\n` +
                    `**Voice Chat Time**: ${formatDuration(stats.voice_chat_time)}\n` +
                    `**Streaming Time**: ${formatDuration(stats.streaming_time)}\n` +
                    `**Last Updated**: ${stats.last_updated.toISOString().split('T')[0]}`
                )
                .setColor('#00b7ff')
                .setTimestamp();

            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 120 * 1000);
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            return;
        }

        // **Command: !allstat**
        if (command === '!allstat') {
            const allStats = await getAllUserStats();

            if (!allStats || allStats.length === 0) {
                const reply = await message.reply('No user stats found.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const aggregatedStats = allStats.reduce((acc, user) => {
                acc.totalMessages += user.total_messages || 0;
                acc.totalWords += user.total_words || 0;
                acc.messagesRemoved += user.messages_removed || 0;
                acc.messagesEdited += user.messages_edited || 0;
                acc.totalSwears += user.total_swears || 0;
                acc.reactionsGiven += user.reactions_given || 0;
                acc.reactionsReceived += user.reactions_received || 0;
                acc.voiceChatTime += user.voice_chat_time || 0;
                acc.streamingTime += user.streaming_time || 0;
                return acc;
            }, {
                totalMessages: 0,
                totalWords: 0,
                messagesRemoved: 0,
                messagesEdited: 0,
                totalSwears: 0,
                reactionsGiven: 0,
                reactionsReceived: 0,
                voiceChatTime: 0,
                streamingTime: 0
            });

            const wordsPerMessage = aggregatedStats.totalMessages > 0 ? (aggregatedStats.totalWords / aggregatedStats.totalMessages).toFixed(2) : 0;

            const embed = new EmbedBuilder()
                .setTitle('📊 Aggregated Stats for All Users')
                .setDescription(
                    `**Total Users**: ${allStats.length}\n` +
                    `**Total Messages**: ${aggregatedStats.totalMessages}\n` +
                    `**Total Words**: ${aggregatedStats.totalWords}\n` +
                    `**Words per Message**: ${wordsPerMessage}\n` +
                    `**Messages Removed**: ${aggregatedStats.messagesRemoved}\n` +
                    `**Messages Edited**: ${aggregatedStats.messagesEdited}\n` +
                    `**Total Swear Words**: ${aggregatedStats.totalSwears}\n` +
                    `**Reactions Given**: ${aggregatedStats.reactionsGiven}\n` +
                    `**Reactions Received**: ${aggregatedStats.reactionsReceived}\n` +
                    `**Voice Chat Time**: ${formatDuration(aggregatedStats.voiceChatTime)}\n` +
                    `**Streaming Time**: ${formatDuration(aggregatedStats.streamingTime)}`
                )
                .setColor('#00b7ff')
                .setTimestamp();

            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 120 * 1000);
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            return;
        }

        // **Regular Message Tracking**
        const userId = message.author.id;
        const messageContent = message.content;
        const wordCount = countWords(messageContent);
        const swearCount = countSwears(messageContent);
        const nickname = message.member?.displayName || message.author.username;

        await upsertUserStats(userId, 1, wordCount, 0, 0, swearCount, 0, 0, 0, 0, nickname);
    });

    // Message Deletions
    client.on('messageDelete', async (message) => {
        if (message.author.bot) return;

        const userId = message.author.id;
        await upsertUserStats(userId, 0, 0, 1, 0, 0, 0, 0, 0, 0, null);
    });

    // Message Edits
    client.on('messageUpdate', async (oldMessage, newMessage) => {
        if (newMessage.author.bot || oldMessage.content === newMessage.content) return;

        const userId = newMessage.author.id;
        const newSwearCount = countSwears(newMessage.content);
        await upsertUserStats(userId, 0, 0, 0, 1, newSwearCount, 0, 0, 0, 0, null);
    });

    // Reaction Added
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;

        const giverId = user.id;
        const receiverId = reaction.message.author.id;

        await upsertUserStats(giverId, 0, 0, 0, 0, 0, 1, 0, 0, 0, null);
        if (!reaction.message.author.bot) {
            await upsertUserStats(receiverId, 0, 0, 0, 0, 0, 0, 1, 0, 0, null);
        }
    });

    // Reaction Removed
    client.on('messageReactionRemove', async (reaction, user) => {
        if (user.bot) return;

        const giverId = user.id;
        const receiverId = reaction.message.author.id;

        await upsertUserStats(giverId, 0, 0, 0, 0, 0, -1, 0, 0, 0, null);
        if (!reaction.message.author.bot) {
            await upsertUserStats(receiverId, 0, 0, 0, 0, 0, 0, -1, 0, 0, null);
        }
    });
};
