const { insertMessageToDelete, getMessageRecordByMessageId } = require('../database');

// Configurable deletion delay in hours
const DELETION_DELAY_HOURS = 6;

module.exports = (client) => {
    const CLIP_CHANNEL_ID = '1308145022293774346'; // Your clip channel ID

    // Function to extract file extension from URL
    const getExtension = (url) => {
        const path = url.split('?')[0];
        const parts = path.split('/');
        const filename = parts[parts.length - 1];
        const ext = filename.split('.').pop();
        return ext.toLowerCase();
    };

    // Log only to console
    const sendDebug = (message) => {
        console.log(`[clipOnly] ${message}`);
    };

    // Log to console and debug channel, returns the sent message
    const sendConfirmation = async (message) => {
        console.log(`[clipOnly] ${message}`);
        try {
            const debugChannel = await client.channels.fetch(client.debugChannelId);
            if (debugChannel) {
                const sentMessage = await debugChannel.send(message.slice(0, 2000));
                return sentMessage;
            }
        } catch (error) {
            console.error('[clipOnly] Failed to send confirmation to debug channel:', error);
        }
        return null;
    };

    // Log errors to console and debug channel
    const sendError = async (message) => {
        console.error(`[clipOnly] ${message}`);
        try {
            const debugChannel = await client.channels.fetch(client.debugChannelId);
            if (debugChannel) {
                await debugChannel.send(message.slice(0, 2000));
            }
        } catch (error) {
            console.error('[clipOnly] Failed to send error to debug channel:', error);
        }
    };

    // Handle new messages
    client.on('messageCreate', async (message) => {
        if (message.channel.id !== CLIP_CHANNEL_ID) return;
        if (message.author.bot) {
            await sendDebug(`Ignoring bot message ${message.id}`);
            return;
        }

        // Define video and image extensions
        const videoExtensions = ['mp4', 'mov', 'webm', 'avi', 'mkv'];
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff'];

        // Check if the message has at least one video or image attachment
        const hasVideoOrImage = message.attachments.some(att => {
            const extension = getExtension(att.url);

            const isVideoByExtension = videoExtensions.includes(extension);
            const isVideoByContentType = att.contentType?.startsWith('video/') || false;
            const isVideoByName = att.name ? videoExtensions.some(ext => att.name.toLowerCase().endsWith(`.${ext}`)) : false;

            const isImageByExtension = imageExtensions.includes(extension);
            const isImageByContentType = att.contentType?.startsWith('image/') || false;
            const isImageByName = att.name ? imageExtensions.some(ext => att.name.toLowerCase().endsWith(`.${ext}`)) : false;

            const debugMsg = `Checking: URL=${att.url}, Ext=${extension}, Type=${att.contentType}, Name=${att.name}, ` +
                             `VideoByExt=${isVideoByExtension}, VideoByType=${isVideoByContentType}, VideoByName=${isVideoByName}, ` +
                             `ImageByExt=${isImageByExtension}, ImageByType=${isImageByContentType}, ImageByName=${isImageByName}`;
            sendDebug(debugMsg);

            return isVideoByExtension || isVideoByContentType || isVideoByName ||
                   isImageByExtension || isImageByContentType || isImageByName;
        });

        if (hasVideoOrImage) {
            try {
                await message.react('✅');
                await sendDebug(`Added ✅ to message ${message.id}`);
            } catch (error) {
                await sendError(`Failed to react to ${message.id}: ${error.message}`);
            }
        } else {
            // Schedule deletion for messages without video or image attachments
            const deleteTime = Math.floor((Date.now() + DELETION_DELAY_HOURS * 60 * 60 * 1000) / 1000);
            const deleteAt = new Date(Date.now() + DELETION_DELAY_HOURS * 60 * 60 * 1000);

            const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
            const logMessage = `Message ${messageLink} will be removed <t:${deleteTime}:R>`;

            try {
                const logMsg = await sendConfirmation(logMessage);
                await insertMessageToDelete(
                    message.channel.id,
                    message.id,
                    deleteAt,
                    logMsg ? logMsg.id : null
                );
                await sendDebug(`Scheduled deletion for ${message.id} at ${deleteAt.toISOString()} with log message ${logMsg ? logMsg.id : 'none'}`);
            } catch (error) {
                await sendError(`Failed to schedule deletion for ${message.id}: ${error.message}`);
            }
        }
    });

    // Handle manual deletion of original messages
    client.on('messageDelete', async (deletedMessage) => {
        if (deletedMessage.channel.id !== CLIP_CHANNEL_ID) return;

        try {
            const record = await getMessageRecordByMessageId(deletedMessage.id);
            if (record && record.log_message_id) {
                const debugChannel = await client.channels.fetch(client.debugChannelId);
                if (debugChannel) {
                    await debugChannel.messages.delete(record.log_message_id);
                    sendDebug(`Deleted log message ${record.log_message_id} due to manual deletion of original message ${deletedMessage.id}`);
                }
            }
        } catch (error) {
            sendError(`Failed to handle manual deletion for message ${deletedMessage.id}: ${error.message}`);
        }
    });
};
