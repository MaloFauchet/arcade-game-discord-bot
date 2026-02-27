import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
	.setName('pendu')
	.setDescription('Lance une partie de pendu classique !'),
    
    async execute(interaction) {
	await interaction.reply({
            content: 'Le jeu du pendu est en construction...',
            ephemeral: true
        });
    }
};

