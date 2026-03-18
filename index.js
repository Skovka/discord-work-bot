import { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import fs from 'fs';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const DATA_FILE = './data.json';
let data = { users: {}, total: {} };
if (fs.existsSync(DATA_FILE)) data = JSON.parse(fs.readFileSync(DATA_FILE));

// Zapis danych
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

// Format czasu
function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s`;
}

// Pobranie aktualnego czasu (live)
function getElapsed(id) {
  if (!data.users[id]) return 0;
  if (!data.users[id].running) return data.users[id].total;
  return data.users[id].total + (Date.now() - data.users[id].lastStart);
}

// Timer do live update ephemeral
const timers = new Map();

// Funkcja start menu pracy
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

// Obsługa wiadomości
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Menu pracy
  if (message.content === '!menu') await sendMenu(message);

  // Reset danych (tylko osoby z uprawnieniami Manage Messages)
  if (message.content === '!reset' && message.member.permissions.has('ManageMessages')) {
    data.users = {};
    data.total = {};
    saveData();
    message.channel.send('🧹 Dane zostały zresetowane!');
  }

  // Tabela wszystkich użytkowników
  if (message.content === '!tabela') {
    const rows = Object.entries(data.users).map(([id, user]) => {
      const total = formatTime(getElapsed(id));
      return `<@${id}>: ${total}`;
    });

    message.channel.send(`📊 **Tabela Służby:**\n${rows.length ? rows.join('\n') : 'Brak danych'}`);
  }

  // Ranking top 10
  if (message.content === '!ranking') {
    const ranking = Object.entries(data.users)
      .sort(([,a],[,b]) => getElapsed(b) - getElapsed(a))
      .slice(0, 10)
      .map(([id, user], i) => `${i+1}. <@${id}> – ${formatTime(getElapsed(id))}`);

    message.channel.send(`🏆 **Top 10 Służby:**\n${ranking.length ? ranking.join('\n') : 'Brak danych'}`);
  }
});

// Obsługa przycisków
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const id = interaction.user.id;
  if (!data.users[id]) data.users[id] = { total: 0, running: false, lastStart: null };

  // START
  if (interaction.customId === 'start') {
    if (data.users[id].running) return interaction.reply({ content: 'Już jesteś w pracy! ⏱️', ephemeral: true });
    data.users[id].running = true;
    data.users[id].lastStart = Date.now();
    saveData();

    interaction.reply({ content: '🟢 Rozpoczęto służbę!', ephemeral: true });

    // Live timer
    if (timers.has(id)) clearInterval(timers.get(id));
    timers.set(id, setInterval(() => {
      const time = formatTime(getElapsed(id));
      interaction.user.send({ content: `⏱️ Twój czas: ${time}`, ephemeral: true }).catch(()=>{});
    }, 5000));
  }

  // PAUSE
  if (interaction.customId === 'pause') {
    if (!data.users[id].running) return interaction.reply({ content: 'Nie jesteś w pracy!', ephemeral: true });
    data.users[id].running = false;
    data.users[id].total += Date.now() - data.users[id].lastStart;
    saveData();

    clearInterval(timers.get(id));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('resume').setLabel('▶️ Wznów').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    interaction.update({ components: [row] });
  }

  // RESUME
  if (interaction.customId === 'resume') {
    if (data.users[id].running) return interaction.reply({ content: 'Już jesteś w pracy!', ephemeral: true });
    data.users[id].running = true;
    data.users[id].lastStart = Date.now();
    saveData();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pause').setLabel('⏸️ Przerwa').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('stop').setLabel('🔴 Zakończ Służbę').setStyle(ButtonStyle.Danger)
    );
    interaction.update({ components: [row] });

    // Wznawiamy live timer
    if (timers.has(id)) clearInterval(timers.get(id));
    timers.set(id, setInterval(() => {
      const time = formatTime(getElapsed(id));
      interaction.user.send({ content: `⏱️ Twój czas: ${time}`, ephemeral: true }).catch(()=>{});
    }, 5000));
  }

  // STOP
  if (interaction.customId === 'stop') {
    if (data.users[id].running) data.users[id].total += Date.now() - data.users[id].lastStart;
    data.users[id].running = false;
    saveData();

    clearInterval(timers.get(id));

    const totalTime = formatTime(getElapsed(id));
    const allTime = (data.total[id] || 0) + data.users[id].total;
    data.total[id] = allTime;
    saveData();

    await interaction.user.send(`🔴 Służba zakończona!\n⏱️ Czas dzisiaj: ${totalTime}\n📊 Łączny czas: ${formatTime(allTime)}`);
    interaction.reply({ content: 'Służba zakończona! Sprawdź DM 📩', ephemeral: true });
  }
});

// Login
client.login(process.env.DISCORD_TOKEN);
