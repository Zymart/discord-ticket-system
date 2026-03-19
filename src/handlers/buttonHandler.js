const { Events } = require('discord.js');
const TicketManager = require('./ticketManager');

module.exports = (client) => {
    const ticketManager = new TicketManager(client);

    client.on(Events.InteractionCreate, async (interaction) => {
        if (!interaction.isButton()) return;

        const { customId } = interaction;

        try {
            switch (customId) {
                case 'ticket_claim':
                    await ticketManager.claimTicket(interaction);
                    break;
                
                case 'ticket_close':
                    await ticketManager.closeTicket(interaction);
                    break;
                
                case 'ticket_transcript':
                    await ticketManager.showTranscript(interaction);
                    break;
                
                default:
                    break;
            }
        } catch (error) {
            console.error('Button interaction error:', error);
            await interaction.reply({ 
                content: '❌ An error occurred while processing this action.', 
                ephemeral: true 
            }).catch(() => {});
        }
    });
};
