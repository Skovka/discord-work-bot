import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const DATA_FILE = './data.json';
let data = { users: {}, total: {} };
if (fs.existsSync(DATA_FILE)) data = JSON.parse(fs.readFileSync(DATA_FILE));

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function getElapsed(id) {
  if (!data.users[id]) return 0;
  const user = data.users[id];
  let elapsed = user.total || 0;
  if (user.running && user.lastStart) elapsed += Date.now() - user.lastStart;
  return elapsed;
}

async function sendMenu(message) {
  const embed = new EmbedBuilder()
    .setTitle('💼 Menu Pracy')
    .setDescription('Kliknij przycisk, aby zarządzać służbą')
    .setColor(0x00FF00);

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
    const rows = Object.entries(data.users)
      .map(([id]) => `<@${id}>: ${formatTime(getElapsed(id))}`);
    message.channel.send(`📊 **Tabela Służby:**\n${rows.length ? rows.join('\n') : 'Brak danych'}`);
  }

  if (message.content === '!ranking') {
    const ranking = Object.entries(data.total)
      .sort(([,a],[,b]) => b - a)
      .slice(0,10)
      .map(([id,total],i) => `${i+1}. <@${id}> – ${formatTime(total)}`);
    message.channel.send(`🏆 **Top 10 Służby (łączny czas):**\n${ranking.length ? ranking.join('\n') : 'Brak danych'}`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const id = interaction.user.id;
  const now = Date.now();

  if (!data.users[id]) data.users[id] = { total: 0, running: false, lastStart: null, startTime: null };
  const user = data.users[id];

  // START
  if (interaction.customId === 'start') {
    if (user.running) return interaction.reply({ content:'Już jesteś w pracy!', ephemeral:true });
    user.running = true;
    user.lastStart = now;
    user.startTime = now;
    if (!data.total[id]) data.total[id] = 0;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ components: [row] });
    await interaction.followUp({ content:'🟢 Rozpoczęto służbę!', ephemeral:true });
  }

  // PAUSE
  if (interaction.customId === 'pause') {
    if (!user.running) return interaction.reply({ content:'Nie jesteś w pracy!', ephemeral:true });
    user.running = false;
    user.total += now - user.lastStart;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('resume').setLabel('▶️ Wznów').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ components: [row] });
    await interaction.followUp({ content:'⏸️ Jesteś na przerwie!', ephemeral:true });
  }

  // RESUME
  if (interaction.customId === 'resume') {
    if (user.running) return interaction.reply({ content:'Już jesteś w pracy!', ephemeral:true });
    user.running = true;
    user.lastStart = now;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ components: [row] });
    await interaction.followUp({ content:'▶️ Służba wznowiona!', ephemeral:true });
  }

  // STOP
  if (interaction.customId === 'stop') {
    if (user.running) user.total += now - user.lastStart;
    user.running = false;

    const startTime = new Date(user.startTime).toLocaleString();
    const endTime = new Date(now).toLocaleString();
    const sessionTime = user.total;

    data.total[id] = (data.total[id] || 0) + sessionTime;
    saveData();

    user.total = 0;
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start').setLabel('🟢 Rozpocznij Służbę').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({ components: [row] });
    await interaction.followUp({
      content:
        `🔴 **Służba zakończona!**\n` +
        `🕒 Rozpoczęto: ${startTime}\n` +
        `🕒 Zakończono: ${endTime}\n` +
        `⏱️ Czas dzisiejszej służby: ${formatTime(sessionTime)}\n` +
        `📊 Łączny czas: ${formatTime(data.total[id])}`,
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
