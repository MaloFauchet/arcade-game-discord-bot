import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const WORDS = ['JAVASCRIPT', 'PROGRAMMATION', 'DISCORD', 'ORDINATEUR', 'DEVELOPPEUR', 'RESEAU', 'APPLICATION'];

const HANGMAN_PICS = [
    `
      +---+
      |   |
          |
          |
          |
          |
    =========`,
    `
      +---+
      |   |
      O   |
          |
          |
          |
    =========`,
    `
      +---+
      |   |
      O   |
      |   |
          |
          |
    =========`,
    `
      +---+
      |   |
      O   |
     /|   |
          |
          |
    =========`,
    `
      +---+
      |   |
      O   |
     /|\\  |
          |
          |
    =========`,
    `
      +---+
      |   |
      O   |
     /|\\  |
     /    |
          |
    =========`,
    `
      +---+
      |   |
      O   |
     /|\\  |
     / \\  |
          |
    =========`
];


export default {
    data: new SlashCommandBuilder()
	.setName('pendu')
	.setDescription('Lance une partie de pendu classique !'),
    
    async execute(interaction) {
	    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
	    const guessedLetters = new Set();
	    let errors = 0;
	    const maxErrors = HANGMAN_PICS.length -1;

	    const getWordDisplay = () => {
			return word.split('').map(letter => guessedLetters.has(letter) ? letter : '\\_').join('');
	    };

	    const generateEmbed = (status = 'En cours') => {
			let color = 0x0099FF; // Bleu par defaut
			if (status === 'Gagné') color = 0x00FF00; // Vert
			if (status === 'Perdu') color = 0xFF0000; // Rouge

			return new EmbedBuilder()
				.setTitle(`Jeu du Pendu - ${status}`)
				.setDescription(`\`\`\`\n${HANGMAN_PICS[errors]}\`\`\``)
				.addFields(
				{name: 'Mot à trouver', value: getWordDisplay(), inline: false},
				{name: 'Lettres essayées', value: Array.from(guessedLetters).join(', ') || 'Aucune', inline: false},
				{name: 'Érreurs', value: `${errors}/${maxErrors}`, inline: false}
				)
				.setColor(color)
				.setFooter({text: 'Tape une lettre dans le chat jouer !'});
	    };

	    await interaction.reply({embeds: [generateEmbed()]});

	    const filter = m => m.author.id === interaction.user.id && m.content.length === 1 && m.content.match(/[a-z]/i);
	    const collector = interaction.channel.createMessageCollector({filter, time: 300000}); // Expire apres 5 minutes

	    collector.on('collect', async m => {
			const letter = m.content.toUpperCase();
			if (m.deletable) await m.delete().catch(() => {});

			if (guessedLetters.has(letter)) {
				return interaction.followUp({content: `Tu as déjà essayé la lettre **${letter}** !`, ephemeral: true});
			}

			guessedLetters.add(letter);

			if (!word.includes(letter)) {
				errors++;
			}

			const hasWon = word.split('').every(char => guessedLetters.has(char));
			const hasLost = errors >= maxErrors;

			if (hasWon || hasLost) {
				collector.stop(hasWon ? 'win' : 'lose');
			} else {
				await interaction.editReply({embeds: [generateEmbed()]});
			}
	    });

	    collector.on('end', async (collected, reason) => {
			if (reason === 'win') {
				await interaction.editReply({embeds: [generateEmbed('Gagné')]});
			} else if (reason === 'lose') {
				const lose_embed = generateEmbed('Perdu');
				lose_embed.addFields({name: 'Le mot etait', value: word, inline: false});
				await interaction.editReply({embeds: [lose_embed]});
			} else {
				await interaction.editReply({content: 'La partie a expiré', embeds: []});
			}
	    });
	}
};

