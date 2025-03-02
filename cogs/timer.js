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
            await message.reply('Please provide a time, e.g., `!timer 30m [optional message]`');
            return;
        }

        // Extract the duration (e.g., "30m")
        const durationInput = args[1];
        const durationMatch = durationInput.match(/(\d+)([smhd])/);
        if (!durationMatch) {
            await message.reply('Invalid duration format. Use `<number><unit>`, e.g., `30m`. Units: `s`, `m`, `h`, `d`');
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
                await message.reply('Invalid unit. Use `s` (seconds), `m` (minutes), `h` (hours), or `d` (days).');
                return;
        }

        // Enforce minimum (5 seconds) and maximum (32 days = 2,764,800 seconds)
        if (seconds < 5 || seconds > 2764800) {
            await message.reply('Timer must be between 5 seconds and 32 days.');
            return;
        }

        // Calculate the future timestamp
        const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
        const futureTime = currentTime + seconds;

        // Extract custom message (everything after the duration)
        const customMessage = args.slice(2).join(' ') || '';

        // Construct the response with countdown
        const countdown = `<t:${futureTime}:R>`;
        const response = customMessage ? `${customMessage} ${countdown}` : countdown;

        // Delete the command message and send the response
        try {
            await message.delete();
            await message.channel.send(response);
        } catch (error) {
            console.error('Error deleting message or sending response:', error);
            await message.reply('Failed to set timer. Check my permissions!');
        }
    });
};
