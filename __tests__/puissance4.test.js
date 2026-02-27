import { jest } from '@jest/globals';
import puissance4Command from '../commands/puissance4.js';
import UserStat from '../models/UserStat.js';
import Economy from '../models/Economy.js'; // N'oublie pas l'import de l'économie

describe('Commande /puissance4', () => {
    let mockInteraction;
    let mockGetUser;
    let mockGetInteger;
    let mockCollector;
    let mockMessage;
    let dbStatSpy;
    let dbEcoFindSpy;
    let dbEcoUpdateSpy;

    const player1 = { id: '111', username: 'Alice', bot: false };
    const player2 = { id: '222', username: 'Bob', bot: false };

    beforeEach(() => {
        mockCollector = {
            on: jest.fn(),
            stop: jest.fn()
        };

        // On enrichit mockMessage pour pouvoir simuler l'attente du clic sur le bouton
        mockMessage = {
            createMessageComponentCollector: jest.fn().mockReturnValue(mockCollector),
            awaitMessageComponent: jest.fn() 
        };

        mockGetUser = jest.fn().mockReturnValue(player2);
        mockGetInteger = jest.fn().mockReturnValue(0); // Par défaut, mise de 0

        mockInteraction = {
            user: player1,
            options: { 
                getUser: mockGetUser,
                getInteger: mockGetInteger
            },
            reply: jest.fn().mockResolvedValue(mockMessage),
            editReply: jest.fn().mockResolvedValue(true)
        };

        dbStatSpy = jest.spyOn(UserStat, 'findOneAndUpdate').mockResolvedValue({});
        
        // On simule que chaque joueur a 100 pièces par défaut
        dbEcoFindSpy = jest.spyOn(Economy, 'findOneAndUpdate').mockResolvedValue({ balance: 100 });
        dbEcoUpdateSpy = jest.spyOn(Economy, 'updateOne').mockResolvedValue({});
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // --- TESTS DES RÈGLES DE BASE ---

    it('devrait lancer une partie amicale directement si la mise est 0', async () => {
        await puissance4Command.execute(mockInteraction);
        
        expect(mockInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Partie amicale') })
        );
        // L'économie ne doit même pas être interrogée
        expect(dbEcoFindSpy).not.toHaveBeenCalled(); 
    });

    it('devrait refuser une partie contre un bot', async () => {
        mockGetUser.mockReturnValue({ id: '999', username: 'Robot', bot: true });
        await puissance4Command.execute(mockInteraction);
        expect(mockInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('bot') })
        );
    });

    // --- TESTS DU SYSTÈME FINANCIER ---

    it('devrait bloquer si le lanceur n\'a pas assez d\'argent', async () => {
        mockGetInteger.mockReturnValue(200); // Mise de 200
        // Alice n'a que 50 pièces
        dbEcoFindSpy.mockImplementationOnce(() => Promise.resolve({ balance: 50 })); 
        
        await puissance4Command.execute(mockInteraction);

        expect(mockInteraction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('pas assez d\'argent') })
        );
    });

    it('devrait annuler le pari si le joueur 2 clique sur Refuser', async () => {
        mockGetInteger.mockReturnValue(50);

        // On simule le clic de Bob sur le bouton "Refuser"
        const mockConfirmInteraction = {
            customId: 'decline_bet',
            update: jest.fn().mockResolvedValue(true)
        };
        mockMessage.awaitMessageComponent.mockResolvedValue(mockConfirmInteraction);

        await puissance4Command.execute(mockInteraction);

        // Vérifie que le bot annonce l'annulation
        expect(mockConfirmInteraction.update).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('refusé') })
        );
        // TRÈS IMPORTANT : Aucun argent ne doit avoir été débité !
        expect(dbEcoUpdateSpy).not.toHaveBeenCalled();
    });

    it('devrait débiter les mises, lancer le jeu, et récompenser le gagnant', async () => {
        mockGetInteger.mockReturnValue(50); // Mise de 50
        
        // On simule le clic de Bob sur le bouton "Accepter"
        const mockConfirmInteraction = {
            customId: 'accept_bet',
            update: jest.fn().mockResolvedValue(true)
        };
        mockMessage.awaitMessageComponent.mockResolvedValue(mockConfirmInteraction);

        await puissance4Command.execute(mockInteraction);

        // 1. Vérifie que les 50 pièces ont été débitées (mise en attente) aux DEUX joueurs
        expect(dbEcoUpdateSpy).toHaveBeenCalledWith({ userId: '111' }, { $inc: { balance: -50 } });
        expect(dbEcoUpdateSpy).toHaveBeenCalledWith({ userId: '222' }, { $inc: { balance: -50 } });

        // 2. On simule une victoire rapide de P1 (Alice)
        const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];
        const endCallback = mockCollector.on.mock.calls.find(call => call[0] === 'end')[1];

        const moves = [
            { user: player1, values: ['0'] }, { user: player2, values: ['1'] },
            { user: player1, values: ['0'] }, { user: player2, values: ['1'] },
            { user: player1, values: ['0'] }, { user: player2, values: ['1'] },
            { user: player1, values: ['0'] } // Alice gagne (4 à la suite)
        ];

        for (const move of moves) {
            await collectCallback({
                ...move,
                deferUpdate: jest.fn().mockResolvedValue(true),
                reply: jest.fn().mockResolvedValue(true)
            });
        }

        await endCallback(null, 'win');

        // 3. Vérifie les récompenses de fin de partie
        // Alice (111) doit recevoir la cagnotte (50 * 2 = 100)
        expect(dbEcoUpdateSpy).toHaveBeenCalledWith({ userId: '111' }, { $inc: { balance: 100 } });
        
        // Bob (222) ne reçoit rien (il a déjà perdu ses 50 de départ)
        // expect(dbEcoUpdateSpy).not.toHaveBeenCalledWith({ userId: '222' }, expect.anything());

        // 4. Vérifie l'affichage de l'Embed de victoire
        const editReplyArgs = mockInteraction.editReply.mock.calls[mockInteraction.editReply.mock.calls.length - 1][0];
        expect(editReplyArgs.embeds[0].data.description).toContain('remporte la cagnotte de **100 pièces**');
    });
});