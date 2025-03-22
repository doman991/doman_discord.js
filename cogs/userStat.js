const { EmbedBuilder } = require('discord.js');
const { upsertUserStats, getUserStats, insertMessageToDelete, getAllUserStats } = require('../database');
const wulgaryzmy = require('./wulgaryzmy.json'); // Array of swear words

module.exports = (client) => {
    // Convert swear words to a Set for efficient lookup
    const swearWords = new Set(wulgaryzmy.map(word => word.toLowerCase()));

    // **Helper Functions**

    // Count total words in a message
    const countWords = (content) => {
        return content.trim().split(/\s+/).filter(word => word.length > 0).length;
    };

    // Count swear words in a message
    const countSwears = (content) => {
        const words = content.toLowerCase().split(/\s+/);
        return words.reduce((count, word) => {
            const cleanWord = word.replace(/[^a-zA-Z]/g, ''); // Remove punctuation
            return count + (swearWords.has(cleanWord) ? 1 : 0);
        }, 0);
    };

    // **Event Listener: messageCreate**
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const currentTimeMs = Date.now();

        // **Command: !stat**
        if (command === '!stat') {
            let userId = args.length === 0 ? message.author.id : (message.mentions.users.size > 0 ? message.mentions.users.first().id : args[0]);

            // Validate user ID if provided as an argument
            if (args.length > 0 && !message.mentions.users.size && !/^\d{17,19}$/.test(userId)) {
                const reply = await message.reply('Invalid user ID or mention. Use a valid ID or @user.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000); // Delete after 2 minutes
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            // Fetch stats from the database
            const stats = await getUserStats(userId);
            if (!stats) {
                const reply = await message.reply('No stats found for this user.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            // Calculate words per message
            const wordsPerMessage = stats.total_messages > 0 ? (stats.total_words / stats.total_messages).toFixed(2) : 0;
            const user = await client.users.fetch(userId).catch(() => null);

            // Create an embed for stats display
            const embed = new EmbedBuilder()
                .setTitle(`📊 User Stats: ${user ? user.tag : 'Unknown User'}`)
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
                    `**Last Updated**: ${stats.last_updated.toISOString().split('T')[0]}`
                )
                .setColor('#00b7ff')
                .setTimestamp();

            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 120 * 1000);
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }
        // **Command: !allstat**
        else if (command === '!allstat') {
            // Fetch all user stats
            const allStats = await getAllUserStats();

            // Check if there are any stats
            if (!allStats || allStats.length === 0) {
                const reply = await message.reply('No user stats found.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            // Aggregate all stats
            const aggregatedStats = allStats.reduce((acc, user) => {
                acc.totalMessages += user.total_messages || 0;
                acc.totalWords += user.total_words || 0;
                acc.messagesRemoved += user.messages_removed || 0;
                acc.messagesEdited += user.messages_edited || 0;
                acc.totalSwears += user.total_swears || 0;
                acc.reactionsGiven += user.reactions_given || 0;
                acc.reactionsReceived += user.reactions_received || 0;
                return acc;
            }, {
                totalMessages: 0,
                totalWords: 0,
                messagesRemoved: 0,
                messagesEdited: 0,
                totalSwears: 0,
                reactionsGiven: 0,
                reactionsReceived: 0
            });

            // Calculate words per message
            const wordsPerMessage = aggregatedStats.totalMessages > 0 ? (aggregatedStats.totalWords / aggregatedStats.totalMessages).toFixed(2) : 0;

            // Create an embed for aggregated stats
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
                    `**Reactions Received**: ${aggregatedStats.reactionsReceived}`
                )
                .setColor('#00b7ff')
                .setTimestamp();

            // Send the embed and schedule deletion
            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 300 * 1000); // 5 minutes
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }
        // **Regular Message Tracking**
        else {
            const userId = message.author.id;
            const messageContent = message.content;
            const wordCount = countWords(messageContent);
            const swearCount = countSwears(messageContent);
            const mentionCount = message.mentions.users.size;
            const nickname = message.member?.displayName || message.author.username;

            await upsertUserStats(userId, 1, wordCount, 0, 0, swearCount, 0, 0, nickname);
        }
    });

    // **Other Event Listeners**

    // Message Deletions
    client.on('messageDelete', async (message) => {
        if (message.author.bot) return;

        const userId = message.author.id;
        await upsertUserStats(userId, 0, 0, 1, 0, 0, 0, 0); // Increment messages_removed
    });

    // Message Edits
    client.on('messageUpdate', async (oldMessage, newMessage) => {
        if (newMessage.author.bot || oldMessage.content === newMessage.content) return;

        const userId = newMessage.author.id;
        const newSwearCount = countSwears(newMessage.content);
        await upsertUserStats(userId, 0, 0, 0, 1, newSwearCount, 0, 0); // Increment messages_edited and update swears
    });

    // Reaction Added
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;

        const giverId = user.id;
        const receiverId = reaction.message.author.id;

        await upsertUserStats(giverId, 0, 0, 0, 0, 0, 1, 0); // Increment reactions_given
        if (!reaction.message.author.bot) {
            await upsertUserStats(receiverId, 0, 0, 0, 0, 0, 0, 1); // Increment reactions_received
        }
    });

    // Reaction Removed
    client.on('messageReactionRemove', async (reaction, user) => {
        if (user.bot) return;

        const giverId = user.id;
        const receiverId = reaction.message.author.id;

        await upsertUserStats(giverId, 0, 0, 0, 0, 0, -1, 0); // Decrement reactions_given
        if (!reaction.message.author.bot) {
            await upsertUserStats(receiverId, 0, 0, 0, 0, 0, 0, -1); // Decrement reactions_received
        }
    });
};
