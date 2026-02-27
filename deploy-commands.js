import { REST, Routes } from 'discord.js';
import fs from 'fs';
import 'dotenv/config';

const commands = [];
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const command = await import(`./commands/${file}`);
    commands.push(command.default.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
    console.log(`Debut du rafaichissment de ${commands.length} commandes...`);
    const data = await rest.put(
	Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
	{ body: commands }
    );
    console.log(`${data.length} commandes rechargees avec succes !`);
} catch (error) {
    console.error(error);
}

