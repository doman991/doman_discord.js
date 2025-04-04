const { EmbedBuilder } = require('discord.js');
const { getUserData, upsertUserData, incrementUserField, insertMessageToDelete } = require('../database');

module.exports = (client) => {
    // User joins the server
    client.on('guildMemberAdd', async (member) => {
        const userId = member.user.id;
        let userData = await getUserData(userId);

        if (!userData) {
            // New user: initialize data
            const inviterId = '0'; // Placeholder; enhance with invite tracking if needed
            await upsertUserData(userId, [], 1, new Date().toISOString(), 0, 0, inviterId);
        } else {
            // Existing user: increment connections only
            await incrementUserField(userId, 'connections');
            // Restore roles
            const roles = JSON.parse(userData.roles || '[]');
            for (const roleId of roles) {
                const role = member.guild.roles.cache.get(roleId);
                if (role && role.id !== member.guild.id) { // Exclude @everyone role
                    await member.roles.add(role).catch(error => console.error('[userTracker] Error adding role:', error));
                }
            }
        }
    });

    // User leaves or is kicked
    client.on('guildMemberRemove', async (member) => {
        const userId = member.user.id;
        const userData = await getUserData(userId);
        if (userData) {
            const roles = member.roles.cache
                .filter(role => role.id !== member.guild.id)
                .map(role => role.id);
            await upsertUserData(userId, roles, userData.connections, userData.first_join_date, userData.kicks + 1, userData.bans, userData.inviter_id);
        }
    });

    // User is banned
    client.on('guildBanAdd', async (ban) => {
        const userId = ban.user.id;
        const userData = await getUserData(userId);
        if (userData) {
            await incrementUserField(userId, 'bans');
        }
    });

    // Role changes (added or removed)
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const userId = newMember.user.id;
        const oldRoles = oldMember.roles.cache
            .filter(role => role.id !== oldMember.guild.id)
            .map(role => role.id);
        const newRoles = newMember.roles.cache
            .filter(role => role.id !== newMember.guild.id)
            .map(role => role.id);

        if (JSON.stringify(oldRoles) !== JSON.stringify(newRoles)) {
            const userData = await getUserData(userId);
            await upsertUserData(userId, newRoles, userData?.connections, userData?.first_join_date, userData?.kicks, userData?.bans, userData?.inviter_id);
        }
    });

    // !user <userid> or !user @user command (admin only, schedules deletion of command and embed)
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        const args = message.content.split(' ').slice(1);
        const command = message.content.split(' ')[0].toLowerCase();
        const currentTimeMs = Date.now();

        if (command === '!user') {
            if (!client.adminIds.includes(message.author.id)) {
                const reply = await message.reply('Only admins can use this command.');
                const deleteAt = new Date(currentTimeMs + 60 * 1000); // 1 minute from now
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }
            if (args.length === 0) {
                const reply = await message.reply('Please provide a user ID or mention, e.g., `!user 123456789012345678` or `!user @user`.');
                const deleteAt = new Date(currentTimeMs + 60 * 1000); // 1 minute from now
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            // Extract user ID from either a raw ID or a mention
            let userId = args[0];
            if (message.mentions.users.size > 0) {
                userId = message.mentions.users.first().id; // Get ID from mention
            } else if (!/^\d{17,19}$/.test(userId)) { // Basic check for valid Discord ID
                const reply = await message.reply('Invalid user ID or mention. Use a valid ID or @user.');
                const deleteAt = new Date(currentTimeMs + 60 * 1000); // 1 minute from now
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const userData = await getUserData(userId);
            if (!userData) {
                const reply = await message.reply('User not found in the database.');
                const deleteAt = new Date(currentTimeMs + 60 * 1000); // 1 minute from now
                await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
                await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
                return;
            }

            const user = await client.users.fetch(userId).catch(() => null);
            const embed = new EmbedBuilder()
                .setTitle(`User Info: ${user ? user.tag : 'Unknown User'}`)
                .setDescription(
                    `**ID**: ${userId}\n` +
                    `**First Join Date**: ${userData.first_join_date.toISOString().split('T')[0]}\n` +
                    `**Connections**: ${userData.connections}\n` +
                    `**Kicks**: ${userData.kicks}\n` +
                    `**Bans**: ${userData.bans}\n` +
                    `**Inviter**: ${userData.inviter_id === '0' ? 'Unknown' : `<@${userData.inviter_id}>`}\n` +
                    `**Roles**: ${JSON.parse(userData.roles || '[]').map(roleId => `<@&${roleId}>`).join(', ') || 'None'}`
                )
                .setColor('#00b7ff');

            const reply = await message.channel.send({ embeds: [embed] });
            const deleteAt = new Date(currentTimeMs + 60 * 1000); // 1 minute from now
            await insertMessageToDelete(message.channel.id, message.id, deleteAt, null);
            await insertMessageToDelete(reply.channel.id, reply.id, deleteAt, null);
        }
    });
};
