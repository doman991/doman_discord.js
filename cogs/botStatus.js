const { EmbedBuilder } = require('discord.js');
const { insertMessageToDelete, setBotSettings, getBotSettings } = require('../database');

module.exports = (client) => {
    // Mapping for activity types (Discord.js expects numeric enums)
    const activityTypeMap = {
        'playing': 0,   // PLAYING
        'streaming': 1, // STREAMING
        'listening': 2, // LISTENING
        'watching': 3,  // WATCHING
        'custom': 4,    // CUSTOM (limited support for bots)
        'competing': 5  // COMPETING
    };

    // Mapping for status options
    const statusMap = {
        'online': 'online',
        'idle': 'idle',
        'dnd': 'dnd',
        'invisible': 'invisible'
    };

    // Initialize bot status and activity on startup
    module.exports.init = async (client) => {
        try {
            console.log('[botStatus] Loading settings from database...');
            const settings = await getBotSettings();
            if (settings) {
                const { activity_type, activity_text, status } = settings;
                if (activity_type && activity_text && activityTypeMap.hasOwnProperty(activity_type.toLowerCase())) {
                    console.log(`[botStatus] Restoring activity: ${activity_type} ${activity_text}`);
                    await client.user.setActivity(activity_text, { type: activityTypeMap[activity_type.toLowerCase()] });
                    const currentActivity = client.user.presence.activities[0];
                    console.log(`[botStatus] Activity set to: ${currentActivity ? `${currentActivity.type} ${currentActivity.name}` : 'None'}`);
                } else {
                    console.log('[botStatus] No valid activity settings found in database');
                }
                if (status && statusMap[status.toLowerCase()]) {
                    console.log(`[botStatus] Restoring status: ${status}`);
                    await client.user.setStatus(statusMap[status.toLowerCase()]);
                    console.log(`[botStatus] Status set to: ${client.user.presence.status}`);
                } else {
                    console.log('[botStatus] No valid status found in database');
                }
            } else {
                console.log('[botStatus] No saved settings found in database');
            }
        } catch (error) {
            console.error('[botStatus] Failed to initialize bot settings:', error);
            await client.debug(`[botStatus] Initialization error: ${error.message}`);
        }
    };

    // Listen for messages
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return; // Ignore bot messages

        const args = message.content.split(' ').slice(1); // Extract arguments
        const command = message.content.split(' ')[0].toLowerCase(); // Extract command
        const currentTimeMs = Date.now(); // Timestamp for deletion scheduling

        // Check if the user is an admin
        if (!client.adminIds.includes(message.author.id)) {
            const reply = await message.reply('Only admins can use this command.');
            const deleteAt = new Date(currentTimeMs + 120 * 1000); // 2 minutes
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            return;
        }

        // **Command: !bothelp**
        if (command === '!bothelp') {
            const embed = new EmbedBuilder()
                .setTitle('🤖 Bot Status Commands Help')
                .setDescription('Here’s how to use the bot status commands. All commands are admin-only and messages will be deleted after 2 minutes.')
                .addFields(
                    {
                        name: '🔧 !botActivity <type> <activity>',
                        value: 'Sets the bot’s activity.\n' +
                               '**Usage:** `!botActivity watching movies`\n' +
                               '**Available types:** ' + Object.keys(activityTypeMap).join(', '),
                        inline: false
                    },
                    {
                        name: '⚙️ !botStatus <status>',
                        value: 'Sets the bot’s status.\n' +
                               '**Usage:** `!botStatus idle`\n' +
                               '**Available statuses:** ' + Object.keys(statusMap).join(', '),
                        inline: false
                    },
                    {
                        name: '📝 !botDesc <description>',
                        value: 'Sets a custom activity description.\n' +
                               '**Usage:** `!botDesc Playing with friends`',
                        inline: false
                    }
                )
                .setColor('#00b7ff')
                .setFooter({ text: 'This message will be deleted in 2 minutes.' });

            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 120 * 1000); // 2 minutes
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            return;
        }

        // **Command: !botActivity <type> <activity>**
        if (command === '!botactivity') {
            if (args.length < 2) {
                const reply = await message.reply('Usage: `!botActivity <type> <activity>`, e.g., `!botActivity watching movies`');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const typeInput = args[0].toLowerCase();
            const activity = args.slice(1).join(' ');

            if (!activityTypeMap.hasOwnProperty(typeInput)) {
                const reply = await message.reply(`Invalid activity type. Use one of: ${Object.keys(activityTypeMap).join(', ')}`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            try {
                console.log(`[botStatus] Setting activity: ${typeInput} ${activity}`);
                await client.user.setActivity(activity, { type: activityTypeMap[typeInput] });
                const currentActivity = client.user.presence.activities[0];
                console.log(`[botStatus] Activity set to: ${currentActivity ? `${currentActivity.type} ${currentActivity.name}` : 'None'}`);
                await client.debug(`Activity updated: ${typeInput} ${activity}`);
                await setBotSettings(typeInput, activity, (await getBotSettings())?.status || 'online');
                const reply = await message.reply(`Bot activity set to ${typeInput} ${activity}`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            } catch (error) {
                console.error('[botStatus] Failed to set bot activity:', error);
                await client.debug(`[botStatus] Activity set error: ${error.message}`);
                const reply = await message.reply('Failed to set bot activity. Check logs for details!');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            }
        }

        // **Command: !botStatus <status>**
        if (command === '!botstatus') {
            if (args.length < 1) {
                const reply = await message.reply('Usage: `!botStatus <status>`, e.g., `!botStatus idle`');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const statusInput = args[0].toLowerCase();
            if (!statusMap[statusInput]) {
                const reply = await message.reply(`Invalid status. Use one of: ${Object.keys(statusMap).join(', ')}`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            try {
                console.log(`[botStatus] Setting status: ${statusInput}`);
                await client.user.setStatus(statusMap[statusInput]);
                console.log(`[botStatus] Status set to: ${client.user.presence.status}`);
                await client.debug(`Status updated: ${statusInput}`);
                const currentSettings = await getBotSettings();
                await setBotSettings(
                    currentSettings?.activity_type || null,
                    currentSettings?.activity_text || null,
                    statusInput
                );
                const reply = await message.reply(`Bot status set to ${statusInput}`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            } catch (error) {
                console.error('[botStatus] Failed to set bot status:', error);
                await client.debug(`[botStatus] Status set error: ${error.message}`);
                const reply = await message.reply('Failed to set bot status. Check logs for details!');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            }
        }

        // **Command: !botDesc <description>**
        if (command === '!botdesc') {
            if (args.length < 1) {
                const reply = await message.reply('Usage: `!botDesc <description>`, e.g., `!botDesc Playing with friends`');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const description = args.join(' ');
            try {
                console.log(`[botStatus] Setting custom activity: ${description}`);
                await client.user.setActivity(description, { type: activityTypeMap['custom'] });
                const currentActivity = client.user.presence.activities[0];
                console.log(`[botStatus] Custom activity set to: ${currentActivity ? `${currentActivity.type} ${currentActivity.name}` : 'None'}`);
                await client.debug(`Custom activity updated: ${description}`);
                const currentSettings = await getBotSettings();
                await setBotSettings('custom', description, currentSettings?.status || 'online');
                const reply = await message.reply(`Bot description set to "${description}" (as custom activity)`);
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            } catch (error) {
                console.error('[botStatus] Failed to set bot description:', error);
                await client.debug(`[botStatus] Custom activity set error: ${error.message}`);
                const reply = await message.reply('Failed to set bot description. Check logs for details!');
                const deleteAt = new Date(currentTimeMs + 120 * 1000);
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            }
        }
    });
};
