const { EmbedBuilder } = require('discord.js');
const { insertMessageToDelete } = require('../database'); // For scheduling message deletions

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.content.toLowerCase() === '!help') {
            // Calculate deletion time (2 minutes from now)
            const currentTimeMs = Date.now();
            const deleteAt = new Date(currentTimeMs + 120 * 1000);

            // Create the help embed with updated commands
            const embed = new EmbedBuilder()
                .setTitle('Bot Commands')
                .setDescription('A list of all available commands. Admin commands are marked accordingly.')
                .addFields(
                    {
                        name: 'Regular Commands',
                        value: [
                            '`!movieAdd <name>`: Suggest a movie to add to the list.',
                            '`!movieList`: Show all movies with their IDs.',
                            '`!rmovie`: Pick a random movie for approval.',
                            '`!movieHelp`: Show help for movie commands.',
                            '`!stat [user]`: Show user statistics (yours if no user specified).',
                            '`!allstat`: Show aggregated statistics for all users.',
                            '`!help`: Show this help message.',
                            '`!game <userID> or !game @user`: Show gaming activity stats for a user.'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: 'Admin Commands',
                        value: [
                            '`!watched <id>`: Mark a movie as watched (Admins only).',
                            '`!removeMovie <id>`: Remove a movie from the random pool (Admins only).',
                            '`!editMovie <id> <newTitle>`: Edit a movie’s title (Admins only).',
                            '`!remove <count>`: Remove a specified number of messages (1-100) (Admins only).',
                            '`!timer <duration> [optional message]`: Set a countdown timer (e.g., `!timer 30m`) (Admins only).',
                            '`!user <userid> or !user @user`: Show user information (Admins only).',
                            '`!swear <text>`: Add a swear word to the list (Admins only).'
                        ].join('\n'),
                        inline: false
                    }
                )
                .setColor('#00b7ff') // Consistent color
                .setFooter({ text: 'Messages will be deleted after 2 minutes.' });

            try {
                // Send the embed
                const reply = await message.channel.send({ embeds: [embed] });

                // Schedule both messages for deletion
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);

                console.log(`Scheduled deletion for help command and response in channel ${message.channel.id}`);
            } catch (error) {
                console.error('Error in help command:', error);
                await message.reply('Failed to process help command. Please try again later.');
            }
        }
    });
};
