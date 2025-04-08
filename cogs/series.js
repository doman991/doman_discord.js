const { EmbedBuilder } = require('discord.js');
const { insertMessageToDelete } = require('../database');
const {
    addSeries,
    addSeason,
    addEpisode,
    markEpisodeWatched,
    getSeries,
    getSeriesById,
    getEpisodesBySeries,
    getEpisodesBySeason,
    editSeasonEpisodes,
    endSeries
} = require('../database2');

module.exports = (client) => {
    const LOG_CHANNEL_ID = client.debugChannelId;
    const ADMIN_IDS = client.adminIds;

    // Helper function to log actions
    const logAction = async (action, seriesName, episodeDetails) => {
        const consoleMessage = `[series] Admin ${action} "${seriesName}" ${episodeDetails}`;
        const discordMessage = `Admin ${action} "${seriesName}" ${episodeDetails}`;
        console.log(consoleMessage);
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        await logChannel.send(discordMessage);
    };

    // Helper function to schedule message deletion
    const scheduleDeletion = async (channelId, messageId, delayMs) => {
        const deleteAt = new Date(Date.now() + delayMs);
        try {
            await insertMessageToDelete(channelId, messageId, deleteAt, null);
            console.log(`Scheduled deletion for message ${messageId} in channel ${channelId} at ${deleteAt}`);
        } catch (error) {
            console.error(`Failed to schedule deletion for message ${messageId}:`, error);
        }
    };

    // Helper function to schedule embed deletion after 24 hours
    const scheduleEmbedDeletion = async (channelId, messageId) => {
        const deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        try {
            await insertMessageToDelete(channelId, messageId, deleteAt, null);
            console.log(`Scheduled embed deletion for message ${messageId} in channel ${channelId} at ${deleteAt}`);
        } catch (error) {
            console.error(`Failed to schedule embed deletion for message ${messageId}:`, error);
        }
    };

    // Helper function to find the next unwatched episode
    const getNextUnwatchedEpisode = async (seriesId) => {
        const episodes = await getEpisodesBySeries(seriesId);
        return episodes.find(ep => !ep.watched);
    };

    // Helper function to update the embed with current series and episode info
    const updateEmbed = async (message, series, nextEpisode) => {
        const embed = new EmbedBuilder()
            .setTitle(`**${series.title} (ID: ${series.id})**`)
            .setColor('#00b7ff');
        if (nextEpisode) {
            embed.setDescription(`Current episode: Season ${nextEpisode.season_number}, Episode ${nextEpisode.episode_number}`);
        } else {
            embed.setDescription('All episodes have been watched.');
        }
        await message.edit({ embeds: [embed] });
    };

    // Command handler
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const isAdmin = ADMIN_IDS.includes(message.author.id);

        // !serialadd "<Series Title>" <episodes_per_season>
        if (command === '!serialadd' && isAdmin) {
            const titleMatch = message.content.match(/"(.+?)"/);
            if (!titleMatch) {
                const reply = await message.reply('Please provide a series title in quotes, e.g., `!serialadd "Breaking Bad" 7,13,13,13,16`.');
                await schedule                scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const title = titleMatch[1];
            const episodesPerSeason = args.slice(1).join('').split(',').map(Number).filter(n => !isNaN(n));
            const seriesId = await addSeries(title, message.author.id, episodesPerSeason);
            await logAction('added', title, `with seasons: ${episodesPerSeason.join(', ')}`);
            const reply = await message.reply(`Added series "${title}" with ID ${seriesId}.`);
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !addseason <series_id> <number_of_episodes>
        if (command === '!addseason' && isAdmin) {
            if (args.length < 2 || isNaN(args[0]) || isNaN(args[1])) {
                const reply = await message.reply('Usage: `!addseason <series_id> <number_of_episodes>`');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seriesId = parseInt(args[0]);
            const numberOfEpisodes = parseInt(args[1]);
            const series = await getSeriesById(seriesId);
            if (!series) {
                const reply = await message.reply('Series not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seasonNumber = await addSeason(seriesId, numberOfEpisodes);
            await logAction('added', series.title, `season ${seasonNumber} with ${numberOfEpisodes} episodes`);
            const reply = await message.reply(`Added season ${seasonNumber} with ${numberOfEpisodes} episodes to "${series.title}".`);
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !addepisode <series_id> <season_number>
        if (command === '!addepisode' && isAdmin) {
            if (args.length < 2 || isNaN(args[0]) || isNaN(args[1])) {
                const reply = await message.reply('Usage: `!addepisode <series_id> <season_number>`');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seriesId = parseInt(args[0]);
            const seasonNumber = parseInt(args[1]);
            const series = await getSeriesById(seriesId);
            if (!series) {
                const reply = await message.reply('Series not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const episodeNumber = await addEpisode(seriesId, seasonNumber);
            await logAction('added', series.title, `episode ${episodeNumber} to season ${seasonNumber}`);
            const reply = await message.reply(`Added episode ${episodeNumber} to season ${seasonNumber} of "${series.title}".`);
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !editseason <series_id> <season_number> <new_episode_count>
        if (command === '!editseason' && isAdmin) {
            if (args.length < 3 || isNaN(args[0]) || isNaN(args[1]) || isNaN(args[2])) {
                const reply = await message.reply('Usage: `!editseason <series_id> <season_number> <new_episode_count>`');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seriesId = parseInt(args[0]);
            const seasonNumber = parseInt(args[1]);
            const newEpisodeCount = parseInt(args[2]);
            const series = await getSeriesById(seriesId);
            if (!series) {
                const reply = await message.reply('Series not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            await editSeasonEpisodes(seriesId, seasonNumber, newEpisodeCount);
            await logAction('updated', series.title, `season ${seasonNumber} to have ${newEpisodeCount} episodes`);
            const reply = await message.reply(`Updated season ${seasonNumber} of "${series.title}" to have ${newEpisodeCount} episodes.`);
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !serieslist
        if (command === '!serieslist') {
            const series = await getSeries();
            if (series.length === 0) {
                const reply = await message.channel.send('No series available.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            let description = '';
            series.forEach(s => {
                description += `ID ${s.id}. ${s.title}\n`;
            });
            const embed = new EmbedBuilder()
                .setTitle('📺 Series List')
                .setDescription(description)
                .setColor('#00b7ff');
            const reply = await message.channel.send({ embeds: [embed] });
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !seriesstatus <series_id>
        if (command === '!seriesstatus') {
            if (args.length < 1 || isNaN(args[0])) {
                const reply = await message.reply('Usage: `!seriesstatus <series_id>`');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seriesId = parseInt(args[0]);
            const series = await getSeriesById(seriesId);
            if (!series) {
                const reply = await message.reply('Series not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const episodes = await getEpisodesBySeries(seriesId);
            const seasons = {};
            episodes.forEach(ep => {
                if (!seasons[ep.season_number]) seasons[ep.season_number] = { watched: 0, total: 0 };
                seasons[ep.season_number].total++;
                if (ep.watched) seasons[ep.season_number].watched++;
            });
            let description = '';
            for (const [season, data] of Object.entries(seasons)) {
                description += `Season ${season}: ${data.watched}/${data.total} watched\n`;
            }
            const embed = new EmbedBuilder()
                .setTitle(`**${series.title} (ID: ${seriesId})**`)
                .setDescription(description)
                .setColor('#00b7ff');
            const reply = await message.channel.send({ embeds: [embed] });
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !seasonstatus <series_id> <season_number>
        if (command === '!seasonstatus') {
            if (args.length < 2 || isNaN(args[0]) || isNaN(args[1])) {
                const reply = await message.reply('Usage: `!seasonstatus <series_id> <season_number>`');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seriesId = parseInt(args[0]);
            const seasonNumber = parseInt(args[1]);
            const series = await getSeriesById(seriesId);
            if (!series) {
                const reply = await message.reply('Series not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const episodes = await getEpisodesBySeason(seriesId, seasonNumber);
            if (episodes.length === 0) {
                const reply = await message.reply('Season not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            let description = '';
            episodes.forEach(ep => {
                const status = ep.watched ? `Watched on ${ep.watched_at}` : 'Not watched';
                description += `Episode ${ep.episode_number}: ${status}\n`;
            });
            const embed = new EmbedBuilder()
                .setTitle(`**${series.title} - Season ${seasonNumber}**`)
                .setDescription(description)
                .setColor('#00b7ff');
            const reply = await message.channel.send({ embeds: [embed] });
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !series <id>
        if (command === '!series') {
            if (args.length < 1 || isNaN(args[0])) {
                const reply = await message.reply('Usage: `!series <series_id>`');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seriesId = parseInt(args[0]);
            const series = await getSeriesById(seriesId);
            if (!series) {
                const reply = await message.reply('Series not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const nextEpisode = await getNextUnwatchedEpisode(seriesId);
            const embed = new EmbedBuilder()
                .setTitle(`**${series.title} (ID: ${seriesId})**`)
                .setColor('#00b7ff');
            if (nextEpisode) {
                embed.setDescription(`Current episode: Season ${nextEpisode.season_number}, Episode ${nextEpisode.episode_number}`);
            } else {
                embed.setDescription('All episodes have been watched.');
            }
            const embedMessage = await message.channel.send({ embeds: [embed] });
            await scheduleEmbedDeletion(embedMessage.channel.id, embedMessage.id); // Schedule embed for deletion after 24 hours
            if (nextEpisode) {
                await embedMessage.react('✅');
                client.seriesEmbeds = client.seriesEmbeds || {};
                client.seriesEmbeds[embedMessage.id] = { seriesId, nextEpisode };
            }
        }

        // !watchedepisode <series_id> <season_number> <episode_number>
        if (command === '!watchedepisode' && isAdmin) {
            if (args.length < 3 || isNaN(args[0]) || isNaN(args[1]) || isNaN(args[2])) {
                const reply = await message.reply('Usage: `!watchedepisode <series_id> <season_number> <episode_number>`');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            const seriesId = parseInt(args[0]);
            const seasonNumber = parseInt(args[1]);
            const episodeNumber = parseInt(args[2]);
            const series = await getSeriesById(seriesId);
            if (!series) {
                const reply = await message.reply('Series not found.');
                await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
                await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
                return;
            }
            await markEpisodeWatched(seriesId, seasonNumber, episodeNumber);
            await logAction('marked', series.title, `S${seasonNumber}E${episodeNumber} as watched manually`);
            const reply = await message.reply(`Marked "${series.title}" S${seasonNumber}E${episodeNumber} as watched.`);
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }

        // !serialhelp
        if (command === '!serialhelp') {
            const embed = new EmbedBuilder()
                .setTitle('📺 Series Commands Help')
                .setDescription(
                    '**Admin Commands:**\n' +
                    '`!serialadd "<Series Title>" <episodes_per_season>` - Add a new series with comma-separated episode counts.\n' +
                    '`!addseason <series_id> <number_of_episodes>` - Add a new season.\n' +
                    '`!addepisode <series_id> <season_number>` - Add an episode to a season.\n' +
                    '`!editseason <series_id> <season_number> <new_episode_count>` - Edit episode count.\n' +
                    '`!watchedepisode <series_id> <season_number> <episode_number>` - Manually mark an episode as watched.\n' +
                    '\n**User Commands:**\n' +
                    '`!series <series_id>` - View series and mark episodes as watched with ✅ reaction.\n' +
                    '`!serieslist` - List all series.\n' +
                    '`!seriesstatus <series_id>` - Show series progress.\n' +
                    '`!seasonstatus <series_id> <season_number>` - Show season details.\n' +
                    '`!serialhelp` - Show this help.'
                )
                .setColor('#00b7ff');
            const reply = await message.channel.send({ embeds: [embed] });
            await scheduleDeletion(message.channel.id, message.id, 2 * 60 * 1000); // Command
            await scheduleDeletion(reply.channel.id, reply.id, 2 * 60 * 1000);     // Response
        }
    });

    // Reaction Handler for Emoji-Based Control
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (!client.seriesEmbeds || !client.seriesEmbeds[reaction.message.id]) return;

        const { seriesId, nextEpisode } = client.seriesEmbeds[reaction.message.id];
        if (reaction.emoji.name === '✅' && ADMIN_IDS.includes(user.id)) {
            await markEpisodeWatched(seriesId, nextEpisode.season_number, nextEpisode.episode_number);
            const series = await getSeriesById(seriesId);
            await logAction('marked', series.title, `S${nextEpisode.season_number}E${nextEpisode.episode_number} as watched via reaction`);
            const newNextEpisode = await getNextUnwatchedEpisode(seriesId);
            await updateEmbed(reaction.message, series, newNextEpisode);
            if (newNextEpisode) {
                client.seriesEmbeds[reaction.message.id].nextEpisode = newNextEpisode;
            } else {
                delete client.seriesEmbeds[reaction.message.id];
            }
            await reaction.users.remove(user.id); // Remove the admin's reaction
        }
    });
};
