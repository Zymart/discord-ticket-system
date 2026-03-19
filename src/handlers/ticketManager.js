const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const db = require('../utils/database');

class TicketManager {
    constructor(client) {
        this.client = client;
    }

    async createTicket(message, title, description) {
        const user = message.author;
        const guild = message.guild;

        // Check max tickets per user
        const userTickets = db.getUserActiveTickets(user.id);
        if (userTickets.length >= config.tickets.maxTicketsPerUser) {
            return message.reply(`❌ You already have ${config.tickets.maxTicketsPerUser} open tickets. Please close one before creating another.`);
        }

        // Find or create tickets category
        let category = guild.channels.cache.find(c => c.name === config.tickets.categoryName && c.type === ChannelType.GuildCategory);
        
        if (!category) {
            category = await guild.channels.create({
                name: config.tickets.categoryName,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    }
                ]
            });
        }

        // Get support role
        const supportRole = guild.roles.cache.find(r => r.name === config.tickets.supportRole) || 
                           guild.roles.cache.find(r => r.permissions.has(PermissionFlagsBits.ManageChannels));

        // Create ticket channel
        const ticketNumber = db.data.ticketCounter;
        const channelName = `ticket-${ticketNumber}`;

        const permissions = [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            },
            {
                id: this.client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels]
            }
        ];

        if (supportRole) {
            permissions.push({
                id: supportRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            });
        }

        const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: permissions,
            topic: `Ticket #${ticketNumber} | ${title} | Created by ${user.tag}`
        });

        // Save to database
        const ticket = db.createTicket(user.id, ticketChannel.id, title, description);

        // Create ticket embed
        const embed = new EmbedBuilder()
            .setColor(config.colors.primary)
            .setTitle(`🎫 Ticket #${ticket.id}`)
            .setDescription(`**Title:** ${title}\n**Description:** ${description || 'No description provided'}`)
            .addFields(
                { name: 'Created by', value: `<@${user.id}> (${user.tag})`, inline: true },
                { name: 'Status', value: '🟢 Open', inline: true },
                { name: 'Claimed by', value: 'Not claimed', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `User ID: ${user.id}` });

        // Create buttons
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_claim')
                .setLabel('Claim')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('👋'),
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒'),
            new ButtonBuilder()
                .setCustomId('ticket_transcript')
                .setLabel('Transcript')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄')
        );

        const ticketMessage = await ticketChannel.send({
            content: `${user.tag} has created a ticket! ${supportRole ? `<@&${supportRole.id}>` : ''}`,
            embeds: [embed],
            components: [row]
        });

        // Pin the ticket message
        await ticketMessage.pin();

        // Send confirmation to user
        const confirmEmbed = new EmbedBuilder()
            .setColor(config.colors.success)
            .setTitle('✅ Ticket Created')
            .setDescription(`Your ticket has been created: ${ticketChannel}`)
            .setTimestamp();

        await message.reply({ embeds: [confirmEmbed] });

        // Log ticket creation
        await ticketChannel.send(`📋 **Ticket Details:**\n> **Number:** #${ticket.id}\n> **Title:** ${title}\n> **Description:** ${description || 'None'}\n> **Created by:** ${user.tag}`);

        return ticketChannel;
    }

    async claimTicket(interaction) {
        const channel = interaction.channel;
        const user = interaction.user;
        const ticket = db.getTicket(channel.id);

        if (!ticket) {
            return interaction.reply({ content: '❌ This is not a valid ticket channel.', ephemeral: true });
        }

        if (ticket.claimedBy) {
            return interaction.reply({ content: `❌ This ticket is already claimed by <@${ticket.claimedBy}>.`, ephemeral: true });
        }

        db.claimTicket(channel.id, user.id);

        // Update embed
        const messages = await channel.messages.fetchPinned();
        const ticketMessage = messages.first();
        
        if (ticketMessage && ticketMessage.embeds[0]) {
            const oldEmbed = ticketMessage.embeds[0];
            const newEmbed = EmbedBuilder.from(oldEmbed)
                .spliceFields(2, 1, { name: 'Claimed by', value: `<@${user.id}>`, inline: true });

            await ticketMessage.edit({ embeds: [newEmbed] });
        }

        await channel.send(`👋 **Claimed by ${user.tag}**`);
        await interaction.reply({ content: '✅ You have claimed this ticket.', ephemeral: true });
    }

    async closeTicket(interaction) {
        const channel = interaction.channel;
        const user = interaction.user;
        const ticket = db.getTicket(channel.id);

        if (!ticket) {
            return interaction.reply({ content: '❌ This is not a valid ticket channel.', ephemeral: true });
        }

        // Send closing message
        const closeEmbed = new EmbedBuilder()
            .setColor(config.colors.danger)
            .setTitle('🔒 Ticket Closing')
            .setDescription(`This ticket is being closed by ${user.tag}...`)
            .setTimestamp();

        await interaction.reply({ embeds: [closeEmbed] });

        // Generate transcript
        const transcript = await this.generateTranscript(channel, ticket);

        // Send transcript to user via DM
        try {
            const ticketCreator = await this.client.users.fetch(ticket.userId);
            const transcriptEmbed = new EmbedBuilder()
                .setColor(config.colors.info)
                .setTitle(`📄 Ticket #${ticket.id} Transcript`)
                .setDescription(`Your ticket **#${ticket.id}** has been closed.\n**Reason:** ${ticket.title}`)
                .addFields(
                    { name: 'Closed by', value: user.tag, inline: true },
                    { name: 'Created at', value: `<t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await ticketCreator.send({ embeds: [transcriptEmbed] });
            
            // If transcript is long, send as file
            if (transcript.length > 2000) {
                await ticketCreator.send({ 
                    content: '📄 Full transcript attached:',
                    files: [{ attachment: Buffer.from(transcript), name: `ticket-${ticket.id}-transcript.txt` }]
                });
            } else {
                await ticketCreator.send(`📄 **Transcript:**\n\`\`\`\n${transcript}\n\`\`\``);
            }
        } catch (err) {
            console.log('Could not DM user transcript');
        }

        // Update database
        db.closeTicket(channel.id, user.id);

        // Delete channel after 5 seconds
        setTimeout(async () => {
            await channel.delete(`Ticket closed by ${user.tag}`).catch(console.error);
        }, 5000);
    }

    async generateTranscript(channel, ticket) {
        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        
        let transcript = `=== TICKET #${ticket.id} TRANSCRIPT ===\n`;
        transcript += `Title: ${ticket.title}\n`;
        transcript += `Created by: ${(await this.client.users.fetch(ticket.userId)).tag}\n`;
        transcript += `Created at: ${ticket.createdAt}\n`;
        transcript += `Closed at: ${new Date().toISOString()}\n`;
        transcript += `=====================================\n\n`;

        sortedMessages.forEach(msg => {
            if (msg.author.bot && !msg.content.includes('📋 **Ticket Details:**')) return;
            const timestamp = new Date(msg.createdTimestamp).toLocaleString();
            transcript += `[${timestamp}] ${msg.author.tag}: ${msg.content}\n`;
            if (msg.attachments.size > 0) {
                msg.attachments.forEach(att => {
                    transcript += `[ATTACHMENT] ${att.url}\n`;
                });
            }
        });

        return transcript;
    }

    async showTranscript(interaction) {
        const channel = interaction.channel;
        const ticket = db.getTicket(channel.id);

        if (!ticket) {
            return interaction.reply({ content: '❌ This is not a valid ticket channel.', ephemeral: true });
        }

        const transcript = await this.generateTranscript(channel, ticket);
        
        if (transcript.length > 2000) {
            await interaction.reply({
                files: [{ attachment: Buffer.from(transcript), name: `ticket-${ticket.id}-transcript.txt` }],
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `\`\`\`\n${transcript}\n\`\`\``,
                ephemeral: true
            });
        }
    }
}

module.exports = TicketManager;
