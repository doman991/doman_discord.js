const { insertMessageToDelete } = require('../database');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
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
            await message.reply('Please provide a time, e.g., `!timer 30m [optional message]` or `!timer 1h 30m [optional message]`');
            return;
        }

        // Current time for scheduling deletions
        const currentTimeMs = Date.now();

        // Collect duration parts (e.g., "1h", "30m", "15s")
        let durationParts = [];
        let i = 1;
        while (i < args.length && args[i].match(/^\d+[smhd]$/)) {
            const match = args[i].match(/(\d+)([smhd])/);
            const number = parseInt(match[1]);
            if (number <= 0) {
                // Send error: duration must be greater than zero
                const errorMessage = await message.reply('Each duration part must be greater than zero. For example, `1s`, `1m`, etc.');
                const errorDeleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds from now
                await insertMessageToDelete(
                    errorMessage.channel.id,
                    errorMessage.id,
                    errorDeleteAt,
                    null // No log message
                );
                const commandDeleteAt = new Date(currentTimeMs + 1000); // 1 second delay
                await insertMessageToDelete(
                    message.channel.id,
                    message.id,
                    commandDeleteAt,
                    null // No log message
                );
                console.log(`[timer] Scheduled deletion: Error message ${errorMessage.id} in channel ${errorMessage.channel.id} at ${errorDeleteAt.toISOString()}, Command message ${message.id} in channel ${message.channel.id} at ${commandDeleteAt.toISOString()}`);
                return;
            }
            durationParts.push(args[i]);
            i++;
        }

        // Check if at least one valid duration part was provided
        if (durationParts.length === 0) {
            const errorMessage = await message.reply('Please provide at least one valid duration, e.g., `!timer 30m` or `!timer 1h 30m`.');
            const errorDeleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds from now
            await insertMessageToDelete(
                errorMessage.channel.id,
                errorMessage.id,
                errorDeleteAt,
                null // No log message
            );
            const commandDeleteAt = new Date(currentTimeMs + 1000); // 1 second delay
            await insertMessageToDelete(
                message.channel.id,
                message.id,
                commandDeleteAt,
                null // No log message
            );
            console.log(`[timer] Scheduled deletion: Error message ${errorMessage.id} in channel ${errorMessage.channel.id} at ${errorDeleteAt.toISOString()}, Command message ${message.id} in channel ${message.channel.id} at ${commandDeleteAt.toISOString()}`);
            return;
        }

        // Extract custom message (everything after duration parts)
        const customMessage = args.slice(i).join(' ') || '';

        // Calculate total seconds from all duration parts
        let totalSeconds = 0;
        for (const part of durationParts) {
            const match = part.match(/(\d+)([smhd])/);
            const number = parseInt(match[1]);
            const unit = match[2];
            switch (unit) {
                case 's': totalSeconds += number; break;
                case 'm': totalSeconds += number * 60; break;
                case 'h': totalSeconds += number * 3600; break;
                case 'd': totalSeconds += number * 86400; break;
            }
        }

        // Enforce minimum (5 seconds) and maximum (32 days = 2,764,800 seconds)
        if (totalSeconds < 5 || totalSeconds > 2764800) {
            const errorMessage = await message.reply('Timer must be between 5 seconds and 32 days.');
            const errorDeleteAt = new Date(currentTimeMs + 30 * 1000); // 30 seconds from now
            await insertMessageToDelete(
                errorMessage.channel.id,
                errorMessage.id,
                errorDeleteAt,
                null // No log message
            );
            const commandDeleteAt = new Date(currentTimeMs + 1000); // 1 second delay
            await insertMessageToDelete(
                message.channel.id,
                message.id,
                commandDeleteAt,
                null // No log message
            );
            console.log(`[timer] Scheduled deletion: Error message ${errorMessage.id} in channel ${errorMessage.channel.id} at ${errorDeleteAt.toISOString()}, Command message ${message.id} in channel ${message.channel.id} at ${commandDeleteAt.toISOString()}`);
            return;
        }

        // Calculate timestamps
        const countdownEndMs = currentTimeMs + (totalSeconds * 1000); // When the countdown ends
        const deleteAtMs = countdownEndMs + (60 * 60 * 1000); // 1 hour after countdown ends
        const futureTime = Math.floor(countdownEndMs / 1000); // Countdown end in seconds for Discord timestamp

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

            console.log(`[timer] Scheduled deletion: Command message ${message.id} in channel ${message.channel.id} at ${commandDeleteAt.toISOString()}, Countdown message ${countdownMessage.id} in channel ${countdownMessage.channel.id} at ${new Date(deleteAtMs).toISOString()}`);
        } catch (error) {
            console.error('[timer] Error processing timer command:', error);
            await message.reply('Failed to set timer. Check my permissions or database connection!');
        }
    });
};
