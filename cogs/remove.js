module.exports = (client) => {
    const prefix = '!'; // Your bot's prefix
    const logChannelId = ''; // Replace with your log channel ID

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        if (message.content.startsWith(`${prefix}remove`)) {
            const args = message.content.split(' ');
            const count = parseInt(args[1]);

            // Validate the input
            if (isNaN(count) || count < 1 || count > 100) {
                await message.reply('Please provide a number between 1 and 100.');
                return;
            }

            // Check if the user is an admin
            if (!client.adminIds.includes(message.author.id)) {
                await message.reply('You are not authorized to use this command.');
                console.log(`User ${message.author.id} attempted !remove but is not an admin`);
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

                // Log the action
                const logChannel = client.channels.cache.get(logChannelId);
                if (logChannel) {
                    const logMessage = `${totalDeleted} messages removed by ${message.author.username} in ${message.channel.name}`;
                    await logChannel.send(logMessage);
                } else {
                    console.warn('Log channel not found');
                }

                // Send a temporary confirmation message
                const reply = await message.channel.send('Messages removed ✅');
                setTimeout(() => {
                    reply.delete().catch(error => console.error('Failed to delete reply:', error));
                }, 2000);
            } catch (error) {
                console.error(`Error removing messages for ${message.author.id}:`, error);
                await message.reply('Error removing messages. Check my permissions or try again.');
            }
        }
    });
};
