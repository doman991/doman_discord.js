const { insertMessageToDelete } = require('../database');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        // Log every time this event fires
        console.log(`messageCreate event fired for message ${message.id} from ${message.author.tag}: ${message.content}`);

        // Ignore messages from bots
        if (message.author.bot) return;

        // Check if the message starts with !timer
        if (!message.content.startsWith('!timer')) return;

        // Restrict command to admins listed in client.adminIds
        if (!client.adminIds.includes(message.author.id)) {
            await message.reply('You do not have permission to use this command.');
            return;
        }

        // Split the command into parts
        const args = message.content.split(' ');
        if (args.length < 2) {
            await message.reply('Please provide a time, e.g., `!timer 30m [optional message]`');
            return;
        }

        // Extract the duration (e.g., "30m")
        const durationInput = args[1];
        const durationMatch = durationInput.match(/(\d+)([smhd])/);

        // Current time for scheduling deletions
        const currentTimeMs = Date.now();

        if (!durationMatch) {
            try {
                // Send error message and schedule it for deletion after 30 seconds
                const errorMessage = await message.reply('Invalid duration format. Use `<number><unit>`, e.g., `30m`. Units: `s`, `m`, `h`, `d`');
                const errorDeleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds from now
                await insertMessageToDelete(
                    errorMessage.channel.id,
                    errorMessage.id,
                    errorDeleteAt,
                    null // No log message
                );

                // Schedule the user's command message for immediate deletion
                const commandDeleteAt = new Date(currentTimeMs + 1000); // 1 second delay
                await insertMessageToDelete(
                    message.channel.id,
                    message.id,
                    commandDeleteAt,
                    null // No log message
                );

                console.log(`Scheduled deletion: Error message ${errorMessage.id} in channel ${errorMessage.channel.id} at ${errorDeleteAt.toISOString()}, Command message ${message.id} in channel ${message.channel.id} at ${commandDeleteAt.toISOString()}`);
            } catch (error) {
                console.error('Error handling invalid duration format:', error);
                await message.reply('Failed to process invalid format. Check my permissions or database!');
            }
            return;
        }

        // Extract number and unit
        const number = parseInt(durationMatch[1]);
        const unit = durationMatch[2];

        // Convert to seconds based on the unit
        let seconds;
        switch (unit) {
            case 's': seconds = number; break;
            case 'm': seconds = number * 60; break;
            case 'h': seconds = number * 3600; break;
            case 'd': seconds = number * 86400; break;
            default:
                try {
                    // Send error message for invalid unit and schedule it for deletion after 30 seconds
                    const errorMessage = await message.reply('Invalid unit. Use `s` (seconds), `m` (minutes), `h` (hours), or `d` (days).');
                    const errorDeleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds from now
                    await insertMessageToDelete(
                        errorMessage.channel.id,
                        errorMessage.id,
                        errorDeleteAt,
                        null // No log message
                    );

                    // Schedule the user's command message for immediate deletion
                    const commandDeleteAt = new Date(currentTimeMs + 1000); // 1 second delay
                    await insertMessageToDelete(
                        message.channel.id,
                        message.id,
                        commandDeleteAt,
                        null // No log message
                    );

                    console.log(`Scheduled deletion: Error message ${errorMessage.id} in channel ${errorMessage.channel.id} at ${errorDeleteAt.toISOString()}, Command message ${message.id} in channel ${message.channel.id} at ${commandDeleteAt.toISOString()}`);
                } catch (error) {
                    console.error('Error handling invalid unit:', error);
                    await message.reply('Failed to process invalid unit. Check my permissions or database!');
                }
                return;
        }

        // Enforce minimum (5 seconds) and maximum (32 days = 2,764,800 seconds)
        if (seconds < 5 || seconds > 2764800) {
            await message.reply('Timer must be between 5 seconds and 32 days.');
            return;
        }

        // Calculate timestamps
        const countdownEndMs = currentTimeMs + (seconds * 1000); // When the countdown ends
        const deleteAtMs = countdownEndMs + (60 * 60 * 1000); // 1 hour after countdown ends
        const futureTime = Math.floor(countdownEndMs / 1000); // Countdown end in seconds for Discord timestamp

        // Extract custom message (everything after the duration), preserving pings
        const customMessage = args.slice(2).join(' ') || '';

        // Construct the response with countdown (include pings from customMessage)
        const countdown = `<t:${futureTime}:R>`;
        const response = customMessage ? `${customMessage} ${countdown}` : countdown;

        try {
            // Schedule the command message for immediate deletion
            const commandDeleteAt = new Date(currentTimeMs + 1000); // 1 second delay
            await insertMessageToDelete(
                message.channel.id,
                message.id,
                commandDeleteAt,
                null // No log message
            );

            // Send the countdown message and schedule its deletion 1 hour after countdown ends
            const countdownMessage = await message.channel.send(response);
            await insertMessageToDelete(
                countdownMessage.channel.id,
                countdownMessage.id,
                new Date(deleteAtMs),
                null // No log message
            );

            console.log(`Scheduled deletion: Command message ${message.id} in channel ${message.channel.id} at ${commandDeleteAt.toISOString()}, Countdown message ${countdownMessage.id} in channel ${countdownMessage.channel.id} at ${new Date(deleteAtMs).toISOString()}`);
        } catch (error) {
            console.error('Error processing timer command:', error);
            await message.reply('Failed to set timer. Check my permissions or database connection!');
        }
    });
};
