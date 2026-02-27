import { jest } from '@jest/globals';
import { EmbedBuilder } from 'discord.js';
import statsCommand from '../commands/stats.js';
import UserStat from '../models/UserStat.js';

describe('Commande /stats', () => {
    let mockInteraction;
    let mockGetUser;
    let dbSpy;

    beforeEach(() => {
        // On simule la fonction pour récupérer un utilisateur ciblé
        mockGetUser = jest.fn().mockReturnValue(null); // Par défaut, aucune cible

        // On simule l'interaction Discord
        mockInteraction = {
            user: { id: '12345', username: 'Malo', displayAvatarURL: jest.fn().mockReturnValue('http://avatar.url') },
            options: { getUser: mockGetUser },
            deferReply: jest.fn().mockResolvedValue(true),
            editReply: jest.fn().mockResolvedValue(true),
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('devrait indiquer si le joueur n\'a aucune statistique', async () => {
        // On simule une base de données qui renvoie un tableau vide
        dbSpy = jest.spyOn(UserStat, 'find').mockResolvedValue([]);

        await statsCommand.execute(mockInteraction);

        expect(mockInteraction.deferReply).toHaveBeenCalledTimes(1);
        expect(dbSpy).toHaveBeenCalledWith({ userId: '12345' }); // Vérifie qu'on cherche le bon ID
        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('n\'a encore joué à aucun jeu') })
        );
    });

    it('devrait afficher les stats d\'un autre joueur si ciblé', async () => {
        // On simule qu'on a ciblé un autre joueur avec l'option
        const targetUser = { id: '67890', username: 'Ami', displayAvatarURL: jest.fn() };
        mockGetUser.mockReturnValue(targetUser);
        
        dbSpy = jest.spyOn(UserStat, 'find').mockResolvedValue([]);

        await statsCommand.execute(mockInteraction);

        // On vérifie que la requête BDD a bien utilisé l'ID de la cible et non de l'auteur
        expect(dbSpy).toHaveBeenCalledWith({ userId: '67890' });
        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('**Ami** n\'a encore joué') })
        );
    });

    it('devrait calculer et afficher correctement les statistiques', async () => {
        // On simule des données renvoyées par MongoDB
        const fakeData = [
            { gameName: 'pendu', wins: 3, losses: 1 },    // 4 parties, 75% winrate
            { gameName: 'morpion', wins: 0, losses: 2 }   // 2 parties, 0% winrate
        ];
        dbSpy = jest.spyOn(UserStat, 'find').mockResolvedValue(fakeData);

        await statsCommand.execute(mockInteraction);

        // On récupère l'argument passé à editReply (qui contient l'embed)
        const editReplyArgs = mockInteraction.editReply.mock.calls[0][0];
        const embed = editReplyArgs.embeds[0];

        // Vérifications sur l'Embed
        expect(embed).toBeInstanceOf(EmbedBuilder);
        expect(embed.data.title).toBe('📊 Statistiques de Malo');
        expect(embed.data.fields).toHaveLength(2); // Il doit y avoir 2 jeux affichés

        // Vérification des calculs pour le Pendu
        expect(embed.data.fields[0].name).toBe('🎮 Pendu'); // Majuscule bien ajoutée
        expect(embed.data.fields[0].value).toContain('**Victoires :** 3');
        expect(embed.data.fields[0].value).toContain('**Défaites :** 1');
        expect(embed.data.fields[0].value).toContain('75%'); // Winrate correct

        // Vérification des calculs globaux dans le footer
        expect(embed.data.footer.text).toBe('Total global : 3 V - 3 D');
    });

    it('devrait gérer les erreurs de la base de données proprement', async () => {
        // On simule un crash de MongoDB
        dbSpy = jest.spyOn(UserStat, 'find').mockRejectedValue(new Error('Connexion perdue'));
        
        // On masque le console.error pour ne pas polluer le terminal pendant les tests
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await statsCommand.execute(mockInteraction);

        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('Une erreur est survenue') })
        );

        consoleSpy.mockRestore();
    });
});