const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const TicketManager = require('../handlers/ticketManager');

module.exports = {
    name: 'ticket',
    description: 'Create a new support ticket',
    usage: '.ticket <title> [message]',
    async execute(message, args, client) {
        // Check if in guild
        if (!message.guild) {
            return message.reply('❌ This command can only be used in a server.');
        }

        // Check args
        if (args.length < 1) {
            const embed = new EmbedBuilder()
                .setColor(config.colors.warning)
                .setTitle('🎫 Ticket Command Usage')
                .setDescription('Create a new support ticket')
                .addFields(
                    { name: 'Usage', value: '`.ticket <title> [message]`' },
                    { name: 'Example', value: '`.ticket "Payment Issue" I was charged twice for my subscription.`' },
                    { name: 'Note', value: 'Title is required. Message is optional but recommended.' }
                )
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const ticketManager = new TicketManager(client);

        // Parse title and message
        let title, description;
        
        if (args[0].startsWith('"')) {
            // Find closing quote
            const endQuote = args.findIndex((arg, i) => i > 0 && arg.endsWith('"'));
            if (endQuote === -1) {
                title = args.join(' ').replace(/"/g, '');
                description = null;
            } else {
                title = args.slice(0, endQuote + 1).join(' ').replace(/"/g, '');
                description = args.slice(endQuote + 1).join(' ') || null;
            }
        } else {
            title = args[0];
            description = args.slice(1).join(' ') || null;
        }

        // Validate title length
        if (title.length > 100) {
            return message.reply('❌ Title must be less than 100 characters.');
        }

        try {
            await ticketManager.createTicket(message, title, description);
        } catch (error) {
            console.error('Error creating ticket:', error);
            message.reply('❌ An error occurred while creating the ticket. Please try again.');
        }
    }
};
