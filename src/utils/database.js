const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/tickets.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// Initialize database
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
        tickets: [],
        ticketCounter: 1000,
        activeTickets: {}
    }, null, 2));
}

class Database {
    constructor() {
        this.data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }

    save() {
        fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
    }

    // Ticket operations
    createTicket(userId, channelId, title, message) {
        const ticketNumber = this.data.ticketCounter++;
        const ticket = {
            id: ticketNumber,
            userId,
            channelId,
            title,
            message,
            status: 'open',
            claimedBy: null,
            createdAt: new Date().toISOString(),
            closedAt: null,
            transcript: []
        };
        
        this.data.tickets.push(ticket);
        this.data.activeTickets[userId] = (this.data.activeTickets[userId] || 0) + 1;
        this.save();
        return ticket;
    }

    getTicket(channelId) {
        return this.data.tickets.find(t => t.channelId === channelId);
    }

    getTicketByNumber(number) {
        return this.data.tickets.find(t => t.id === parseInt(number));
    }

    getUserActiveTickets(userId) {
        return this.data.tickets.filter(t => t.userId === userId && t.status === 'open');
    }

    claimTicket(channelId, staffId) {
        const ticket = this.getTicket(channelId);
        if (ticket) {
            ticket.claimedBy = staffId;
            this.save();
        }
        return ticket;
    }

    closeTicket(channelId, closerId) {
        const ticket = this.getTicket(channelId);
        if (ticket) {
            ticket.status = 'closed';
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = closerId;
            this.data.activeTickets[ticket.userId] = Math.max(0, (this.data.activeTickets[ticket.userId] || 0) - 1);
            this.save();
        }
        return ticket;
    }

    addTranscriptMessage(channelId, message) {
        const ticket = this.getTicket(channelId);
        if (ticket) {
            ticket.transcript.push({
                author: message.author.tag,
                authorId: message.author.id,
                content: message.content,
                timestamp: message.createdAt.toISOString(),
                attachments: message.attachments.map(a => a.url)
            });
            this.save();
        }
    }

    getStats() {
        return {
            total: this.data.tickets.length,
            open: this.data.tickets.filter(t => t.status === 'open').length,
            closed: this.data.tickets.filter(t => t.status === 'closed').length
        };
    }
}

module.exports = new Database();
