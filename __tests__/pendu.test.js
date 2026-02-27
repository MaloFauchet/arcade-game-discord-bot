import { jest, describe, beforeEach, afterEach } from '@jest/globals';
import penduCommand from '../commands/pendu.js';
import { EmbedBuilder } from 'discord.js';

describe('Commande /pendu', () => {
    let mockInteraction;
    let mockCollector;

    beforeEach(() => {
        // Creation d'un faux collecteur
        mockCollector = {
            on: jest.fn(),
            stop: jest.fn()
        };

        // Creation d'un faux discord
        mockInteraction = {
            user: {id: '123456789'},
            reply: jest.fn().mockResolvedValue(true),
            editReply: jest.fn().mockResolvedValue(true),
            followUp: jest.fn().mockResolvedValue(true),
            channel: {
                createMessageCollector: jest.fn().mockReturnValue(mockCollector)
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('devrait posséder les bonnes métadonnées (nom et description)', async () => {
        expect(penduCommand.data.name).toBe('pendu');
        expect(penduCommand.data.description).toBeDefined();
    });
    
    it('devrait initialiser la partie et envoyer un embed', async () => {
        await penduCommand.execute(mockInteraction);

        // Vérifie que le bot a bien répondu au joueur
        expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
        
        // Vérifie que la réponse contient bien un Embed
        const replyArgs = mockInteraction.reply.mock.calls[0][0];
        expect(replyArgs.embeds[0]).toBeInstanceOf(EmbedBuilder);
        expect(replyArgs.embeds[0].data.title).toContain('Jeu du Pendu');

        // Vérifie que le collecteur a bien été créé
        expect(mockInteraction.channel.createMessageCollector).toHaveBeenCalled();
    });

    it('devrait ignorer les lettres déjà proposées', async () => {
        await penduCommand.execute(mockInteraction);

        // On récupère la fonction de callback associée à l'événement 'collect'
        const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];

        // On simule le joueur envoyant la lettre "A"
        const mockMessageA = { content: 'A', deletable: true, delete: jest.fn().mockResolvedValue(true) };
        await collectCallback(mockMessageA);

        // On simule le joueur envoyant DE NOUVEAU la lettre "A"
        await collectCallback(mockMessageA);

        // Le bot doit utiliser followUp pour avertir le joueur (message éphémère)
        expect(mockInteraction.followUp).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('déjà essayé') })
        );
    });

    it('devrait gérer une victoire si toutes les lettres sont trouvées', async () => {
        // 1. On force Math.random pour que le mot soit toujours le premier de la liste ('JAVASCRIPT')
        const mathSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
        
        await penduCommand.execute(mockInteraction);
        
        // On récupère les callbacks des événements
        const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];
        const endCallback = mockCollector.on.mock.calls.find(call => call[0] === 'end')[1];

        // 2. On simule le joueur qui tape les bonnes lettres pour "JAVASCRIPT"
        const lettersToGuess = ['J', 'A', 'V', 'S', 'C', 'R', 'I', 'P', 'T'];
        
        for (const letter of lettersToGuess) {
            await collectCallback({ content: letter, deletable: true, delete: jest.fn().mockResolvedValue(true) });
        }

        // 3. On vérifie que le collecteur a bien été stoppé avec la raison 'win'
        expect(mockCollector.stop).toHaveBeenCalledWith('win');

        // 4. On déclenche l'événement de fin manuellement
        await endCallback(null, 'win');

        // 5. On vérifie que l'embed final affiche bien "Gagné"
        const editReplyArgs = mockInteraction.editReply.mock.calls[mockInteraction.editReply.mock.calls.length - 1][0];
        expect(editReplyArgs.embeds[0].data.title).toContain('Gagné');

        // On nettoie le mock de Math.random pour ne pas impacter les autres tests
        mathSpy.mockRestore();
    });

    it('devrait gérer une défaite après 6 erreurs', async () => {
        const mathSpy = jest.spyOn(Math, 'random').mockReturnValue(0); // Le mot est 'JAVASCRIPT'
        
        await penduCommand.execute(mockInteraction);
        
        const collectCallback = mockCollector.on.mock.calls.find(call => call[0] === 'collect')[1];
        const endCallback = mockCollector.on.mock.calls.find(call => call[0] === 'end')[1];

        // On simule 6 mauvaises lettres
        const wrongLetters = ['Z', 'Y', 'X', 'W', 'U', 'Q'];
        
        for (const letter of wrongLetters) {
            await collectCallback({ content: letter, deletable: true, delete: jest.fn().mockResolvedValue(true) });
        }

        // Le bot doit arrêter le collecteur avec la raison 'lose'
        expect(mockCollector.stop).toHaveBeenCalledWith('lose');

        await endCallback(null, 'lose');

        // On vérifie l'embed de défaite
        const editReplyArgs = mockInteraction.editReply.mock.calls[mockInteraction.editReply.mock.calls.length - 1][0];
        expect(editReplyArgs.embeds[0].data.title).toContain('Perdu');

        mathSpy.mockRestore();
    });

    it('devrait gérer l\'expiration du temps (timeout)', async () => {
        await penduCommand.execute(mockInteraction);
        
        const endCallback = mockCollector.on.mock.calls.find(call => call[0] === 'end')[1];

        // On simule la fin du collecteur par le temps ('time')
        await endCallback(null, 'time');

        // On vérifie que le bot envoie bien le message d'expiration
        expect(mockInteraction.editReply).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.stringContaining('expiré') })
        );
    });
});