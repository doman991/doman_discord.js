const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    const CHANNEL_ID = ''; // Replace with ID of channel where to send embed
    const EMBED_MESSAGE_ID = ''; // Replace with your embed’s message ID

    const roleMapping = {
        'diablo4': { roleId: '1345560992188465212', emojiId: '1345563858437275658' },
        'wow': { roleId: '1345560960848625726', emojiId: '1345564812570001418' },
        'wowhead': { roleId: '1345560929152139397', emojiId: '1345564053703102475' },
        'lastepo': { roleId: '1345560881005854762', emojiId: '1345563725431574528' },
        'poe2': { roleId: '1345560855202369576', emojiId: '1345564198058332280' },
        'poe1': { roleId: '1345560818963714058', emojiId: '1345565345297207409' },
        'valheim': { roleId: '1345560783072792667', emojiId: '1345563991736451122' },
        'enshrouded': { roleId: '1345560739535912980', emojiId: '1345563785892724838' },
        'rust': { roleId: '1345560708779081841', emojiId: '1345563958505115758' },
        'cs2': { roleId: '1345560668258041999', emojiId: '1345563832235331684' },
        'minecraft': { roleId: '1345560413001220219', emojiId: '1345564126381867089' }
    };

    async function sendOrUpdateEmbed() {
        console.log('Attempting to fetch channel...');
        try {
            const channel = await client.channels.fetch(CHANNEL_ID);
            if (!channel) {
                console.error('Channel not found with ID:', CHANNEL_ID);
                return;
            }
            console.log('Channel fetched successfully:', channel.name);
//Embed starts here
            const embed = new EmbedBuilder()
                .setTitle('📰 Roles: Game Updates')
                .setDescription(
                    'React to the appropriate icon to receive notifications about updates for selected games!\n\n' +
                    '<:minecraft:1345564126381867089> **Updates for Minecraft**\n' +
                    '<:cs2:1345563832235331684> **Updates for Counter-Strike 2**\n' +
                    '<:rust:1345563958505115758> **Updates for Rust**\n' +
                    '<:enshrouded:1345563785892724838> **Updates for Enshrouded**\n' +
                    '<:valheim:1345563991736451122> **Updates for Valheim**\n' +
                    '<:poe1:1345565345297207409> **Updates for Path of Exile**\n' +
                    '<:poe2:1345564198058332280> **Updates for Path of Exile 2**\n' +
                    '<:lastepo:1345563725431574528> **Updates for Last Epoch**\n' +
                    '<:wow:1345564812570001418> **Updates for WoWHead (World of Warcraft News)**\n' +
                    '<:wowhead:1345564053703102475> **Updates for World of Warcraft**\n' +
                    '<:diablo4:1345563858437275658> **Updates for Diablo IV**\n\n' +
                    '*React with the appropriate emoji below to receive notifications!*'
                )
                .setColor('#00b7ff')
                .setFooter({ text: 'Automatic notification system | React to join!' });
//End of embed
            try {
                console.log('Attempting to fetch message with ID:', EMBED_MESSAGE_ID);
                const message = await channel.messages.fetch(EMBED_MESSAGE_ID);
                await message.edit({ embeds: [embed] });
                console.log('Embed updated successfully.');
            } catch (fetchError) {
                console.log('Failed to fetch message, sending a new one...');
                const newMessage = await channel.send({ embeds: [embed] });
                console.log('New embed message sent. ID:', newMessage.id);
                for (const key in roleMapping) {
                    const emoji = client.emojis.cache.get(roleMapping[key].emojiId);
                    if (emoji) {
                        await newMessage.react(emoji);
                        console.log(`Added reaction for ${key}`);
                    } else {
                        console.log(`Emoji ${roleMapping[key].emojiId} not found.`);
                    }
                }
            }
        } catch (error) {
            console.error('Error in sendOrUpdateEmbed:', error);
        }
    }

    // Export initialization function
    module.exports.init = async (client) => {
        console.log('Initializing autoRanks.js');
        await sendOrUpdateEmbed();
    };

    // Reaction handlers remain unchanged
    client.on('messageReactionAdd', async (reaction, user) => {
        if (reaction.message.id !== EMBED_MESSAGE_ID) return;
        if (user.bot) return;
        const emojiId = reaction.emoji.id;
        for (const key in roleMapping) {
            if (roleMapping[key].emojiId === emojiId) {
                const role = reaction.message.guild.roles.cache.get(roleMapping[key].roleId);
                const member = reaction.message.guild.members.cache.get(user.id);
                if (role && member) {
                    await member.roles.add(role);
                    console.log(`Assigned role ${key} to ${user.tag}`);
                }
            }
        }
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        if (reaction.message.id !== EMBED_MESSAGE_ID) return;
        if (user.bot) return;
        const emojiId = reaction.emoji.id;
        for (const key in roleMapping) {
            if (roleMapping[key].emojiId === emojiId) {
                const role = reaction.message.guild.roles.cache.get(roleMapping[key].roleId);
                const member = reaction.message.guild.members.cache.get(user.id);
                if (role && member) {
                    await member.roles.remove(role);
                    console.log(`Removed role ${key} from ${user.tag}`);
                }
            }
        }
    });
};
