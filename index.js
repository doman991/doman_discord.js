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
        GatewayIntentBits.GuildBans
    ]
});

// Store admin IDs and debug channel ID on the client for reference across cogs
client.adminIds = ['', ''];
client.debugChannelId = ''; // Centralized debug channel ID

client.debug = async (message) => {
    try {
        const debugChannel = await client.channels.fetch(client.debugChannelId);
        if (debugChannel) await debugChannel.send(message);
    } catch (error) {
        console.error('Failed to send debug message:', error);
    }
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
        await initDatabase();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization failed:', error);
        await client.debug('Database failed to initialize. Bot functionality may be limited.');
        return;
    }

    // Load cogs initially
    const cogFiles = fs.readdirSync('./cogs').filter(file => file.endsWith('.js'));
    for (const file of cogFiles) {
        const cogPath = `./cogs/${file}`;
        const cog = require(cogPath);
        cog(client); // Pass the client to the cog
        console.log(`Loaded cog: ${file}`);
        
        // Check if the cog has an init function and call it
        if (typeof cog.init === 'function') {
            await cog.init(client);
            console.log(`Initialized cog: ${file}`);
        }
    }
});

client.login(process.env.BOT_TOKEN || config.token);
