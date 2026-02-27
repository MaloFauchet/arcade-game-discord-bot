import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import fs from 'fs';
import 'dotenv/config'; // Charge automatiquement le fichier

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.MessageContent
    ]
});

client.commands = new Collection();

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = await import(`./commands/${file}`);
    if ('data' in command.default && 'execute' in command.default) {
	client.commands.set(command.default.data.name, command.default);
    } else {
	console.log(`[ATTENTION] La commande ${file} n'a pas la propriete "data" ou "execute".`);
    }
}

client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot en ligne ! Connecte en tant que ${readyClient.user.tag}`);
    console.log(`ID du proprietaire : ${process.env.OWNER_ID}`);
    console.log(`Server de test cible : ${process.env.GUILD_ID}`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
   
    if (!command) {
	console.error(`Aucune commande ne correspond a ${interaction.commandName}.`);
	return;
    }

    try {
	await command.execute(interaction);
    } catch (error) {
        console.error(error);
	if (interaction.replied || interaction.deferred) {
	    await interaction.followUp({content: 'Erreur lors de l\'execution', ephemeral: true});
	} else {
	    await interaction.reply({content:'Erreur lors de l\'execution', ephemeral: true});
	}
    }
});

client.login(process.env.DISCORD_TOKEN);
