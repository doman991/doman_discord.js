const { EmbedBuilder } = require('discord.js');
const { pool } = require('../database');

module.exports = (client) => {
    const activeSessions = new Map(); // Tracks ongoing sessions: userId -> { activityName, startTime }

    // Normalize game name: remove ™/® and trim, keep original capitalization
    function normalizeGameName(name) {
        return name.replace(/[™®]/g, '').trim();
    }

    // Handle presence updates (user starts/stops playing a game)
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
                if (!activeSession || activeSession.activityName !== standardActivityName) {
                    if (activeSession) {
                        const endTime = new Date().toISOString().replace('T', ' ').split('.')[0];
                        await pool.execute(
                            'UPDATE activities SET session_end = ? WHERE user_id = ? AND activity_name = ? AND session_end IS NULL ORDER BY session_start DESC LIMIT 1',
                            [endTime, userId, activeSession.activityName]
                        );
                    }
                    const startTime = new Date().toISOString().replace('T', ' ').split('.')[0];
                    await pool.execute(
                        'INSERT INTO activities (user_id, nickname, activity_name, session_start) VALUES (?, ?, ?, ?)',
                        [userId, nickname, standardActivityName, startTime]
                    );
                    activeSessions.set(userId, { activityName: standardActivityName, startTime });
                    console.log(`Started session for user ${userId}: ${standardActivityName}`);
                }
            } else if (activeSession) {
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

    // Handle message commands (!game, !galias)
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const currentTimeMs = Date.now();

        // **!game Command**: Display user's game stats
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
                const [allTimeRows] = await pool.execute(
                    'SELECT activity_name, COUNT(*) as session_count, SUM(TIMESTAMPDIFF(SECOND, session_start, session_end)) as total_playtime ' +
                    'FROM activities WHERE user_id = ? AND session_end IS NOT NULL GROUP BY activity_name',
                    [userId]
                );

                const embed = new EmbedBuilder()
                    .setTitle(`🎮 Activity Stats for ${message.guild.members.cache.get(userId)?.displayName || 'Unknown'}`)
                    .setColor('#00b7ff')
                    .addFields({ name: 'All Time', value: formatStats(allTimeRows), inline: false });

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

        // **!galias Command**: Add a game alias (admin only)
        if (command === '!galias') {
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

            const match = message.content.match(/!galias\s+"([^"]+)"\s+"([^"]+)"/);
            if (!match || match.length < 3) {
                const reply = await message.reply('Usage: !galias "standardName" "aliasName"');
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

            const standardName = match[1];
            const aliasName = match[2];
            const normalizedStandard = normalizeGameName(standardName);
            const normalizedAlias = normalizeGameName(aliasName);

            try {
                await pool.execute(
                    'INSERT INTO game_aliases (standard_name, alias_name) VALUES (?, ?)',
                    [normalizedStandard, normalizedAlias]
                );
                const reply = await message.reply(`Alias added: "${aliasName}" -> "${standardName}"`);
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
                console.error(`Error adding alias "${aliasName}" -> "${standardName}":`, error);
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

    // Utility Functions
    function formatStats(stats) {
        if (!stats || stats.length === 0) return 'No activities recorded.';
        return stats.map(stat => {
            const playtime = stat.total_playtime
                ? `${Math.floor(stat.total_playtime / 3600)}h ${Math.floor((stat.total_playtime % 3600) / 60)}m`
                : '0h 0m';
            return `**${stat.activity_name}**: ${stat.session_count} sessions, ${playtime}`;
        }).join('\n');
    }

    async function getStandardGameName(rawName) {
        const normalizedName = normalizeGameName(rawName);
        const [rows] = await pool.execute(
            'SELECT standard_name FROM game_aliases WHERE alias_name = ?',
            [normalizedName]
        );
        return rows.length > 0 ? rows[0].standard_name : normalizedName; // Default to normalized name if no alias
    }
};
