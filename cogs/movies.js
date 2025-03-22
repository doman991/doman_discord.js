const { EmbedBuilder } = require('discord.js');
const {
    addMovie,
    approveMovie,
    getMovies,
    getMovieById,
    getMovieByTitle,
    markMovieWatched,
    removeMovieFromPool,
    editMovieTitle,
    getRandomMovie,
    insertMessageToDelete
} = require('../database');

// Configurable cooldown period in days
const WATCHED_COOLDOWN_DAYS = 182; // Movies can’t be randomly picked for 182 days after being watched

module.exports = (client) => {
    const APPROVE_EMOJI = '✅'; // White check mark
    const REJECT_EMOJI = '❎'; // Negative squared cross mark

    // Command handler
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const currentTimeMs = Date.now();

        // !movieAdd <name>
        if (command === '!movieadd') {
            if (args.length === 0) {
                const reply = await message.reply('Please provide a movie title, e.g., `!movieAdd John Wick`.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            const movieTitle = args.join(' ');
            const existingMovie = await getMovieByTitle(movieTitle);
            if (existingMovie) {
                const logChannel = await client.channels.fetch(client.debugChannelId);
                await logChannel.send(`Movie "${movieTitle}" already exists in the list (ID: ${existingMovie.id}).`);
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                return;
            }

            const suggestionId = await addMovie(movieTitle);
            const logChannel = await client.channels.fetch(client.debugChannelId);
            const logMessage = await logChannel.send(
                `${message.author.tag} suggests adding "${movieTitle}" to the movie list.`
            );
            await logMessage.react(APPROVE_EMOJI);
            await logMessage.react(REJECT_EMOJI);
            client.movieSuggestions = client.movieSuggestions || {};
            client.movieSuggestions[logMessage.id] = {
                userId: message.author.id,
                movieId: suggestionId,
                originalMessage: message
            };

            const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
        }

        // !movieList (sorted alphabetically by title)
        if (command === '!movielist') {
            const movies = await getMovies();
            if (movies.length === 0) {
                const reply = await message.channel.send('No movies in the list yet.');
                const deleteAt = new Date(currentTimeMs + 5 * 60 * 1000); // 5 minutes
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            // Sort movies alphabetically by title
            movies.sort((a, b) => a.title.localeCompare(b.title));

            let description = '';
            movies.forEach(movie => {
                const lastWatched = movie.last_watched ? movie.last_watched.toISOString().split('T')[0] : 'Not watched';
                const title = movie.is_removed_from_pool ? `~~${movie.title}~~` : movie.title;
                description += `ID ${movie.id}. ${title} - ${lastWatched}\n`; // Added space between ID and number
            });

            const embed = new EmbedBuilder()
                .setTitle('📽️ Movie List')
                .setDescription(description)
                .setColor('#00b7ff')
                .setFooter({ text: 'Use !watched <id> to mark as watched (admins only). Sorted alphabetically.' });
            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 5 * 60 * 1000); // 5 minutes
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }

        // !watched <movieID> (Admin only)
        if (command === '!watched') {
            if (!client.adminIds.includes(message.author.id)) {
                const reply = await message.reply('Only admins can mark movies as watched.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            if (args.length === 0 || isNaN(args[0])) {
                const reply = await message.reply('Please provide a valid movie ID, e.g., `!watched 1`. Check IDs with !movieList.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            const movieId = parseInt(args[0]);
            const movie = await getMovieById(movieId);
            if (!movie) {
                const reply = await message.reply('Movie not found. Check the ID with !movieList.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            await markMovieWatched(movieId);
            const reply = await message.reply(`Marked "${movie.title}" as watched on ${new Date().toISOString().split('T')[0]}.`);
            const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }

        // !rmovie
        if (command === '!rmovie') {
            const movie = await getRandomMovie(WATCHED_COOLDOWN_DAYS);
            if (!movie) {
                const reply = await message.reply('No available movies to pick randomly at this time.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            const logChannel = await client.channels.fetch(client.debugChannelId);
            const logMessage = await logChannel.send(
                `Random movie suggestion: "${movie.title}" (ID: ${movie.id}). Approve or reject?`
            );
            await logMessage.react(APPROVE_EMOJI);
            await logMessage.react(REJECT_EMOJI);
            client.movieSuggestions = client.movieSuggestions || {};
            client.movieSuggestions[logMessage.id] = {
                userId: message.author.id,
                movieId: movie.id,
                originalMessage: message,
                isRandom: true
            };
            const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
        }

        // !removeMovie <movieID> (Admin only)
        if (command === '!removemovie') {
            if (!client.adminIds.includes(message.author.id)) {
                const reply = await message.reply('Only admins can remove movies from the random pool.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            if (args.length === 0 || isNaN(args[0])) {
                const reply = await message.reply('Please provide a valid movie ID, e.g., `!removeMovie 1`. Check IDs with !movieList.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            const movieId = parseInt(args[0]);
            const movie = await getMovieById(movieId);
            if (!movie) {
                const reply = await message.reply('Movie not found. Check the ID with !movieList.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            await removeMovieFromPool(movieId);
            const reply = await message.reply(`"${movie.title}" has been removed from the random movie pool.`);
            const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }

        // !editMovie <id> <newTitle> (Admin only)
        if (command === '!editmovie') {
            if (!client.adminIds.includes(message.author.id)) {
                const reply = await message.reply('Only admins can edit movie titles.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            if (args.length < 2) {
                const reply = await message.reply('Please provide a movie ID and new title, e.g., `!editMovie 1 New Title`. Check IDs with !movieList.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            const movieId = parseInt(args[0]);
            const newTitle = args.slice(1).join(' ');
            const movie = await getMovieById(movieId);
            if (!movie) {
                const reply = await message.reply('Movie not found. Check the ID with !movieList.');
                const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            await editMovieTitle(movieId, newTitle);
            const reply = await message.reply(`Updated movie title from "${movie.title}" to "${newTitle}".`);
            const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }

        // !movieHelp
        if (command === '!moviehelp') {
            const embed = new EmbedBuilder()
                .setTitle('🎬 Movie Commands')
                .setDescription(
                    '**!movieAdd <name>** - Suggest a movie to add to the list.\n' +
                    '**!movieList** - Show all movies with their IDs.\n' +
                    '**!watched <id>** - Mark a movie as watched (admin only).\n' +
                    '**!rmovie** - Pick a random movie for approval.\n' +
                    '**!removeMovie <id>** - Remove a movie from the random pool (admin only).\n' +
                    '**!editMovie <id> <newTitle>** - Edit a movie’s title (admin only).\n' +
                    '**!movieHelp** - Show this help message.'
                )
                .setColor('#00b7ff');
            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }
    });

    // Reaction handler for approvals/rejections
    client.on('messageReactionAdd', async (reaction, user) => {
        if (reaction.message.channel.id !== client.debugChannelId) return;
        if (user.bot) return;

        // Remove non-admin reactions
        if (!client.adminIds.includes(user.id)) {
            await reaction.remove();
            return;
        }

        // Handle admin reactions
        if (!client.movieSuggestions || !client.movieSuggestions[reaction.message.id]) return;

        const suggestion = client.movieSuggestions[reaction.message.id];
        const movie = await getMovieById(suggestion.movieId);

        if (reaction.emoji.name === APPROVE_EMOJI) {
            if (suggestion.isRandom) {
                await markMovieWatched(suggestion.movieId);
                const reply = await suggestion.originalMessage.reply(`Random movie "${movie.title}" approved and marked as watched.`);
                const deleteAt = new Date(Date.now() + 30 * 1000); // 30 seconds
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            } else {
                await approveMovie(suggestion.movieId);
                await suggestion.originalMessage.react(APPROVE_EMOJI);
                await reaction.message.edit(`${reaction.message.content} - Approved`);
            }
        } else if (reaction.emoji.name === REJECT_EMOJI) {
            if (suggestion.isRandom) {
                const reply = await suggestion.originalMessage.reply(`Random movie "${movie.title}" rejected. It can be picked again.`);
                const deleteAt = new Date(Date.now() + 30 * 1000); // 30 seconds
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
            } else {
                await deleteMovieRecord(suggestion.movieId);
                await suggestion.originalMessage.react(REJECT_EMOJI);
                await reaction.message.edit(`${reaction.message.content} - Rejected`);
            }
        }
        delete client.movieSuggestions[reaction.message.id];
    });
};

// Helper function to delete a movie record (for rejection)
async function deleteMovieRecord(id) {
    const query = 'DELETE FROM movies WHERE id = ?';
    await pool.execute(query, [id]);
}
