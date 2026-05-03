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
  ROLE_ID,
  PORT = 3000,
} = process.env;

const REDIRECT_URI      = 'https://aplikacjaexchanger-production.up.railway.app/callback';
const VERIFY_CHANNEL_ID = '1500246546862833868';
const VERIFY_ROLE_ID    = ROLE_ID || '1500246544140734613';
const LOG_CHANNEL_ID    = '1500246545797349542';
const LOBBY_CHANNEL_ID  = '1500246547303104602';
const VERIFY_MSG_KEY    = 'verify_message_id';

const RAVEN_LOGO_URL = 'https://i.imgur.com/sZmJes3.png';
const CAT_GIF_URL    = 'https://i.imgur.com/m5FDtug.gif';

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
  console.log('✅ Baza danych gotowa!');
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

// ─── WERYFIKACJA EMBED ─────────────────────────────────────────────────────────
function buildVerifyEmbed() {
  return new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setAuthor({ name: 'RAVEN EXCHANGE x Weryfikacja' })
    .setTitle('Weryfikacja — Raven Exchange')
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

// ─── BOT ──────────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

client.once('ready', async () => {
  console.log('Bot zalogowany jako ' + client.user.tag);
  await initDB();
  await sendOrUpdateVerify();
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
    await member.roles.add(VERIFY_ROLE_ID).catch(() => {});
  } catch (err) {
    console.error('Blad lobby welcome:', err.message);
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

    let success = 0, failed = 0, alreadyOn = 0, deauth = 0, notFound = 0;
    const BATCH_SIZE  = 5;
    const BATCH_DELAY = 300;

    async function addUser(row) {
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
          if (res.status === 204) alreadyOn++;
          else success++;
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
      await Promise.all(batch.map(row => addUser(row)));
      if (i + BATCH_SIZE < users.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    await interaction.editReply({
      content:
        'Transfer zakonczony!\n' +
        'Dodano: **' + success + '**\n' +
        'Juz na serwerze: **' + alreadyOn + '**\n' +
        'Odautoryzowali: **' + deauth + '**\n' +
        'Nie znaleziono: **' + notFound + '**\n' +
        'Inne bledy: **' + failed + '**',
    });
    return;
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN);

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

    const guild  = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (member) await member.roles.add(VERIFY_ROLE_ID);

    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x000000)
          .setTitle('Nowa weryfikacja — Raven Exchange')
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
  <title>Raven Exchange — Weryfikacja</title>
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
