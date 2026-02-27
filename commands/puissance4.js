import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, ButtonBuilder, ButtonStyle } from 'discord.js';
import UserStat from '../models/UserStat.js';
import Economy from '../models/Economy.js';

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
        ).addIntegerOption(option =>
            option.setName('mise')
                .setDescription('Combien veux-tu parier ? (0 pour le fun)')
                .setMinValue(0)
                .setRequired(false) // Optionnel, par défaut 0
        ),

    async execute(interaction) {
        const player1 = interaction.user;
        const player2 = interaction.options.getUser('adversaire');
        const bet = interaction.options.getInteger('mise') || 0;

        // Petites vérifications de base
        if (player2.bot) return interaction.reply({ content: 'Tu ne peux pas jouer contre un bot !', ephemeral: true });
        if (player1.id === player2.id) return interaction.reply({ content: 'Tu ne peux pas jouer contre toi-même !', ephemeral: true });

        // --- GESTION DE L'ÉCONOMIE ET DU DÉFI ---
        let p1Wallet, p2Wallet;

        if (bet > 0) {
            // On récupère ou crée les portefeuilles des deux joueurs
            p1Wallet = await Economy.findOneAndUpdate({ userId: player1.id }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
            p2Wallet = await Economy.findOneAndUpdate({ userId: player2.id }, {}, { upsert: true, new: true, setDefaultsOnInsert: true });

            if (p1Wallet.balance < bet) {
                return interaction.reply({ content: `Tu n'as pas assez d'argent ! Il te reste ${p1Wallet.balance} 💰.`, ephemeral: true });
            }
            if (p2Wallet.balance < bet) {
                return interaction.reply({ content: `**${player2.username}** n'a pas assez d'argent pour suivre cette mise (Solde: ${p2Wallet.balance} 💰).`, ephemeral: true });
            }

            // Création des boutons d'acceptation
            const acceptRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('accept_bet').setLabel('Accepter le défi').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('decline_bet').setLabel('Refuser').setStyle(ButtonStyle.Danger)
            );

            const challengeResponse = await interaction.reply({
                content: `⚔️ <@${player2.id}>, **${player1.username}** te défie au Puissance 4 pour **${bet} 💰** !\nAccepte-tu de risquer ta mise ?`,
                components: [acceptRow],
                fetchReply: true // Nécessaire pour attacher un collecteur
            });

            try {
                // On attend UNIQUEMENT la réponse du Joueur 2 pendant 2 minutes
                const confirmation = await challengeResponse.awaitMessageComponent({ 
                    filter: i => i.user.id === player2.id, 
                    time: 120000 
                });

                if (confirmation.customId === 'decline_bet') {
                    await confirmation.update({ content: `❌ **${player2.username}** a refusé le défi.`, components: [] });
                    return; // Fin de la commande
                }

                // S'il accepte, on prélève la mise aux DEUX joueurs immédiatement
                await Economy.updateOne({ userId: player1.id }, { $inc: { balance: -bet } });
                await Economy.updateOne({ userId: player2.id }, { $inc: { balance: -bet } });

                // On acquitte le bouton et on efface le message de défi
                await confirmation.update({ content: `✅ Défi accepté ! La cagnotte est de **${bet * 2} 💰**. Préparation du plateau...`, components: [] });
                
            } catch (e) {
                // Si le Joueur 2 ne répond pas dans les temps
                return interaction.editReply({ content: `⏱️ **${player2.username}** n'a pas répondu au défi à temps.`, components: [] });
            }
        } else {
            // S'il n'y a pas de mise, on passe directement au jeu
            await interaction.reply({ content: 'Partie amicale lancée ! Préparation du plateau...' });
        }

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
                
                // Mises à jour des stats
                await UserStat.findOneAndUpdate({ userId: currentPlayer.id, gameName: 'puissance4' }, { $inc: { wins: 1 } }, { upsert: true });
                await UserStat.findOneAndUpdate({ userId: loser.id, gameName: 'puissance4' }, { $inc: { losses: 1 } }, { upsert: true });

                // Récompense financière
                let gainText = '';
                if (bet > 0) {
                    const pot = bet * 2;
                    await Economy.updateOne({ userId: currentPlayer.id }, { $inc: { balance: pot } });
                    gainText = `\n\n💰 Il remporte la cagnotte de **${pot} pièces** !`;
                }

                await interaction.editReply(generateUI(`🏆 **${currentPlayer.username}** a gagné !${gainText}`, true));

            } else if (reason === 'draw') {
                let refundText = '';
                if (bet > 0) {
                    // Remboursement
                    await Economy.updateOne({ userId: player1.id }, { $inc: { balance: bet } });
                    await Economy.updateOne({ userId: player2.id }, { $inc: { balance: bet } });
                    refundText = `\n\n💰 Les mises de **${bet} pièces** ont été remboursées.`;
                }
                await interaction.editReply(generateUI(`🤝 Égalité ! La grille est pleine.${refundText}`, true));
            } else {
                // Timeout
                await interaction.editReply(generateUI('⏱️ La partie a expiré.', true));
            }
        });
    }
};