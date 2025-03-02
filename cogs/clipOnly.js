const { insertMessageToDelete, getOverdueMessages, deleteMessageRecord, getMessageRecordByMessageId } = require('../database');

// Configurable deletion delay in hours
const DELETION_DELAY_HOURS = 1; // Adjust this for non-video message deletion delay

module.exports = (client) => {
    const CLIP_CHANNEL_ID = ''; // Your clip channel ID
    const DEBUG_CHANNEL_ID = ''; // Your debug channel ID

    // Function to extract file extension from URL
    const getExtension = (url) => {
        const path = url.split('?')[0]; // Remove query parameters
        const parts = path.split('/');
        const filename = parts[parts.length - 1];
        const ext = filename.split('.').pop();
        return ext.toLowerCase();
    };

    // Log only to console (for detailed debug info)
    const sendDebug = (message) => {
        console.log(message);
    };

    // Log to console and debug channel (for confirmations), returns the sent message
    const sendConfirmation = async (message) => {
        console.log(message);
        try {
            const debugChannel = await client.channels.fetch(DEBUG_CHANNEL_ID);
            if (debugChannel) {
                const sentMessage = await debugChannel.send(message.slice(0, 2000)); // Discord’s 2000-char limit
                return sentMessage; // Return the message object to get its ID
            }
        } catch (error) {
            console.error('Failed to send confirmation to debug channel:', error);
        }
        return null; // Return null if sending fails
    };

    // Log errors to console and debug channel
    const sendError = async (message) => {
        console.error(message);
        try {
            const debugChannel = await client.channels.fetch(DEBUG_CHANNEL_ID);
            if (debugChannel) {
                await debugChannel.send(message.slice(0, 2000));
            }
        } catch (error) {
            console.error('Failed to send error to debug channel:', error);
        }
    };

    // Initialize debug on startup (defined but not called)
    const initializeDebug = async () => {
        await sendConfirmation('ClipOnly cog initialized and running');
    };

    // Delete overdue messages and their corresponding log messages
    const deleteOverdueMessages = async () => {
        const overdueMessages = await getOverdueMessages();
        for (const msg of overdueMessages) {
            if (msg.channel_id === CLIP_CHANNEL_ID) {
                try {
                    const channel = client.channels.cache.get(msg.channel_id);
                    if (channel) {
                        try {
                            // Delete the original message
                            const message = await channel.messages.fetch(msg.message_id);
                            await message.delete();
                            const deletionTime = new Date().toISOString().replace('T', ' ').split('.')[0];
                            sendDebug(`Deleted message ${msg.message_id} at ${deletionTime}`);

                            // Delete the corresponding log message if it exists
                            if (msg.log_message_id) {
                                const debugChannel = await client.channels.fetch(DEBUG_CHANNEL_ID);
                                if (debugChannel) {
                                    await debugChannel.messages.delete(msg.log_message_id);
                                    sendDebug(`Deleted log message ${msg.log_message_id}`);
                                }
                            }
                            await deleteMessageRecord(msg.id);
                        } catch (fetchError) {
                            if (fetchError.code === 10008) { // Unknown Message
                                await deleteMessageRecord(msg.id);
                                sendDebug(`Cleaned up non-existent message ${msg.message_id}`);
                                // Clean up log message if it exists
                                if (msg.log_message_id) {
                                    const debugChannel = await client.channels.fetch(DEBUG_CHANNEL_ID);
                                    if (debugChannel) {
                                        await debugChannel.messages.delete(msg.log_message_id);
                                        sendDebug(`Deleted log message ${msg.log_message_id} for non-existent message`);
                                    }
                                }
                            } else {
                                sendError(`Failed to fetch message ${msg.message_id}: ${fetchError.message}`);
                            }
                        }
                    } else {
                        await deleteMessageRecord(msg.id);
                        sendDebug(`Removed record for inaccessible channel ${msg.channel_id}`);
                    }
                } catch (error) {
                    sendError(`Failed to delete message ${msg.message_id}: ${error.message}`);
                }
            } else {
                await deleteMessageRecord(msg.id); // Silently clean up other channels
            }
        }
    };

    // Run on startup and every minute
    deleteOverdueMessages().catch(console.error);
    setInterval(() => deleteOverdueMessages().catch(console.error), 60 * 1000);

    // Handle new messages
    client.on('messageCreate', async (message) => {
        if (message.channel.id !== CLIP_CHANNEL_ID) return;
        if (message.author.bot) {
            await sendDebug(`Ignoring bot message ${message.id}`);
            return;
        }

        // Video detection logic
        const videoExtensions = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
        const hasVideo = message.attachments.some(att => {
            const extension = getExtension(att.url);
            const isVideoByExtension = videoExtensions.includes(extension);
            const isVideoByContentType = att.contentType?.startsWith('video/') || false;
            const isVideoByName = att.name ? videoExtensions.some(ext => att.name.toLowerCase().endsWith(`.${ext}`)) : false;

            // Log attachment check details (console-only)
            const debugMsg = `Checking: URL=${att.url}, Ext=${extension}, Type=${att.contentType}, Name=${att.name}, VideoByExt=${isVideoByExtension}, VideoByType=${isVideoByContentType}, VideoByName=${isVideoByName}`;
            sendDebug(debugMsg);

            return isVideoByExtension || isVideoByContentType || isVideoByName;
        });

        if (hasVideo) {
            try {
                await message.react('✅');
                await sendDebug(`Added ✅ to message ${message.id}`); // Console-only
            } catch (error) {
                await sendError(`Failed to react to ${message.id}: ${error.message}`);
            }
        } else {
            // Schedule deletion for non-video messages
            const deleteTime = Math.floor((Date.now() + DELETION_DELAY_HOURS * 60 * 60 * 1000) / 1000); // Unix timestamp in seconds
            const deleteAt = new Date(Date.now() + DELETION_DELAY_HOURS * 60 * 60 * 1000).toISOString().replace('T', ' ').split('.')[0];

            // Construct message link
            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

            // Construct log message with link and countdown
            const logMessage = `Message ${messageLink} will be removed <t:${deleteTime}:R>`;

            try {
                // Send confirmation and get the log message object
                const logMsg = await sendConfirmation(logMessage);
                if (logMsg) {
                    // Insert record with log_message_id
                    await insertMessageToDelete(message.channel.id, message.id, deleteAt, logMsg.id);
                    await sendDebug(`Scheduled deletion for ${message.id} at ${deleteAt} with log message ${logMsg.id}`);
                } else {
                    // Fallback if sending fails
                    await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                    await sendDebug(`Scheduled deletion for ${message.id} at ${deleteAt} (no log message)`);
                }
            } catch (error) {
                await sendError(`Failed to schedule deletion for ${message.id}: ${error.message}`);
            }
        }
    });

    // Handle manual deletion of original messages
    client.on('messageDelete', async (deletedMessage) => {
        if (deletedMessage.channel.id !== CLIP_CHANNEL_ID) return;

        try {
            // Find and delete the corresponding log message
            const record = await getMessageRecordByMessageId(deletedMessage.id);
            if (record && record.log_message_id) {
                const debugChannel = await client.channels.fetch(DEBUG_CHANNEL_ID);
                if (debugChannel) {
                    await debugChannel.messages.delete(record.log_message_id);
                    sendDebug(`Deleted log message ${record.log_message_id} due to manual deletion of original message ${deletedMessage.id}`);
                }
                await deleteMessageRecord(record.id);
            }
        } catch (error) {
            sendError(`Failed to handle manual deletion for message ${deletedMessage.id}: ${error.message}`);
        }
    });
};
