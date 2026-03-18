import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const DATA_FILE = './data.json';
let data = { users: {} };
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

// MENU PRACY BCSO
async function sendMenu(message) {
  const embed = new EmbedBuilder()
    .setTitle('💼 Panel Służby BCSO')
    .setDescription('Kliknij przycisk, aby rozpocząć, przerwać lub zakończyć służbę.\n🟢 Rozpocznij – rozpoczynasz służbę\n⏸️ Przerwa – wstrzymujesz licznik\n🔴 Zakończ – kończysz służbę')
    .setColor(0xFFAA00) // ciemno-żółty
    .setThumbnail('https://i.imgur.com/8y6XG8K.png')
    .setFooter({ text: 'BCSO Duty Panel', iconURL: 'https://i.imgur.com/8y6XG8K.png' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('start').setLabel('🟢 Rozpocznij Służbę').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
  );

  await message.channel.send({ embeds: [embed], components: [row] });
}

// KOMENDY
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.content === '!menu') await sendMenu(message);

  if (message.content === '!reset' && message.member.permissions.has('ManageMessages')) {
    data.users = {};
    saveData();
    message.channel.send('🧹 Dane bieżących służb zostały zresetowane!');
  }

  if (message.content === '!tabela') {
    const now = Date.now();
    const embed = new EmbedBuilder()
      .setTitle('📊 Tabela Służby BCSO')
      .setColor(0xFFAA00)
      .setFooter({ text: 'Łączny czas od ostatniego resetu' });

    Object.entries(data.users).forEach(([id, user]) => {
      let elapsed = user.total || 0;
      if (user.running && user.lastStart) elapsed += now - user.lastStart;
      embed.addFields({ name: `<@${id}>`, value: `⏱️ ${formatTime(elapsed)}`, inline: true });
    });

    await message.channel.send({ embeds: [embed] });
  }
});

// PRZYCISKI
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
    const sessionTime = now - user.startTime;

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
        `⏱️ Czas tej służby: ${formatTime(sessionTime)}\n` +
        `📊 Łączny czas od ostatniego resetu: ${formatTime(user.total)}`,
      ephemeral: true
    });
  }
});

// 🔒 Auto-save bieżących sesji co 5 sekund
setInterval(() => {
  const now = Date.now();
  for (const [id, user] of Object.entries(data.users)) {
    if (user.running && user.lastStart) {
      user.total += now - user.lastStart;
      user.lastStart = now;
    }
  }
  saveData();
}, 5000);

// 🔒 Graceful shutdown
const saveAllBeforeExit = () => {
  const now = Date.now();
  for (const [id, user] of Object.entries(data.users)) {
    if (user.running && user.lastStart) {
      user.total += now - user.lastStart;
      user.lastStart = now;
    }
  }
  saveData();
  process.exit();
};

process.on('SIGINT', saveAllBeforeExit);
process.on('SIGTERM', saveAllBeforeExit);
process.on('beforeExit', saveAllBeforeExit);

client.login(process.env.DISCORD_TOKEN);
