const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');
const { initDatabase } = require('./database');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildBans
    ]
});

// Store admin IDs and debug channel ID on the client for reference across cogs
client.adminIds = ['333637419679219713', '241879263630852097'];
client.debugChannelId = '1209916563512238169'; // Centralized debug channel ID

client.debug = async (message) => {
    try {
        const debugChannel = await client.channels.fetch(client.debugChannelId);
        if (debugChannel) await debugChannel.send(message);
    } catch (error) {
        console.error('[Core] Failed to send debug message:', error);
    }
};

client.once('ready', async () => {
    console.log(`[Core] Logged in as ${client.user.tag}`);
    try {
        await initDatabase();
        console.log('[Core] Database initialized successfully');
    } catch (error) {
        console.error('[Core] Database initialization failed:', error);
        await client.debug('Database failed to initialize. Bot functionality may be limited.');
        return;
    }

    // Load cogs initially
    const cogFiles = fs.readdirSync('./cogs').filter(file => file.endsWith('.js'));
    for (const file of cogFiles) {
        const cogPath = `./cogs/${file}`;
        const cog = require(cogPath);
        cog(client); // Pass the client to the cog
        console.log(`[Core] Loaded cog: ${file}`);
        
        // Check if the cog has an init function and call it
        if (typeof cog.init === 'function') {
            await cog.init(client);
            console.log(`[Core] Initialized cog: ${file}`);
        }
    }
});

client.login(process.env.BOT_TOKEN || config.token);
