require('dotenv').config();

const express = require('express');
const axios   = require('axios');
const { Pool } = require('pg');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
} = require('discord.js');

const app = express();

const {
  CLIENT_ID,
  CLIENT_SECRET,
  BOT_TOKEN,
  GUILD_ID,
  PORT = 3000,
} = process.env;

const REDIRECT_URI      = 'https://aplikacjaexchanger-production.up.railway.app/callback';
const VERIFY_CHANNEL_ID = '1500246546862833868';
const VERIFY_ROLE_ID    = '1500246544140734613';
const LOG_CHANNEL_ID    = '1500246545797349542';
const LOBBY_CHANNEL_ID  = '1500246547303104602';
const VERIFY_MSG_KEY    = 'verify_message_id';

const STATS_KLIENCI_CHANNEL_ID = '1500246545466003498';
const KLIENT_ROLE_ID           = '1500246544178479156';

const RAVEN_LOGO_URL = 'https://i.imgur.com/sZmJes3.png';
const CAT_GIF_URL    = 'https://i.imgur.com/m5FDtug.gif';

const LEGIT_CHANNEL_ID = '1500246547861078129';
const LEGIT_MSG_KEY    = 'legit_message_id';

// ─── BAZA DANYCH ───────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id       TEXT PRIMARY KEY,
      username      TEXT,
      global_name   TEXT,
      avatar        TEXT,
      access_token  TEXT,
      refresh_token TEXT,
      expires_at    BIGINT,
      authorized_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_config (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  console.log('Baza danych gotowa!');
}

async function saveUser(data) {
  await pool.query(`
    INSERT INTO users (user_id, username, global_name, avatar, access_token, refresh_token, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (user_id) DO UPDATE SET
      username      = $2,
      global_name   = $3,
      avatar        = $4,
      access_token  = $5,
      refresh_token = $6,
      expires_at    = $7,
      authorized_at = NOW()
  `, [data.user_id, data.username, data.global_name, data.avatar,
      data.access_token, data.refresh_token, data.expires_at]);
}

async function getConfig(key) {
  const res = await pool.query('SELECT value FROM bot_config WHERE key = $1', [key]);
  return res.rows.length > 0 ? res.rows[0].value : null;
}

async function setConfig(key, value) {
  await pool.query(`
    INSERT INTO bot_config (key, value) VALUES ($1,$2)
    ON CONFLICT (key) DO UPDATE SET value = $2
  `, [key, value]);
}

// ─── TOKEN REFRESH ─────────────────────────────────────────────────────────────
async function refreshAccessToken(userId) {
  const result = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  if (user.expires_at > Date.now() + 600_000) return user.access_token;

  try {
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'refresh_token',
        refresh_token: user.refresh_token,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 }
    );
    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expiresAt = Date.now() + expires_in * 1000;
    await pool.query(
      `UPDATE users SET access_token=$1, refresh_token=$2, expires_at=$3 WHERE user_id=$4`,
      [access_token, refresh_token, expiresAt, userId]
    );
    return access_token;
  } catch (err) {
    console.error('Blad odswiezania tokenu dla ' + userId + ':', err?.response?.data || err.message);
    return null;
  }
}

// ─── STATYSTYKI KLIENTOW ───────────────────────────────────────────────────────
async function updateKlienciStats() {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) { console.log('BRAK GUILD W CACHE'); return; }

    const count = guild.members.cache.filter(m => m.roles.cache.has(KLIENT_ROLE_ID)).size;
    console.log('Liczba klientow: ' + count);

    const channel = guild.channels.cache.get(STATS_KLIENCI_CHANNEL_ID);
    if (!channel) { console.log('BRAK KANALU ' + STATS_KLIENCI_CHANNEL_ID + ' W CACHE'); return; }

    await channel.setName('📊 〢Klienci→' + count);
    console.log('Statystyki klientow zaktualizowane: ' + count);
  } catch (err) {
    console.error('Blad statystyk klientow:', err.message);
  }
}

// ─── WERYFIKACJA EMBED ─────────────────────────────────────────────────────────
function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setAuthor({ name: 'RAVEN EXCHANGE x Weryfikacja' })
    .setTitle('Weryfikacja - Raven Exchange')
    .setDescription(
      '>>> Aby uzyskac dostep do serwera **Raven Exchange**, musisz przejsc proces weryfikacji.\n\n' +
      'Kliknij przycisk ponizej i polacz swoje konto Discord, aby uzyskac dostep do wszystkich kanalow!'
    )
    .setThumbnail(CAT_GIF_URL)
    .setImage(RAVEN_LOGO_URL)
    .setFooter({ text: 'RAVEN EXCHANGE (c) 2026' })
    .setTimestamp();
}

function buildVerifyComponents() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify')
      .setLabel('Zweryfikuj sie')
      .setStyle(ButtonStyle.Secondary)
  )];
}

async function sendOrUpdateVerify() {
  try {
    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
    if (!channel) { console.error('Nie znaleziono kanalu weryfikacji'); return; }

    const embed      = buildVerifyEmbed();
    const components = buildVerifyComponents();
    const existingId = await getConfig(VERIFY_MSG_KEY);

    if (existingId) {
      try {
        const existing = await channel.messages.fetch(existingId);
        await existing.edit({ embeds: [embed], components });
        console.log('Embed weryfikacji zaktualizowany!');
        return;
      } catch {}
    }

    const msg = await channel.send({ embeds: [embed], components });
    await setConfig(VERIFY_MSG_KEY, msg.id);
    console.log('Embed weryfikacji wyslany!');
  } catch (err) {
    console.error('Blad sendOrUpdateVerify:', err.message);
  }
}

// ─── LEGIT CHECK ──────────────────────────────────────────────────────────────
function buildLegitEmbed() {
  return new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setAuthor({ name: 'RAVEN EXCHANGE x CZY JESTESMY LEGIT?', iconURL: RAVEN_LOGO_URL })
    .setDescription(
      '>>> **»** Jezeli uwazasz, ze **tak** to zaznacz reakcje ✅ pod **ta wiadomoscia**.\n' +
      '**»** Jezeli uwazasz, ze **nie** to zaznacz reakcje ❌ pod **ta wiadomoscia**.\n\n' +
      '**»** Zaznaczenie reakcji ❌ bez dowodu skutkuje **natychmiastowa przerwa na 7 dni**.'
    )
    .setThumbnail(CAT_GIF_URL)
    .setImage('https://i.imgur.com/wB8hiP7.png')
    .setFooter({ text: 'RAVEN EXCHANGE (c) 2026' })
    .setTimestamp();
}

async function sendOrUpdateLegitCheck() {
  try {
    const channel = await client.channels.fetch(LEGIT_CHANNEL_ID).catch(() => null);
    if (!channel) { console.error('Nie znaleziono kanalu legit check'); return; }

    const embed      = buildLegitEmbed();
    const existingId = await getConfig(LEGIT_MSG_KEY);

    if (existingId) {
      try {
        const existing = await channel.messages.fetch(existingId);
        await existing.edit({ embeds: [embed] });
        console.log('Embed legit check zaktualizowany!');
        return;
      } catch {}
    }

    const msg = await channel.send({ embeds: [embed] });
    await msg.react('✅');
    await msg.react('❌');
    await setConfig(LEGIT_MSG_KEY, msg.id);
    console.log('Embed legit check wyslany!');
  } catch (err) {
    console.error('Blad sendOrUpdateLegitCheck:', err.message);
  }
}

// ─── BOT ──────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.once('ready', async () => {
  console.log('Bot zalogowany jako ' + client.user.tag);
  await initDB();
  await sendOrUpdateVerify();
  await sendOrUpdateLegitCheck();

  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.members.fetch();
    console.log('Cache memberow zaladowany: ' + guild.members.cache.size + ' osob');
  }

  await updateKlienciStats();
  setInterval(updateKlienciStats, 5 * 60 * 1000);
});

// ─── AKTUALIZACJA PRZY ZMIANIE RANGI ─────────────────────────────────────────
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const hadRole = oldMember.roles.cache.has(KLIENT_ROLE_ID);
  const hasRole = newMember.roles.cache.has(KLIENT_ROLE_ID);
  if (hadRole !== hasRole) await updateKlienciStats();
});

// ─── LOBBY: powitanie ─────────────────────────────────────────────────────────
client.on('guildMemberAdd', async member => {
  try {
    const channel = await client.channels.fetch(LOBBY_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    const memberCount = member.guild.memberCount;
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setAuthor({ name: 'RAVEN EXCHANGE x WITAMY', iconURL: RAVEN_LOGO_URL })
      .setDescription(
        '>>> Witaj <@' + member.user.id + '> na serwerze **Raven Exchange**.\n' +
        '>> Jestes naszym **' + memberCount + '** uzytkownikiem.\n\n' +
        '>> Mamy nadzieje, ze **zostaniesz z nami na dluzej**.'
      )
      .setThumbnail(CAT_GIF_URL)
      .setFooter({ text: 'RAVEN EXCHANGE (c) 2026' })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Blad lobby welcome:', err.message);
  }
});

// ─── LEGIT CHECK: obsługa reakcji ────────────────────────────────────────────
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }

  if (reaction.message.channel.id !== LEGIT_CHANNEL_ID) return;

  const legitMsgId = await getConfig(LEGIT_MSG_KEY).catch(() => null);
  if (reaction.message.id !== legitMsgId) return;

  if (reaction.emoji.name !== '❌') return;

  const guild = reaction.message.guild;
  if (!guild) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
  if (guild.ownerId === user.id) return;

  try {
    await reaction.users.remove(user.id).catch(() => {});
    await member.timeout(7 * 24 * 60 * 60 * 1000, 'Zaznaczenie reakcji nie-legit bez dowodu');

    await user.send(
      '🚫 **Dostałeś przerwę na 7 dni!**\nZaznaczenie reakcji ❌ na kanale legit check bez dowodu skutkuje natychmiastową karą.'
    ).catch(() => {});

    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🔨 Timeout za reakcję nie-legit')
          .setThumbnail(user.displayAvatarURL ? user.displayAvatarURL() : '')
          .addFields(
            { name: 'Użytkownik', value: user.tag + ' (<@' + user.id + '>)', inline: true },
            { name: 'ID',         value: '`' + user.id + '`',                inline: true },
            { name: 'Czas kary',  value: '7 dni',                            inline: true },
            { name: 'Data',       value: '<t:' + Math.floor(Date.now() / 1000) + ':F>', inline: true }
          )
          .setFooter({ text: 'RAVEN EXCHANGE | System legit check' })
          .setTimestamp()]
      });
    }
  } catch (err) {
    console.error('Blad obslugi reakcji legit:', err.message);
  }
});

// ─── ANTI-INVITE ──────────────────────────────────────────────────────────────
const DISCORD_LINK_REGEX = /(discord\.gg\/|discord\.com\/invite\/|dsc\.gg\/)/i;

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
  if (message.guild.ownerId === message.author.id) return;
  if (!DISCORD_LINK_REGEX.test(message.content)) return;

  try {
    await message.delete();

    await message.author.send(
      '🚫 **Nie wysyłaj linków do innych serwerów Discord!**\nZa karę dostajesz przerwę na **7 dni**. Przemyśl co zrobiłeś.'
    ).catch(() => {});

    await message.member.timeout(7 * 24 * 60 * 60 * 1000, 'Wysłanie linku do Discorda');

    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('🔨 Timeout za link do Discorda')
          .setThumbnail(message.author.displayAvatarURL())
          .addFields(
            { name: 'Użytkownik', value: message.author.tag + ' (<@' + message.author.id + '>)', inline: true },
            { name: 'ID',         value: '`' + message.author.id + '`',                          inline: true },
            { name: 'Kanał',      value: '<#' + message.channel.id + '>',                        inline: true },
            { name: 'Treść',      value: '```' + message.content.slice(0, 200) + '```'                        },
            { name: 'Czas kary',  value: '7 dni',                                                inline: true },
            { name: 'Data',       value: '<t:' + Math.floor(Date.now() / 1000) + ':F>',          inline: true }
          )
          .setFooter({ text: 'RAVEN EXCHANGE | System anty-link' })
          .setTimestamp()]
      });
    }
  } catch (err) {
    console.error('Blad anti-invite:', err.message);
  }
});

// ─── INTERAKCJE ───────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {

  // ── PRZYCISK WERYFIKACJI ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'verify') {
    const oauthUrl =
      'https://discord.com/oauth2/authorize' +
      '?client_id=' + CLIENT_ID +
      '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
      '&response_type=code' +
      '&scope=' + encodeURIComponent('identify guilds.join') +
      '&state=' + interaction.user.id;

    await interaction.reply({
      content: 'Kliknij link ponizej, aby sie zweryfikowac:\n' + oauthUrl,
      flags: 64,
    });
    return;
  }

  // ── KOMENDA: /transfer ────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'transfer') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Brak uprawnien.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    const targetGuildId = interaction.options.getString('guild_id');
    const tryb          = interaction.options.getString('tryb');
    const iloscRaw      = interaction.options.getString('ilosc');
    const ilosc         = iloscRaw ? parseInt(iloscRaw) : null;
    const targetUserId  = interaction.options.getString('user_id');

    let users = [];
    if (tryb === 'all') {
      const res = await pool.query('SELECT * FROM users');
      users = res.rows;
    } else if (tryb === 'random') {
      if (!ilosc) return interaction.editReply({ content: 'Podaj ilosc osob!' });
      const res = await pool.query('SELECT * FROM users ORDER BY RANDOM() LIMIT $1', [ilosc]);
      users = res.rows;
    } else if (tryb === 'id') {
      if (!targetUserId) return interaction.editReply({ content: 'Podaj ID uzytkownika!' });
      const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [targetUserId]);
      if (res.rows.length === 0) return interaction.editReply({ content: 'Nie znaleziono uzytkownika w bazie!' });
      users = res.rows;
    }

    if (users.length === 0) return interaction.editReply({ content: 'Brak uzytkownikow w bazie.' });

    const targetGuild = await client.guilds.fetch(targetGuildId).catch(() => null);
    if (!targetGuild) return interaction.editReply({ content: 'Nie znaleziono serwera docelowego!' });

    let success = 0, failed = 0, alreadyOn = 0, deauth = 0, notFound = 0, processed = 0;
    const BATCH_SIZE  = 5;
    const BATCH_DELAY = 300;
    const total       = users.length;
    const startTime   = Date.now();

    function progressBar(current, total, size = 12) {
      const filled = Math.round(total ? (current / total) * size : 0);
      return '█'.repeat(filled) + '░'.repeat(size - filled);
    }

    function formatTime(ms) {
      const sec = Math.floor(ms / 1000);
      return Math.floor(sec / 60) + 'm ' + (sec % 60) + 's';
    }

    async function updateProgress() {
      const elapsed = Date.now() - startTime;
      const speed   = processed / (elapsed / 1000 || 1);
      const eta     = speed > 0 ? ((total - processed) / speed) * 1000 : 0;
      await interaction.editReply({
        content:
          '**Transfer LIVE**\n\n' +
          '📊 ' + progressBar(processed, total) + '\n' +
          '🔢 ' + processed + '/' + total + '\n\n' +
          '✅ Dodano: **' + success + '**\n' +
          '👥 Juz na serwerze: **' + alreadyOn + '**\n' +
          '🚫 Odautoryzowali: **' + deauth + '**\n' +
          '👻 Nie znaleziono: **' + notFound + '**\n' +
          '❌ Bledy: **' + failed + '**\n\n' +
          '⚡ ' + speed.toFixed(2) + ' users/sec\n' +
          '⏱️ ETA: ' + formatTime(eta),
      }).catch(() => {});
    }

    const heartbeat = setInterval(() => updateProgress(), 3000);

    async function addSingleUser(row) {
      let attempts = 0;
      while (attempts < 3) {
        try {
          const token = await refreshAccessToken(row.user_id);
          if (!token) { failed++; return; }

          const res = await axios.put(
            'https://discord.com/api/guilds/' + targetGuildId + '/members/' + row.user_id,
            { access_token: token },
            { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' }, timeout: 10_000 }
          );

          if (res.status === 204) {
            alreadyOn++;
          } else {
            success++;
            setImmediate(async () => {
              try {
                await new Promise(r => setTimeout(r, 1500));
                await axios.put(
                  'https://discord.com/api/guilds/' + targetGuildId + '/members/' + row.user_id + '/roles/' + VERIFY_ROLE_ID,
                  {},
                  { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' }, timeout: 10_000 }
                );
              } catch (err) {
                console.error('Blad rangi transferu dla ' + row.user_id + ':', err?.response?.data || err.message);
              }
            });
          }
          return;
        } catch (err) {
          const status = err?.response?.status;
          const data   = err?.response?.data;
          if (status === 429 && data?.retry_after) {
            await new Promise(r => setTimeout(r, Math.ceil(data.retry_after) + 500));
            attempts++;
            continue;
          }
          if (data?.code === 50025) { deauth++;   return; }
          if (data?.code === 10013) { notFound++; return; }
          attempts++;
        }
      }
      failed++;
    }

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(row => addSingleUser(row)));
      processed += batch.length;
      if (i + BATCH_SIZE < users.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    clearInterval(heartbeat);

    await interaction.editReply({
      content:
        '✅ **Transfer zakonczony!**\n\n' +
        '📊 ' + progressBar(total, total) + '\n' +
        '🔢 ' + total + '/' + total + '\n\n' +
        '✅ Dodano: **' + success + '**\n' +
        '👥 Juz na serwerze: **' + alreadyOn + '**\n' +
        '🚫 Odautoryzowali: **' + deauth + '**\n' +
        '👻 Nie znaleziono: **' + notFound + '**\n' +
        '❌ Bledy: **' + failed + '**\n' +
        '⏱️ Czas: **' + formatTime(Date.now() - startTime) + '**',
    });
    return;
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN);

// ─── CZYSZCZENIE GLOBALNYCH KOMEND (node index.js --cleanup) ──────────────────
if (process.argv.includes('--cleanup')) {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] })
    .then(() => { console.log('Globalne komendy usuniete!'); process.exit(0); })
    .catch(err => { console.error('Blad czyszczenia:', err); process.exit(1); });
}

// ─── REJESTRACJA KOMEND (node index.js --setup) ───────────────────────────────
if (process.argv.includes('--setup')) {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName('transfer')
      .setDescription('Przenosi zweryfikowanych uzytkownikow na inny serwer')
      .addStringOption(opt => opt.setName('guild_id').setDescription('ID serwera docelowego').setRequired(true))
      .addStringOption(opt =>
        opt.setName('tryb').setDescription('Tryb transferu').setRequired(true)
          .addChoices(
            { name: 'Wszyscy',                 value: 'all'    },
            { name: 'Losowi (podaj ilosc)',    value: 'random' },
            { name: 'Konkretna osoba (po ID)', value: 'id'     }
          )
      )
      .addStringOption(opt => opt.setName('ilosc').setDescription('Ile losowych osob (tryb random)').setRequired(false))
      .addStringOption(opt => opt.setName('user_id').setDescription('ID uzytkownika (tryb id)').setRequired(false))
      .toJSON(),
  ];

  rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
    .then(() => { console.log('Komendy zarejestrowane!'); process.exit(0); })
    .catch(err => { console.error('Blad rejestracji:', err); process.exit(1); });
}

// ─── SERWER HTTP (OAuth2 callback) ────────────────────────────────────────────
app.get('/', (req, res) => res.send('Raven Exchange Bot dziala!'));

app.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send('Brak kodu lub ID uzytkownika.');

  try {
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expiresAt = Date.now() + expires_in * 1000;

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: 'Bearer ' + access_token },
      timeout: 10_000,
    });

    const { id: discordUserId, username, global_name, avatar } = userRes.data;
    const avatarUrl = avatar
      ? 'https://cdn.discordapp.com/avatars/' + discordUserId + '/' + avatar + '.png'
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    await saveUser({
      user_id:       discordUserId,
      username,
      global_name:   global_name || username,
      avatar:        avatarUrl,
      access_token,
      refresh_token,
      expires_at:    expiresAt,
    });

    await axios.put(
      'https://discord.com/api/guilds/' + GUILD_ID + '/members/' + discordUserId,
      { access_token },
      { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' }, timeout: 10_000 }
    );

    await new Promise(r => setTimeout(r, 1500));

    try {
      await axios.put(
        'https://discord.com/api/guilds/' + GUILD_ID + '/members/' + discordUserId + '/roles/' + VERIFY_ROLE_ID,
        {},
        { headers: { Authorization: 'Bot ' + BOT_TOKEN, 'Content-Type': 'application/json' }, timeout: 10_000 }
      );
      console.log('Ranga nadana dla: ' + discordUserId);
    } catch (roleErr) {
      console.error('Blad nadawania rangi:', roleErr?.response?.data || roleErr.message);
    }

    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x000000)
          .setTitle('Nowa weryfikacja - Raven Exchange')
          .setThumbnail(avatarUrl)
          .addFields(
            { name: 'Uzytkownik', value: (global_name || username) + ' (`' + username + '`)', inline: true },
            { name: 'ID',         value: '`' + discordUserId + '`',                           inline: true },
            { name: 'Czas',       value: '<t:' + Math.floor(Date.now() / 1000) + ':F>',       inline: false }
          )
          .setFooter({ text: 'RAVEN EXCHANGE | System weryfikacji' })
          .setTimestamp()],
      });
    }

    return res.send(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>Raven Exchange - Weryfikacja</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; color: #fff; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { border: 1px solid #333; border-radius: 12px; padding: 48px 40px; max-width: 420px; text-align: center; background: #111; }
    .check { font-size: 3rem; margin-bottom: 16px; }
    h1 { font-size: 1.6rem; margin-bottom: 12px; }
    p { color: #aaa; line-height: 1.6; }
    .user { color: #fff; font-weight: bold; }
    .brand { color: #fff; font-weight: bold; letter-spacing: 2px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="check">&#x2705;</div>
    <h1>Weryfikacja udana!</h1>
    <p>Witaj, <span class="user">${global_name || username}</span>!<br><br>
    Twoje konto zostalo pomyslnie zweryfikowane w<br>
    <span class="brand">RAVEN EXCHANGE</span>.<br><br>
    Mozesz wrocic na serwer Discord.</p>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('Blad OAuth2 callback:', err?.response?.data || err.message);
    return res.status(500).send(`<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><title>Blad</title>
<style>body{background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;}</style>
</head>
<body><div><h1>Blad weryfikacji</h1><p>Sprobuj ponownie lub skontaktuj sie z administracja.</p></div></body>
</html>`);
  }
});

app.listen(PORT, () => console.log('Serwer HTTP dziala na porcie ' + PORT));
