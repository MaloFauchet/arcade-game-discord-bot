import { jest } from '@jest/globals';
import puissance4Command from '../commands/puissance4.js';
import UserStat from '../models/UserStat.js';

describe('Commande /puissance4', () => {
    let mockInteraction;
    let mockGetUser;
    let mockCollector;
    let mockMessage;
    let dbSpy;

    // Définition de nos deux joueurs pour les tests
    const player1 = { id: '111', username: 'Alice', bot: false };
    const player2 = { id: '222', username: 'Bob', bot: false };

    beforeEach(() => {
        mockCollector = {
            on: jest.fn(),
            stop: jest.fn()
        };

        mockMessage = {
            createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector)
        };

        mockGetUser = jest.fn().mockReturnValue(player2);

        mockInteraction = {
            user: player1,
            options: { getUser: mockGetUser },
            reply: jest.fn().mockResolvedValue(mockMessage),
            editReply: jest.fn().mockResolvedValue(true)
        };

        dbSpy = jest.spyOn(UserStat, 'findOneAndUpdate').mockResolvedValue({});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('devrait refuser une partie contre un bot', async () => {
        mockGetUser.mockReturnValue({ id: '999', username: 'Robot', bot: true });
        await puissance4Command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('bot') })
        );
    });

    it('devrait refuser une partie contre soi-même', async () => {
        mockGetUser.mockReturnValue(player1);
        await puissance4Command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('toi-même') })
        );
    });

    it('devrait initialiser le plateau et le collecteur', async () => {
        await puissance4Command.execute(mockInteraction);

        // Vérifie qu'on a bien répondu avec l'Embed et le Menu Déroulant
        const replyArgs = mockInteraction.reply.mock.calls[0][0];
        expect(replyArgs.embeds[0].data.title).toContain('Puissance 4');
        expect(replyArgs.components[0].components[0].data.type).toBe(3); // Type 3 = StringSelectMenu

        expect(mockMessage.createMessageComponentCollector).toHaveBeenCalledTimes(1);
    });

    it('devrait bloquer un joueur qui n\'est pas dans la partie', async () => {
        await puissance4Command.execute(mockInteraction);
        const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];

        // Un "spectateur" essaie de cliquer sur le menu
        const spectatorInteraction = {
            user: { id: '333', username: 'Spectateur' },
            reply: jest.fn().mockResolvedValue(true)
        };

        await collectCallback(spectatorInteraction);

        expect(spectatorInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Tu ne participes pas') })
        );
    });

    it('devrait bloquer un joueur si ce n\'est pas son tour', async () => {
        await puissance4Command.execute(mockInteraction);
        const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];

        // C'est le tour d'Alice (player1), mais Bob (player2) essaie de jouer
        const wrongTurnInteraction = {
            user: player2,
            reply: jest.fn().mockResolvedValue(true)
        };

        await collectCallback(wrongTurnInteraction);

        expect(wrongTurnInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('pas ton tour') })
        );
    });

    it('devrait détecter une victoire verticale et mettre à jour MongoDB', async () => {
        await puissance4Command.execute(mockInteraction);
        
        const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];
        const endCallback = mockCollector.on.mock.calls.find(call => call[0] === 'end')[1];

        // On simule une partie où Alice (P1) et Bob (P2) jouent dans des colonnes différentes.
        // Alice joue colonne 0, Bob joue colonne 1. Alice va faire 4 à la suite verticalement.
        const moves = [
            { user: player1, values: ['0'] }, // P1: Col 0 (1/4)
            { user: player2, values: ['1'] }, // P2: Col 1
            { user: player1, values: ['0'] }, // P1: Col 0 (2/4)
            { user: player2, values: ['1'] }, // P2: Col 1
            { user: player1, values: ['0'] }, // P1: Col 0 (3/4)
            { user: player2, values: ['1'] }, // P2: Col 1
            { user: player1, values: ['0'] }  // P1: Col 0 (4/4) -> VICTOIRE
        ];

        for (const move of moves) {
            await collectCallback({
                ...move,
                deferUpdate: jest.fn().mockResolvedValue(true),
                reply: jest.fn().mockResolvedValue(true)
            });
        }

        // Le collecteur doit avoir été stoppé pour cause de victoire
        expect(mockCollector.stop).toHaveBeenCalledWith('win');

        // On simule la fin officielle du collecteur
        await endCallback(null, 'win');

        // Vérification des appels à la base de données
        expect(dbSpy).toHaveBeenCalledTimes(2);

        // Alice (player1) reçoit une victoire
        expect(dbSpy).toHaveBeenCalledWith(
            { userId: '111', gameName: 'puissance4' },
            { $inc: { wins: 1 } },
            { upsert: true }
        );

        // Bob (player2) reçoit une défaite
        expect(dbSpy).toHaveBeenCalledWith(
            { userId: '222', gameName: 'puissance4' },
            { $inc: { losses: 1 } },
            { upsert: true }
        );
        
        // On vérifie que le message final annonce le bon gagnant
        const editReplyArgs = mockInteraction.editReply.mock.calls[mockInteraction.editReply.mock.calls.length - 1][0];
        expect(editReplyArgs.embeds[0].data.description).toContain('Alice** a gagné');
    });
});