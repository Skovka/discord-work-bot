import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import fs from 'fs';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const DATA_FILE = './data.json';
let userData = {};

// Ładowanie danych
if (fs.existsSync(DATA_FILE)) userData = JSON.parse(fs.readFileSync(DATA_FILE));

// Zapis danych
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(userData, null, 2));
}

// Format czasu
function formatTime(ms) {
  let totalSeconds = Math.floor(ms / 1000);
  let h = Math.floor(totalSeconds / 3600);
  let m = Math.floor((totalSeconds % 3600) / 60);
  let s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// Timer Live
function getElapsed(id) {
  if (!userData[id]) return 0;
  if (!userData[id].running) return userData[id].total;
  return userData[id].total + (Date.now() - userData[id].lastStart);
}

// Start bota
client.once('ready', () => {
  console.log(`Zalogowano jako ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.content === '!menu') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start').setLabel('Rozpocznij Służbę').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pause').setLabel('Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    await message.channel.send({ content: 'Menu Pracy', components: [row] });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const id = interaction.user.id;
  if (!userData[id]) userData[id] = { total: 0, running: false, lastStart: null };

  if (interaction.customId === 'start') {
    if (userData[id].running) return interaction.reply({ content: 'Już jesteś w pracy!', ephemeral: true });
    userData[id].running = true;
    userData[id].lastStart = Date.now();
    saveData();
    interaction.reply({ content: 'Rozpoczęto służbę! ⏱️', ephemeral: true });
  }

  if (interaction.customId === 'pause') {
    if (!userData[id].running) return interaction.reply({ content: 'Nie jesteś w pracy!', ephemeral: true });
    userData[id].running = false;
    userData[id].total += Date.now() - userData[id].lastStart;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('resume').setLabel('Wznów').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    interaction.update({ components: [row] });
  }

  if (interaction.customId === 'resume') {
    if (userData[id].running) return interaction.reply({ content: 'Już jesteś w pracy!', ephemeral: true });
    userData[id].running = true;
    userData[id].lastStart = Date.now();
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pause').setLabel('Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    interaction.update({ components: [row] });
  }

  if (interaction.customId === 'stop') {
    if (userData[id].running) userData[id].total += Date.now() - userData[id].lastStart;
    userData[id].running = false;
    saveData();

    const totalTime = formatTime(userData[id].total);
    await interaction.user.send(`Twój czas dzisiaj: ${totalTime}`);
    interaction.reply({ content: 'Służba zakończona! Sprawdź DM 📩', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);