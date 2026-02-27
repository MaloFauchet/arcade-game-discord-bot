import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import UserStat from '../models/UserStat.js';

const ROWS = 6;
const COLS = 7;
const EMPTY = '⚪';
const P1_TOKEN = '🔴';
const P2_TOKEN = '🟡';

export default {
    data: new SlashCommandBuilder()
        .setName('puissance4')
        .setDescription('Défie un ami au Puissance 4 !')
        .addUserOption(option => 
            option.setName('adversaire')
                .setDescription('Le joueur que tu veux affronter')
                .setRequired(true)
        ),

    async execute(interaction) {
        const player1 = interaction.user;
        const player2 = interaction.options.getUser('adversaire');

        // Petites vérifications de base
        if (player2.bot) return interaction.reply({ content: 'Tu ne peux pas jouer contre un bot !', ephemeral: true });
        if (player1.id === player2.id) return interaction.reply({ content: 'Tu ne peux pas jouer contre toi-même !', ephemeral: true });

        // Initialisation de la grille (matrice 6x7 remplie de ronds blancs)
        let grid = Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY));
        let currentPlayer = player1;
        let isGameOver = false;

        // Fonction pour transformer la matrice en texte affichable
        const renderGrid = () => {
            let boardStr = '';
            for (let r = 0; r < ROWS; r++) {
                boardStr += grid[r].join('') + '\n';
            }
            boardStr += '1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣'; // Base de la grille
            return boardStr;
        };

        // Algorithme de vérification de victoire
        const checkWin = (token) => {
            // Horizontale, Verticale, Diagonale Droite, Diagonale Gauche
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    if (c <= COLS - 4 && grid[r][c] === token && grid[r][c+1] === token && grid[r][c+2] === token && grid[r][c+3] === token) return true;
                    if (r <= ROWS - 4 && grid[r][c] === token && grid[r+1][c] === token && grid[r+2][c] === token && grid[r+3][c] === token) return true;
                    if (r <= ROWS - 4 && c <= COLS - 4 && grid[r][c] === token && grid[r+1][c+1] === token && grid[r+2][c+2] === token && grid[r+3][c+3] === token) return true;
                    if (r <= ROWS - 4 && c >= 3 && grid[r][c] === token && grid[r+1][c-1] === token && grid[r+2][c-2] === token && grid[r+3][c-3] === token) return true;
                }
            }
            return false;
        };

        // Fonction pour générer l'interface (Embed + Menu)
        const generateUI = (statusMessage, disableMenu = false) => {
            const embed = new EmbedBuilder()
                .setTitle('🔴 Puissance 4 🟡')
                .setDescription(`${statusMessage}\n\n${renderGrid()}`)
                .setColor(0x3498DB);

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('p4_select')
                    .setPlaceholder('Choisis une colonne...')
                    .setDisabled(disableMenu)
                    .addOptions(
                        Array.from({ length: COLS }, (_, i) => ({
                            label: `Colonne ${i + 1}`,
                            value: i.toString(),
                            emoji: ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'][i]
                        }))
                    )
            );

            return { embeds: [embed], components: [row] };
        };

        // Envoi du message initial
        const response = await interaction.reply(generateUI(`C'est au tour de **${currentPlayer.username}** ${P1_TOKEN}`));

        // Création du collecteur (uniquement pour les menus déroulants)
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.StringSelect, 
            time: 600000 // 10 minutes max
        });

        collector.on('collect', async i => {
            // Vérifie que c'est bien l'un des deux joueurs
            if (i.user.id !== player1.id && i.user.id !== player2.id) {
                return i.reply({ content: 'Tu ne participes pas à cette partie !', ephemeral: true });
            }

            // Vérifie que c'est bien le tour du joueur qui a cliqué
            if (i.user.id !== currentPlayer.id) {
                return i.reply({ content: "Ce n'est pas ton tour !", ephemeral: true });
            }

            const col = parseInt(i.values[0]);
            let placedRow = -1;

            // Fait "tomber" le jeton dans la colonne choisie
            for (let r = ROWS - 1; r >= 0; r--) {
                if (grid[r][col] === EMPTY) {
                    grid[r][col] = currentPlayer.id === player1.id ? P1_TOKEN : P2_TOKEN;
                    placedRow = r;
                    break;
                }
            }

            // Si la colonne est pleine
            if (placedRow === -1) {
                return i.reply({ content: 'Cette colonne est pleine, choisis-en une autre.', ephemeral: true });
            }

            // On acquitte l'interaction pour que Discord ne fige pas l'interface
            await i.deferUpdate();

            // Vérification des conditions de fin
            const token = currentPlayer.id === player1.id ? P1_TOKEN : P2_TOKEN;
            
            if (checkWin(token)) {
                isGameOver = true;
                collector.stop('win');
                return;
            }

            // Vérifie l'égalité (grille pleine)
            if (grid[0].every(c => c !== EMPTY)) {
                isGameOver = true;
                collector.stop('draw');
                return;
            }

            // Changement de joueur
            currentPlayer = currentPlayer.id === player1.id ? player2 : player1;
            const nextToken = currentPlayer.id === player1.id ? P1_TOKEN : P2_TOKEN;
            
            await interaction.editReply(generateUI(`C'est au tour de **${currentPlayer.username}** ${nextToken}`));
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'win') {
                const loser = currentPlayer.id === player1.id ? player2 : player1;

                // Enregistrement MongoDB pour le gagnant et le perdant
                await UserStat.findOneAndUpdate(
                    { userId: currentPlayer.id, gameName: 'puissance4' },
                    { $inc: { wins: 1 } },
                    { upsert: true }
                );
                await UserStat.findOneAndUpdate(
                    { userId: loser.id, gameName: 'puissance4' },
                    { $inc: { losses: 1 } },
                    { upsert: true }
                );

                await interaction.editReply(generateUI(`🏆 **${currentPlayer.username}** a gagné !`, true));
            } else if (reason === 'draw') {
                await interaction.editReply(generateUI('🤝 Égalité ! La grille est pleine.', true));
            } else {
                // Timeout
                await interaction.editReply(generateUI('⏱️ La partie a expiré.', true));
            }
        });
    }
};