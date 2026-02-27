import { jest } from '@jest/globals';
import { EmbedBuilder } from 'discord.js';
import topCommand from '../commands/top.js';
import UserStat from '../models/UserStat.js';

describe('Commande /top', () => {
    let mockInteraction;
    let mockUserFetch;
    let dbSpy;

    beforeEach(() => {
        // On prépare le mock pour la récupération des utilisateurs Discord
        mockUserFetch = jest.fn();

        mockInteraction = {
            deferReply: jest.fn().mockResolvedValue(true),
            editReply: jest.fn().mockResolvedValue(true),
            client: {
                users: {
                    fetch: mockUserFetch // On injecte notre fausse fonction fetch ici
                }
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('devrait indiquer si aucun joueur n\'a encore joué', async () => {
        dbSpy = jest.spyOn(UserStat, 'aggregate').mockResolvedValue([]);

        await topCommand.execute(mockInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledTimes(1);
        expect(dbSpy).toHaveBeenCalledTimes(1);
        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Aucun joueur') })
        );
    });

    it('devrait afficher le Top 3 avec les bonnes médailles et les bons pseudos', async () => {
        // 1. On simule le pipeline d'agrégation qui nous renvoie le top 3 calculé
        const fakeLeaderboard = [
            { _id: '111', totalWins: 10, totalLosses: 0 }, // 1er: 100% Winrate
            { _id: '222', totalWins: 5, totalLosses: 5 },  // 2e: 50% Winrate
            { _id: '333', totalWins: 2, totalLosses: 6 }   // 3e: 25% Winrate
        ];
        dbSpy = jest.spyOn(UserStat, 'aggregate').mockResolvedValue(fakeLeaderboard);

        // 2. On simule la réponse de l'API Discord selon l'ID demandé
        mockUserFetch.mockImplementation(async (id) => {
            if (id === '111') return { username: 'Alice' };
            if (id === '222') return { username: 'Bob' };
            if (id === '333') return { username: 'Charlie' };
        });

        await topCommand.execute(mockInteraction);

        const editReplyArgs = mockInteraction.editReply.mock.calls[0][0];
        const embed = editReplyArgs.embeds[0];

        // 3. Vérifications de l'Embed
        expect(embed).toBeInstanceOf(EmbedBuilder);
        expect(embed.data.title).toBe('🏆 Classement Général du Serveur');
        
        // 4. Vérification du contenu généré (Pseudos + Médailles + Winrate)
        const description = embed.data.description;
        expect(description).toContain('🥇 **Alice**');
        expect(description).toContain('WR: 100%');

        expect(description).toContain('🥈 **Bob**');
        expect(description).toContain('WR: 50%');

        expect(description).toContain('🥉 **Charlie**');
        expect(description).toContain('WR: 25%');

        // On vérifie que Discord a bien été interrogé 3 fois pour les pseudos
        expect(mockUserFetch).toHaveBeenCalledTimes(3);
    });

    it('devrait afficher "Joueur inconnu" si un utilisateur a quitté le serveur (fetch échoue)', async () => {
        const fakeLeaderboard = [
            { _id: '999', totalWins: 5, totalLosses: 2 }
        ];
        dbSpy = jest.spyOn(UserStat, 'aggregate').mockResolvedValue(fakeLeaderboard);

        // On simule une erreur de l'API Discord (utilisateur introuvable)
        mockUserFetch.mockRejectedValue(new Error('Unknown User'));

        // On masque le console.error temporairement
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await topCommand.execute(mockInteraction);

        const editReplyArgs = mockInteraction.editReply.mock.calls[0][0];
        const description = editReplyArgs.embeds[0].data.description;

        // Le code doit avoir survécu à l'erreur et utilisé le nom par défaut
        expect(description).toContain('🥇 **Joueur inconnu**');

        consoleSpy.mockRestore();
    });

    it('devrait gérer proprement une erreur de la base de données', async () => {
        dbSpy = jest.spyOn(UserStat, 'aggregate').mockRejectedValue(new Error('Erreur BDD'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await topCommand.execute(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Une erreur est survenue') })
        );

        consoleSpy.mockRestore();
    });
});