const { getOverdueMessages, markMessageErrored, updateRemovalStats, deleteMessageRecord } = require('../database');

module.exports = (client) => {
    const INTERVAL_SECONDS = 10; // Run every 10 seconds (configurable)

    // Log only to console
    const sendDebug = (message) => {
        console.log(`[autoRemove] ${message}`);
    };

    // Log errors to console and debug channel
    const sendError = async (message) => {
        console.error(`[autoRemove] ${message}`);
        try {
            const debugChannel = await client.channels.fetch(client.debugChannelId);
            if (debugChannel) {
                await debugChannel.send(message.slice(0, 2000));
            }
        } catch (error) {
            console.error('[autoRemove] Failed to send error to debug channel:', error);
        }
    };

    // Delete overdue messages and manage database records
    const deleteOverdueMessages = async () => {
        const overdueMessages = await getOverdueMessages();
        for (const msg of overdueMessages) {
            try {
                const channel = client.channels.cache.get(msg.channel_id);
                if (channel) {
                    try {
                        // Fetch the message to confirm it exists
                        const message = await channel.messages.fetch(msg.message_id);
                        // Delete the message
                        await message.delete();
                        const deletionTime = new Date().toISOString().replace('T', ' ').split('.')[0];
                        sendDebug(`Deleted message ${msg.message_id} at ${deletionTime}`);

                        // Update removal stats for the bot
                        await updateRemovalStats(client.user.id, 1);

                        // Clean up log message if it exists
                        if (msg.log_message_id) {
                            const debugChannel = await client.channels.fetch(client.debugChannelId);
                            if (debugChannel) {
                                await debugChannel.messages.delete(msg.log_message_id);
                                sendDebug(`Deleted log message ${msg.log_message_id}`);
                                // Optionally count log message deletions too (uncomment if desired)
                                // await updateRemovalStats(client.user.id, 1);
                            }
                        }

                        // Remove the record from the database since deletion succeeded
                        await deleteMessageRecord(msg.id);
                    } catch (fetchError) {
                        if (fetchError.code === 10008) { // Unknown Message (already deleted)
                            sendDebug(`Message ${msg.message_id} already deleted or not found. Removing record.`);
                            await deleteMessageRecord(msg.id);
                            // Clean up log message if it exists
                            if (msg.log_message_id) {
                                const debugChannel = await client.channels.fetch(client.debugChannelId);
                                if (debugChannel) {
                                    await debugChannel.messages.delete(msg.log_message_id);
                                    sendDebug(`Deleted log message ${msg.log_message_id} for non-existent message`);
                                    // Optionally count log message deletions too (uncomment if desired)
                                    // await updateRemovalStats(client.user.id, 1);
                                }
                            }
                        } else {
                            // Deletion failed for another reason
                            await markMessageErrored(msg.id, fetchError.message);
                            sendError(`Failed to fetch or delete message ${msg.message_id}: ${fetchError.message}`);
                        }
                    }
                } else {
                    // Channel not found or inaccessible
                    await markMessageErrored(msg.id, 'Channel inaccessible');
                    sendDebug(`Marked message ${msg.message_id} as errored due to inaccessible channel ${msg.channel_id}`);
                }
            } catch (error) {
                await markMessageErrored(msg.id, error.message);
                sendError(`Failed to process message ${msg.message_id}: ${error.message}`);
            }
        }
    };

    // Run on startup and every INTERVAL_SECONDS
    deleteOverdueMessages().catch(error => console.error('[autoRemove] Error on startup:', error));
    setInterval(() => deleteOverdueMessages().catch(error => console.error('[autoRemove] Interval error:', error)), INTERVAL_SECONDS * 1000);

    // Log when cog starts
    console.log('[autoRemove] autoRemove.js loaded and running');
};
