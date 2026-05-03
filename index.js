require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const express = require("express");
const { Pool } = require("pg");
const axios = require("axios");

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI; // np. https://twoja-app.railway.app/callback
const DATABASE_URL = process.env.DATABASE_URL;
const PORT = process.env.PORT || 3000;

const VERIFY_CHANNEL_ID = "1500246546862833868";

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verified_users (
      user_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      username TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log("✅ Baza danych gotowa");
}

async function saveUser(userId, accessToken, refreshToken, expiresIn, username) {
  const expiresAt = Date.now() + expiresIn * 1000;
  await pool.query(
    `INSERT INTO verified_users (user_id, access_token, refresh_token, expires_at, username)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = $2,
       refresh_token = $3,
       expires_at = $4,
       username = $5`,
    [userId, accessToken, refreshToken, expiresAt, username]
  );
}

async function getUsers(limit = null) {
  if (limit) {
    const res = await pool.query(
      "SELECT * FROM verified_users ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    return res.rows;
  }
  const res = await pool.query("SELECT * FROM verified_users ORDER BY created_at DESC");
  return res.rows;
}

async function refreshAccessToken(user) {
  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: user.refresh_token,
    });
    const res = await axios.post("https://discord.com/api/oauth2/token", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const { access_token, refresh_token, expires_in } = res.data;
    await saveUser(user.user_id, access_token, refresh_token, expires_in, user.username);
    return access_token;
  } catch (err) {
    console.error(`❌ Błąd odświeżania tokenu dla ${user.user_id}:`, err.message);
    return null;
  }
}

// ─── DISCORD CLIENT ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName("weryfikacja")
    .setDescription("Wyślij embed weryfikacji na kanał")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("transfer")
    .setDescription("Przenieś zweryfikowanych użytkowników na inny serwer")
    .addStringOption((opt) =>
      opt.setName("guild_id").setDescription("ID serwera docelowego").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("ilosc")
        .setDescription("Ilu użytkowników przenieść (wpisz 'wszyscy' lub liczbę)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((cmd) => cmd.toJSON());

// ─── REGISTER COMMANDS ────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("✅ Komendy slash zarejestrowane globalnie");
  } catch (err) {
    console.error("❌ Błąd rejestracji komend:", err);
  }
}

// ─── BUILD VERIFY EMBED ───────────────────────────────────────────────────────
function buildVerifyEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("💜 RAVEN EXCHANGE × Weryfikacja")
    .setDescription(
      "Aby uzyskać dostęp do serwera, musisz przejść weryfikację.\nKliknij przycisk poniżej i się zweryfikuj!"
    )
    .setThumbnail("https://i.imgur.com/a_5b3a74fd60ac5238aae2ebedbabd55a6.gif") // kot
    .setImage("attachment://logo.png") // Raven Exchange logo jeśli masz plik, lub usuń tę linię
    .setColor(0x7b2fff)
    .setFooter({ text: "RAVEN EXCHANGE © 2026" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("✅ Zweryfikuj się")
      .setStyle(ButtonStyle.Link)
      .setURL(
        `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
          REDIRECT_URI
        )}&response_type=code&scope=identify%20guilds.join`
      )
  );

  return { embed, row };
}

// ─── BOT READY ────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Bot zalogowany jako ${client.user.tag}`);
  await registerCommands();
  await initDB();
});

// ─── INTERACTION HANDLER ─────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // /weryfikacja
  if (interaction.commandName === "weryfikacja") {
    await interaction.deferReply({ ephemeral: true });

    const channel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return interaction.editReply("❌ Nie znalazłem kanału weryfikacji.");
    }

    const { embed, row } = buildVerifyEmbed();
    await channel.send({ embeds: [embed], components: [row] });
    await interaction.editReply("✅ Embed weryfikacji wysłany!");
  }

  // /transfer
  if (interaction.commandName === "transfer") {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.options.getString("guild_id");
    const iloscRaw = interaction.options.getString("ilosc").toLowerCase();

    let users;
    if (iloscRaw === "wszyscy") {
      users = await getUsers();
    } else {
      const num = parseInt(iloscRaw);
      if (isNaN(num) || num <= 0) {
        return interaction.editReply("❌ Podaj liczbę lub 'wszyscy'.");
      }
      users = await getUsers(num);
    }

    if (users.length === 0) {
      return interaction.editReply("❌ Brak zweryfikowanych użytkowników w bazie.");
    }

    await interaction.editReply(
      `⏳ Rozpoczynam transfer ${users.length} użytkowników na serwer \`${guildId}\`...`
    );

    let sukces = 0;
    let bledy = 0;

    for (const user of users) {
      try {
        let token = user.access_token;

        // Odśwież token jeśli wygasł
        if (Date.now() > user.expires_at - 60000) {
          token = await refreshAccessToken(user);
          if (!token) {
            bledy++;
            continue;
          }
        }

        await axios.put(
          `https://discord.com/api/v10/guilds/${guildId}/members/${user.user_id}`,
          { access_token: token },
          {
            headers: {
              Authorization: `Bot ${TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );

        sukces++;
        // Małe opóźnienie żeby nie bić w rate limit
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`❌ Transfer błąd dla ${user.user_id}:`, err.response?.data || err.message);
        bledy++;
      }
    }

    // Wyślij podsumowanie na kanał weryfikacji
    const logChannel = await client.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle("🐦 RAVEN EXCHANGE × Transfer zakończony")
        .addFields(
          { name: "Serwer docelowy", value: `\`${guildId}\``, inline: true },
          { name: "✅ Sukces", value: `${sukces}`, inline: true },
          { name: "❌ Błędy", value: `${bledy}`, inline: true }
        )
        .setColor(sukces > 0 ? 0x00ff88 : 0xff4444)
        .setTimestamp();
      await logChannel.send({ embeds: [logEmbed] });
    }

    await interaction.editReply(
      `✅ Transfer zakończony!\n✅ Sukces: **${sukces}**\n❌ Błędy: **${bledy}**`
    );
  }
});

// ─── EXPRESS SERVER (OAuth2 callback) ────────────────────────────────────────
const app = express();

app.get("/", (req, res) => {
  res.send("🐦 Raven Exchange Bot działa!");
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Brak kodu autoryzacji.");

  try {
    // Wymień kod na token
    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    // Pobierz dane użytkownika
    const userRes = await axios.get("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id, username } = userRes.data;

    // Zapisz do bazy
    await saveUser(id, access_token, refresh_token, expires_in, username);

    console.log(`✅ Nowy użytkownik zweryfikowany: ${username} (${id})`);

    // Ładna strona potwierdzenia
    res.send(`
      <!DOCTYPE html>
      <html lang="pl">
      <head>
        <meta charset="UTF-8">
        <title>Raven Exchange – Weryfikacja</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: #0e0b1a;
            color: #fff;
            font-family: 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
          }
          .card {
            background: #1a1030;
            border: 1px solid #7b2fff44;
            border-radius: 16px;
            padding: 48px 40px;
            max-width: 420px;
            box-shadow: 0 0 40px #7b2fff33;
          }
          h1 { font-size: 1.8rem; color: #a855f7; margin-bottom: 12px; }
          p { color: #ccc; line-height: 1.6; }
          .check { font-size: 3rem; margin-bottom: 20px; }
          .user { color: #fff; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check">✅</div>
          <h1>Weryfikacja udana!</h1>
          <p>Witaj, <span class="user">${username}</span>!<br>
          Twoje konto zostało pomyślnie zweryfikowane w<br>
          <strong style="color:#a855f7">RAVEN EXCHANGE</strong>.<br><br>
          Możesz wrócić na serwer Discord. 🐦</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Błąd OAuth2 callback:", err.response?.data || err.message);
    res.status(500).send("❌ Błąd weryfikacji. Spróbuj ponownie.");
  }
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌐 Express działa na porcie ${PORT}`);
});

client.login(TOKEN);
