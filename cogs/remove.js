const { updateRemovalStats, getTotalRemovedMessages, getUserRemovedMessages } = require('../database');
const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    const prefix = '!'; // Your bot's prefix

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Split the message content into words
        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        // Check for exact match of "!remove"
        if (command === `${prefix}remove`) {
            const count = parseInt(args[1]);

            // Validate the input
            if (args.length < 2 || isNaN(count) || count < 1 || count > 100) {
                await message.reply('Please provide a number between 1 and 100, e.g., `!remove 4`.');
                return;
            }

            // Check if the user is an admin
            if (!client.adminIds.includes(message.author.id)) {
                await message.reply('You are not authorized to use this command.');
                console.log(`[remove] User ${message.author.id} attempted !remove but is not an admin`);
                return;
            }

            try {
                // Fetch 'count' messages before the command message
                const messagesToDelete = await message.channel.messages.fetch({
                    limit: count,
                    before: message.id
                });

                // Delete the fetched messages
                const deleted = await message.channel.bulkDelete(messagesToDelete, true);
                const deletedCount = deleted.size;

                // Delete the command message itself (+1)
                await message.delete();
                const totalDeleted = deletedCount + 1;

                // Update removal stats in the database
                await updateRemovalStats(message.author.id, totalDeleted);

                // Get total removed messages stats
                const totalRemoved = await getTotalRemovedMessages();
                const userRemoved = await getUserRemovedMessages(message.author.id);

                // Create embed for logging
                const embed = new EmbedBuilder()
                    .setColor('#FF0000') // Red color for removal
                    .setTitle(`${totalDeleted} messages removed by ${message.author.username} in #${message.channel.name}`)
                    .addFields(
                        { name: 'Total Removed Messages', value: `${totalRemoved}`, inline: true },
                        { name: `Total Removed by ${message.author.username}`, value: `${userRemoved}`, inline: true }
                    )
                    .setTimestamp();

                // Send embed to debug channel
                const logChannel = await client.channels.fetch(client.debugChannelId);
                if (logChannel) {
                    await logChannel.send({ embeds: [embed] });
                } else {
                    console.warn('[remove] Debug channel not found');
                }

                // Send a temporary confirmation message
                const reply = await message.channel.send('Messages removed ✅');
                setTimeout(() => {
                    reply.delete().catch(error => console.error('[remove] Failed to delete reply:', error));
                }, 2000);
            } catch (error) {
                console.error(`[remove] Error removing messages for ${message.author.id}:`, error);
                await message.reply('Error removing messages. Check my permissions or try again.');
            }
        }
    });
};
