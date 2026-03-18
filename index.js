import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const DATA_FILE = './data.json';
let data = { users: {}, total: {} };
if (fs.existsSync(DATA_FILE)) data = JSON.parse(fs.readFileSync(DATA_FILE));

function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function getElapsed(id) {
  if (!data.users[id]) return 0;
  if (!data.users[id].running) return data.users[id].total;
  return data.users[id].total + (Date.now() - data.users[id].lastStart);
}

const timers = new Map();

async function sendMenu(message) {
  const embed = new EmbedBuilder()
    .setTitle('💼 Menu Pracy')
    .setDescription('Wybierz akcję:\n\n🟢 Rozpocznij Służbę\n⏸️ Przerwa\n🔴 Zakończ Służbę')
    .setColor(0x00FF00)
    .setFooter({ text: 'Twój osobisty licznik czasu ⏱️' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('start').setLabel('🟢 Rozpocznij Służbę').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
  );

  await message.channel.send({ embeds: [embed], components: [row] });
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content === '!menu') await sendMenu(message);

  if (message.content === '!reset' && message.member.permissions.has('ManageMessages')) {
    data.users = {};
    saveData();
    message.channel.send('🧹 Dane bieżących służb zostały zresetowane!');
  }

  if (message.content === '!tabela') {
    const rows = Object.entries(data.users).map(([id, user]) => {
      const total = formatTime(getElapsed(id));
      return `<@${id}>: ${total}`;
    });
    message.channel.send(`📊 **Tabela Służby:**\n${rows.length ? rows.join('\n') : 'Brak danych'}`);
  }

  if (message.content === '!ranking') {
    const ranking = Object.entries(data.total)
      .sort(([,a],[,b]) => b - a)
      .slice(0, 10)
      .map(([id, total], i) => `${i+1}. <@${id}> – ${formatTime(total)}`);
    message.channel.send(`🏆 **Top 10 Służby (łączny czas):**\n${ranking.length ? ranking.join('\n') : 'Brak danych'}`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const id = interaction.user.id;
  if (!data.users[id]) data.users[id] = { total: 0, running: false, lastStart: null, startTime: null };

  const now = Date.now();

  if (interaction.customId === 'start') {
    if (data.users[id].running) return interaction.reply({ content: 'Już jesteś w pracy! ⏱️', ephemeral: true });
    data.users[id].running = true;
    data.users[id].lastStart = now;
    data.users[id].startTime = now;
    if (!data.total[id]) data.total[id] = 0;
    saveData();
    interaction.reply({ content: '🟢 Rozpoczęto służbę!', ephemeral: true });
  }

  if (interaction.customId === 'pause') {
    if (!data.users[id].running) return interaction.reply({ content: 'Nie jesteś w pracy!', ephemeral: true });
    data.users[id].running = false;
    data.users[id].total += now - data.users[id].lastStart;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('resume').setLabel('▶️ Wznów').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    interaction.update({ components: [row] });
  }

  if (interaction.customId === 'resume') {
    if (data.users[id].running) return interaction.reply({ content: 'Już jesteś w pracy!', ephemeral: true });
    data.users[id].running = true;
    data.users[id].lastStart = now;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    interaction.update({ components: [row] });
  }

  if (interaction.customId === 'stop') {
    if (data.users[id].running) data.users[id].total += now - data.users[id].lastStart;
    data.users[id].running = false;

    const startTime = new Date(data.users[id].startTime).toLocaleString();
    const endTime = new Date(now).toLocaleString();
    const sessionTime = data.users[id].total;

    data.total[id] = (data.total[id] || 0) + sessionTime;

    saveData();

    await interaction.user.send(
      `🔴 **Służba zakończona!**\n` +
      `🕒 Rozpoczęto: ${startTime}\n` +
      `🕒 Zakończono: ${endTime}\n` +
      `⏱️ Czas dzisiejszej służby: ${formatTime(sessionTime)}\n` +
      `📊 Łączny czas: ${formatTime(data.total[id])}`
    );

    data.users[id].total = 0;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start').setLabel('🟢 Rozpocznij Służbę').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    interaction.update({ components: [row] });
  }
});

client.login(process.env.DISCORD_TOKEN);
