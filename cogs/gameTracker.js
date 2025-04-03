const { EmbedBuilder } = require('discord.js');
const { pool, normalizeGameName, getStandardGameName, addGameAlias } = require('../database'); // Adjust the path based on your directory structure

module.exports = (client) => {
    const activeSessions = new Map(); // Track ongoing sessions: userId -> { activityName, startTime }

    // Handle presence updates (e.g., when a user starts or stops playing a game)
    client.on('presenceUpdate', async (oldPresence, newPresence) => {
        const userId = newPresence.userId;
        const member = newPresence.member;
        if (!member) return; // Ignore if not in guild

        const nickname = member.displayName || member.user.username;
        const playingActivity = newPresence.activities.find(a => a.type === 0); // Type 0 is "Playing"
        const rawActivityName = playingActivity ? playingActivity.name : null;
        const standardActivityName = rawActivityName ? await getStandardGameName(rawActivityName) : null;
        const activeSession = activeSessions.get(userId);

        try {
            if (standardActivityName) {
                // User started or switched games
                if (!activeSession || activeSession.activityName !== standardActivityName) {
                    // End previous session if it exists
                    if (activeSession) {
                        const endTime = new Date().toISOString().replace('T', ' ').split('.')[0];
                        await pool.execute(
                            'UPDATE activities SET session_end = ? WHERE user_id = ? AND activity_name = ? AND session_end IS NULL ORDER BY session_start DESC LIMIT 1',
                            [endTime, userId, activeSession.activityName]
                        );
                    }
                    // Start new session with standard name
                    const startTime = new Date().toISOString().replace('T', ' ').split('.')[0];
                    await pool.execute(
                        'INSERT INTO activities (user_id, nickname, activity_name, session_start) VALUES (?, ?, ?, ?)',
                        [userId, nickname, standardActivityName, startTime]
                    );
                    activeSessions.set(userId, { activityName: standardActivityName, startTime });
                    console.log(`Started session for user ${userId}: ${standardActivityName}`);
                }
            } else if (activeSession) {
                // User stopped playing
                const endTime = new Date().toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'UPDATE activities SET session_end = ? WHERE user_id = ? AND activity_name = ? AND session_end IS NULL ORDER BY session_start DESC LIMIT 1',
                    [endTime, userId, activeSession.activityName]
                );
                activeSessions.delete(userId);
                console.log(`Ended session for user ${userId}: ${activeSession.activityName}`);
            }
        } catch (error) {
            console.error(`Error handling presence update for user ${userId}:`, error);
        }
    });

    // Handle message commands (!game and !galias)
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const currentTimeMs = Date.now();

        // Handle the !game command
        if (command === '!game') {
            let userId = args[0];
            if (message.mentions.users.size > 0) {
                userId = message.mentions.users.first().id;
            } else if (!/^\d{17,19}$/.test(userId)) {
                const reply = await message.reply('Invalid user ID or mention. Use a valid ID or @user.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000).toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [message.channel.id, message.id, deleteAt]
                );
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [reply.channel.id, reply.id, deleteAt]
                );
                return;
            }

            try {
                // Fetch stats for all time, past month, and past week
                const [allTimeRows] = await pool.execute(
                    'SELECT activity_name, COUNT(*) as session_count, SUM(TIMESTAMPDIFF(SECOND, session_start, session_end)) as total_playtime ' +
                    'FROM activities WHERE user_id = ? AND session_end IS NOT NULL GROUP BY activity_name',
                    [userId]
                );
                const [monthRows] = await pool.execute(
                    'SELECT activity_name, COUNT(*) as session_count, SUM(TIMESTAMPDIFF(SECOND, session_start, session_end)) as total_playtime ' +
                    'FROM activities WHERE user_id = ? AND session_end IS NOT NULL AND session_start >= DATE_SUB(NOW(), INTERVAL 1 MONTH) GROUP BY activity_name',
                    [userId]
                );
                const [weekRows] = await pool.execute(
                    'SELECT activity_name, COUNT(*) as session_count, SUM(TIMESTAMPDIFF(SECOND, session_start, session_end)) as total_playtime ' +
                    'FROM activities WHERE user_id = ? AND session_end IS NOT NULL AND session_start >= DATE_SUB(NOW(), INTERVAL 1 WEEK) GROUP BY activity_name',
                    [userId]
                );

                // Build embed
                const embed = new EmbedBuilder()
                    .setTitle(`🎮 Activity Stats for ${message.guild.members.cache.get(userId)?.displayName || 'Unknown'}`)
                    .setColor('#00b7ff')
                    .addFields(
                        { name: 'All Time', value: formatStats(allTimeRows), inline: false },
                        { name: 'Past Month', value: formatStats(monthRows), inline: false },
                        { name: 'Past Week', value: formatStats(weekRows), inline: false }
                    );

                const reply = await message.channel.send({ embeds: [embed] });
                const deleteAt = new Date(currentTimeMs + 120 * 1000).toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [message.channel.id, message.id, deleteAt]
                );
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [reply.channel.id, reply.id, deleteAt]
                );
            } catch (error) {
                console.error(`Error processing !game for user ${userId}:`, error);
                const reply = await message.reply('Failed to fetch stats. Please try again later.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000).toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [message.channel.id, message.id, deleteAt]
                );
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [reply.channel.id, reply.id, deleteAt]
                );
            }
        }

        // Handle the !gAlias command (admin only)
        if (command === '!galias') {
            // Check if the user is an admin
            if (!client.adminIds || !client.adminIds.includes(message.author.id)) {
                const reply = await message.reply('Only admins can use this command.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000).toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [message.channel.id, message.id, deleteAt]
                );
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [reply.channel.id, reply.id, deleteAt]
                );
                return;
            }

            // Parse arguments (expecting two quoted strings)
            const match = message.content.match(/!galias\s+"([^"]+)"\s+"([^"]+)"/);
            if (!match || match.length < 3) {
                const reply = await message.reply('Usage: !galias "rawName" "standardName"');
                const deleteAt = new Date(currentTimeMs + 120 * 1000).toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [message.channel.id, message.id, deleteAt]
                );
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [reply.channel.id, reply.id, deleteAt]
                );
                return;
            }

            const rawName = match[1];
            const standardName = match[2];

            try {
                await addGameAlias(rawName, standardName);
                const reply = await message.reply(`Alias added: "${rawName}" -> "${standardName}"`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000).toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [message.channel.id, message.id, deleteAt]
                );
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [reply.channel.id, reply.id, deleteAt]
                );
            } catch (error) {
                console.error(`Error adding alias for "${rawName}":`, error);
                const reply = await message.reply('Failed to add alias. Please try again later.');
                const deleteAt = new Date(currentTimeMs + 120 * 1000).toISOString().replace('T', ' ').split('.')[0];
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [message.channel.id, message.id, deleteAt]
                );
                await pool.execute(
                    'INSERT INTO messages_to_delete (channel_id, message_id, delete_at) VALUES (?, ?, ?)',
                    [reply.channel.id, reply.id, deleteAt]
                );
            }
        }
    });

    // Helper function to format stats
    function formatStats(stats) {
        if (!stats || stats.length === 0) return 'No activities recorded.';
        return stats.map(stat => {
            const playtime = stat.total_playtime
                ? `${Math.floor(stat.total_playtime / 3600)}h ${Math.floor((stat.total_playtime % 3600) / 60)}m`
                : '0h 0m';
            return `**${stat.activity_name}**: ${stat.session_count} sessions, ${playtime}`;
        }).join('\n');
    }
};
