const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    const CHANNEL_ID = '1345546588424245268';
    const EMBED_MESSAGE_ID = '1345576571460784139'; // Replace with your embed’s message ID

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
        'minecraft': { roleId: '1345560413001220219', emojiId: '1345564126381867089' },
        'lol': { roleId: '1350068688824307794', emojiId: '1350175765207060511' }
    };

    async function sendOrUpdateEmbed() {
        console.log('[autoRanks] Attempting to fetch channel...');
        try {
            const channel = await client.channels.fetch(CHANNEL_ID);
            if (!channel) {
                console.error('[autoRanks] Channel not found with ID:', CHANNEL_ID);
                return;
            }
            console.log('[autoRanks] Channel fetched successfully:', channel.name);

            const embed = new EmbedBuilder()
                .setTitle('📰 Rangi: Aktualizacje Gier')
                .setDescription(
                    'Reaguj na odpowiednią ikonę, aby otrzymywać powiadomienia o aktualizacjach wybranych gier!\n\n' +
                    '<:minecraft:1345564126381867089> **Aktualizacje do Minecraft**\n' +
                    '<:cs2:1345563832235331684> **Aktualizacje do Counter-Strike 2**\n' +
                    '<:rust:1345563958505115758> **Aktualizacje do Rust**\n' +
                    '<:enshrouded:1345563785892724838> **Aktualizacje do Enshrouded**\n' +
                    '<:valheim:1345563991736451122> **Aktualizacje do Valheim**\n' +
                    '<:poe1:1345565345297207409> **Aktualizacje do Path of Exile**\n' +
                    '<:poe2:1345564198058332280> **Aktualizacje do Path of Exile 2**\n' +
                    '<:lastepo:1345563725431574528> **Aktualizacje do Last Epoch**\n' +
                    '<:wow:1345564812570001418> **Aktualizacje do WoWHead (World of Warcraft News)**\n' +
                    '<:wowhead:1345564053703102475> **Aktualizacje do World of Warcraft**\n' +
                    '<:diablo4:1345563858437275658> **Aktualizacje do Diablo IV**\n' +
                    '<:lol:1350175765207060511> **Aktualizacje do League Of Legends**\n\n' +
                    '*Kliknij odpowiednią reakcję poniżej, aby otrzymać powiadomienia!*'
                )
                .setColor('#00b7ff')
                .setFooter({ text: 'Automatyczny system powiadomień | Reaguj, aby dołączyć!' });

            let message;
            try {
                console.log('[autoRanks] Attempting to fetch message with ID:', EMBED_MESSAGE_ID);
                message = await channel.messages.fetch(EMBED_MESSAGE_ID);
                await message.edit({ embeds: [embed] });
                console.log('[autoRanks] Embed updated successfully.');
            } catch (fetchError) {
                console.log('[autoRanks] Failed to fetch message, sending a new one...');
                message = await channel.send({ embeds: [embed] });
                console.log('[autoRanks] New embed message sent. ID:', message.id);
            }

            // Add missing reactions from roleMapping
            const currentReactions = message.reactions.cache;
            for (const key in roleMapping) {
                const emojiId = roleMapping[key].emojiId;
                const emoji = client.emojis.cache.get(emojiId);
                if (emoji) {
                    const reaction = currentReactions.get(emojiId);
                    if (!reaction) {
                        await message.react(emoji);
                        console.log(`[autoRanks] Added reaction for ${key}`);
                    } else {
                        console.log(`[autoRanks] Reaction for ${key} already exists`);
                    }
                } else {
                    console.log(`[autoRanks] Emoji ${emojiId} not found in cache`);
                }
            }
        } catch (error) {
            console.error('[autoRanks] Error in sendOrUpdateEmbed:', error);
        }
    }

    // Export initialization function
    module.exports.init = async (client) => {
        console.log('[autoRanks] Initializing autoRanks.js');
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
                    console.log(`[autoRanks] Assigned role ${key} to ${user.tag}`);
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
                    console.log(`[autoRanks] Removed role ${key} from ${user.tag}`);
                }
            }
        }
    });
};
