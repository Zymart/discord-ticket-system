require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.name, command);
    console.log(`✅ Loaded command: ${command.name}`);
}

// Ready event
client.once(Events.ClientReady, () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    console.log(`📊 Serving ${client.guilds.cache.size} guilds`);
    
    // Set activity
    client.user.setActivity(`${config.prefix}ticket | Support System`, { type: 'WATCHING' });
});

// Message handler for prefix commands
client.on(Events.MessageCreate, async (message) => {
    // Ignore bots and DMs
    if (message.author.bot || !message.guild) return;

    // Check prefix
    if (!message.content.startsWith(config.prefix)) return;

    // Parse command
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        await command.execute(message, args, client);
    } catch (error) {
        console.error(error);
        message.reply('❌ An error occurred while executing the command.');
    }
});

// Load button handlers
require('./handlers/buttonHandler')(client);

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login
client.login(process.env.DISCORD_TOKEN);
