import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import UserStat from '../models/UserStat.js';

export default {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Affiche tes statistiques de jeu ou celles d\'un autre joueur.')
        .addUserOption(option => 
            option.setName('joueur')
                .setDescription('Le joueur dont tu veux voir les statistiques')
                .setRequired(false) // Optionnel : si vide, prend l'auteur de la commande
        ),

    async execute(interaction) {
        // On récupère l'utilisateur ciblé, ou l'auteur de l'interaction par défaut
        const targetUser = interaction.options.getUser('joueur') || interaction.user;

        // On indique à Discord que le bot réfléchit (utile si la BDD met un peu de temps)
        await interaction.deferReply();

        try {
            // Récupération de toutes les stats de ce joueur depuis MongoDB
            const stats = await UserStat.find({ userId: targetUser.id });

            // Si le joueur n'a aucune stat en base de données
            if (!stats || stats.length === 0) {
                return interaction.editReply({ 
                    content: `📊 **${targetUser.username}** n'a encore joué à aucun jeu !` 
                });
            }

            // Création de l'Embed de base
            const statsEmbed = new EmbedBuilder()
                .setTitle(`📊 Statistiques de ${targetUser.username}`)
                .setColor(0x9B59B6) // Violet sympa
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));

            // On boucle sur chaque jeu trouvé pour ce joueur
            let totalWins = 0;
            let totalLosses = 0;

            for (const stat of stats) {
                const gameName = stat.gameName.charAt(0).toUpperCase() + stat.gameName.slice(1);
                const totalGames = stat.wins + stat.losses;
                
                // Petit calcul du winrate (pourcentage de victoire)
                const winRate = totalGames > 0 ? Math.round((stat.wins / totalGames) * 100) : 0;

                statsEmbed.addFields({
                    name: `🎮 ${gameName}`,
                    value: `**Victoires :** ${stat.wins} | **Défaites :** ${stat.losses}\n*Taux de victoire : ${winRate}%*`,
                    inline: false
                });

                totalWins += stat.wins;
                totalLosses += stat.losses;
            }

            // On ajoute un petit récapitulatif global à la fin
            statsEmbed.setFooter({ 
                text: `Total global : ${totalWins} V - ${totalLosses} D` 
            });

            // On envoie le résultat
            await interaction.editReply({ embeds: [statsEmbed] });

        } catch (error) {
            console.error('Erreur lors de la récupération des stats:', error);
            await interaction.editReply({ 
                content: '❌ Une erreur est survenue lors de la communication avec la base de données.' 
            });
        }
    }
};