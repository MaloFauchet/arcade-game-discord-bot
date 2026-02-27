import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import UserStat from '../models/UserStat.js';

export default {
    data: new SlashCommandBuilder()
        .setName('top')
        .setDescription('Affiche le classement général des meilleurs joueurs du serveur !'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // Le fameux Pipeline d'Agrégation
            const leaderboard = await UserStat.aggregate([
                {
                    // Étape 1 : On regroupe les documents par userId
                    $group: {
                        _id: '$userId', // _id devient l'ID du joueur
                        totalWins: { $sum: '$wins' },    // On additionne toutes ses victoires
                        totalLosses: { $sum: '$losses' } // On additionne toutes ses défaites
                    }
                },
                {
                    // Étape 2 : On trie par le nombre de victoires (ordre décroissant)
                    $sort: { totalWins: -1 }
                },
                {
                    // Étape 3 : On ne garde que les 3 premiers pour ne pas spammer le salon
                    $limit: 3
                }
            ]);

            if (!leaderboard || leaderboard.length === 0) {
                return interaction.editReply({ 
                    content: '🏆 Aucun joueur n\'a encore fait de partie !' 
                });
            }

            const topEmbed = new EmbedBuilder()
                .setTitle('🏆 Classement Général du Serveur')
                .setColor(0xFFD700) // Couleur Or
                .setDescription('Les meilleurs joueurs, tous mini-jeux confondus :');

            // On construit l'affichage ligne par ligne
            let description = '';
            
            // On utilise une boucle for classique car on fait des requêtes asynchrones à l'API Discord
            for (let i = 0; i < leaderboard.length; i++) {
                const stat = leaderboard[i];
                let username = 'Joueur inconnu';
                
                try {
                    // On demande à Discord de nous donner le pseudo à partir de l'ID stocké en base
                    // C'est mieux que de stocker le pseudo en base, car l'utilisateur peut en changer
                    const user = await interaction.client.users.fetch(stat._id);
                    username = user.username;
                } catch (e) {
                    // Si l'utilisateur a quitté le serveur ou est introuvable
                    console.error(`Impossible de récupérer l'utilisateur ${stat._id}`);
                }

                // Petit calcul du winrate général
                const totalGames = stat.totalWins + stat.totalLosses;
                const winRate = totalGames > 0 ? Math.round((stat.totalWins / totalGames) * 100) : 0;

                // Médailles pour le podium
                const position = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;

                description += `${position} **${username}**\n`;
                description += `\t└ *${stat.totalWins} Victoires / ${stat.totalLosses} Défaites (WR: ${winRate}%)*\n\n`;
            }

            topEmbed.setDescription(description);

            await interaction.editReply({ embeds: [topEmbed] });

        } catch (error) {
            console.error('Erreur lors de la génération du classement:', error);
            await interaction.editReply({ 
                content: '❌ Une erreur est survenue lors du calcul du classement.' 
            });
        }
    }
};