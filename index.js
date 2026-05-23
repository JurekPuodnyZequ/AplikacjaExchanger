const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

// ─── GLOBALNA KONFIGURACJA ────────────────────────────────────────────────────
const GLOBAL = {
  logChannelId:     "1505788742445563946",
  ticketCategoryId: "1505521873621094422",
  sellerUserId:     "1215343846003576872",
  logoUrl:          "https://i.imgur.com/XF9hEnD.png",
};

// ─── KONFIGURACJA GIER ────────────────────────────────────────────────────────
// Każda gra: id kanału, nazwa, cena, kolor, obrazek, opis zawartości, czy ma DLC
const GAMES = [
  {
    id:        "forza6",
    channelId: "1507722248755089438",
    name:      "Forza Horizon 6",
    edition:   "Forza Horizon 6 Deluxe – Zakup",
    price:     "14 zł",
    color:     0x1b6fc8,
    image:     "https://i.imgur.com/tA2sq1h.jpeg",
    features: [
      "Pełną wersję gry + **wszystkie DLC** (Premium)",
      "Dostęp grania **Online** ze znajomymi",
      "**Dodatkowe** auta na start gry",
      "Gra w twojej bibliotece **Steam** oraz w aplikacji **XBOX**",
    ],
    howItWorks: "Dostajesz od nas pełny poradnik jak możesz taką forzę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)",
  },
  {
    id:        "forza5",
    channelId: "1507768369414406175",
    name:      "Forza Horizon 5",
    edition:   "Forza Horizon 5 Premium – Zakup",
    price:     "11 zł",
    color:     0xe87c1e,
    image:     "https://i.imgur.com/uiWJ7rs.jpeg",
    features: [
      "Pełną wersję gry + **wszystkie DLC** (Premium)",
      "Dostęp grania **Online** ze znajomymi",
      "**Dodatkowe** auta na start gry",
      "Gra w twojej bibliotece **Steam** oraz w aplikacji **XBOX**",
    ],
    howItWorks: "Dostajesz od nas pełny poradnik jak możesz taką forzę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)",
  },
  {
    id:        "subnautica2",
    channelId: "1507762318908592279",
    name:      "Subnautica 2",
    edition:   "Subnautica 2 – Zakup",
    price:     "12 zł",
    color:     0x0097e6,
    image:     "https://i.imgur.com/Wsc6GyM.jpeg",
    features: [
      "Pełną wersję gry (Early Access)",
      "Dostęp grania **Online** w trybie co-op do 4 graczy",
      "Gra w twojej bibliotece **Steam**",
    ],
    howItWorks: "Dostajesz od nas pełny poradnik jak możesz tę grę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)",
  },
  {
    id:        "subnautica1",
    channelId: "1507765235585646823",
    name:      "Subnautica",
    edition:   "Subnautica – Zakup",
    price:     "6 zł",
    color:     0x0097e6,
    image:     "https://i.imgur.com/UHAJJS5.jpeg",
    features: [
      "Pełną wersję gry",
      "Gra w twojej bibliotece **Steam**",
    ],
    howItWorks: "Dostajesz od nas pełny poradnik jak możesz tę grę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)",
  },
  {
    id:        "farming25",
    channelId: "1507769675583590420",
    name:      "Farming Simulator 25",
    edition:   "Farming Simulator 25 – Zakup",
    price:     "11 zł",
    color:     0x44bd32,
    image:     "https://i.imgur.com/goetDxx.png",
    features: [
      "Pełną wersję gry",
      "Dostęp grania **Online** w trybie multiplayer",
      "Gra w twojej bibliotece **Steam**",
    ],
    howItWorks: "Dostajesz od nas pełny poradnik jak możesz tę grę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)",
  },
  {
    id:        "schedule1",
    channelId: "1507765441953661089",
    name:      "Schedule 1",
    edition:   "Schedule 1 – Zakup",
    price:     "8 zł",
    color:     0x8c7ae6,
    image:     "https://i.imgur.com/cCdZKms.jpeg",
    features: [
      "Pełną wersję gry",
      "Gra w twojej bibliotece **Steam**",
    ],
    howItWorks: "Dostajesz od nas pełny poradnik jak możesz tę grę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)",
  },
  {
    id:        "sons",
    channelId: "1507763522573045790",
    name:      "Sons of the Forest",
    edition:   "Sons of the Forest – Zakup",
    price:     "8 zł",
    color:     0x273c75,
    image:     "https://i.imgur.com/YZbHBsA.jpeg",
    features: [
      "Pełną wersję gry",
      "Dostęp grania **Online** w trybie co-op do 8 graczy",
      "Gra w twojej bibliotece **Steam**",
    ],
    howItWorks: "Dostajesz od nas pełny poradnik jak możesz tę grę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)",
  },
];

// ─── METODY PŁATNOŚCI (wspólne) ───────────────────────────────────────────────
const PAYMENTS =
  `**Przyjmujemy:**\n` +
  `> Kod BLIK — \`10%\` prowizji\n` +
  `> BLIK na numer telefonu — \`0%\` prowizji\n` +
  `> PSC z paragonem — \`13%\` prowizji\n` +
  `> PSC bez paragonu — \`20%\` prowizji\n` +
  `> MyPSC — \`25%\` prowizji\n` +
  `> LTC (Litecoin) — \`0%\` prowizji\n` +
  `> BTC (Bitcoin) — \`0%\` prowizji\n` +
  `> USDT — \`0%\` prowizji\n` +
  `> USDC — \`0%\` prowizji\n` +
  `> ETH (Ethereum) — \`0%\` prowizji\n` +
  `> PayPal — \`13%\` prowizji`;

// ─── START ────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
  for (const game of GAMES) {
    await sendGameEmbeds(game);
  }
});

// ─── WYSYŁANIE EMBEDÓW DLA JEDNEJ GRY ────────────────────────────────────────
async function sendGameEmbeds(game) {
  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) {
    console.error(`❌ Nie znaleziono kanału dla ${game.name} (${game.channelId})`);
    return;
  }

  // Nie duplikuj po restarcie
  const messages = await channel.messages.fetch({ limit: 10 });
  const alreadySent = messages.some((m) => m.author.id === client.user.id && m.embeds.length > 0);
  if (alreadySent) {
    console.log(`ℹ️ ${game.name} – embedy już wysłane, pomijam.`);
    return;
  }

  // Embed produktu
  const featuresText = game.features.map((f) => `• ${f}`).join("\n");
  const productEmbed = new EmbedBuilder()
    .setTitle(game.edition)
    .setDescription(
      `**Kupując od nas dostajesz:**\n` +
      `${featuresText}\n\n` +
      `**Jak to działa?**\n` +
      `${game.howItWorks}\n\n` +
      `**💰 Cena: \`${game.price}\`**\n\n` +
      `**🎟️ JAK OD NAS ZAKUPIĆ?**\n` +
      `Tworząc ticket na kanale w kategorii zakup.\n\n` +
      PAYMENTS
    )
    .setImage(game.image)
    .setColor(game.color);

  await channel.send({ embeds: [productEmbed] });

  // Embed z przyciskiem ticketu
  const ticketEmbed = new EmbedBuilder()
    .setTitle(`🎮 Tickety Zakup – ${game.name}`)
    .setDescription(
      `Kliknij przycisk poniżej, aby otworzyć ticket i zakupić **${game.name}**.\n\n` +
      `> 🔒 Jedyną osobą upoważnioną do sprzedaży gier Steam jest <@${GLOBAL.sellerUserId}>.\n\n` +
      `Po otwarciu ticketu skontaktuje się z Tobą sprzedawca.`
    )
    .setColor(game.color)
    .setThumbnail(GLOBAL.logoUrl)
    .setFooter({ text: "System Ticketów • Zakup Steam", iconURL: GLOBAL.logoUrl })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`open_ticket:${game.id}`)
      .setLabel("🎟️ Otwórz Ticket")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [ticketEmbed], components: [row] });
  console.log(`✅ ${game.name} – embedy wysłane.`);
}

// ─── OBSŁUGA INTERAKCJI ───────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith("open_ticket:")) {
    const gameId = interaction.customId.split(":")[1];
    const game = GAMES.find((g) => g.id === gameId);
    if (game) await handleOpenTicket(interaction, game);
  }

  if (interaction.customId === "close_ticket") {
    await handleCloseTicket(interaction);
  }
});

// ─── OTWIERANIE TICKETU ───────────────────────────────────────────────────────
async function handleOpenTicket(interaction, game) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const user = interaction.user;
  const safeName = user.username.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20);
  const ticketName = `${game.id}-${safeName}`;

  // Sprawdź czy użytkownik ma już otwarty ticket dla tej gry
  const existing = guild.channels.cache.find(
    (c) => c.name === ticketName && c.parentId === GLOBAL.ticketCategoryId
  );
  if (existing) {
    return interaction.editReply({ content: `❌ Masz już otwarty ticket dla tej gry: ${existing}` });
  }

  const ticketChannel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: GLOBAL.ticketCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone,    deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id,                 allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: GLOBAL.sellerUserId,     allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      { id: client.user.id,          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });

  const ticketEmbed = new EmbedBuilder()
    .setTitle(`🎟️ Ticket – ${game.name}`)
    .setDescription(
      `Cześć ${user}! Dziękujemy za zainteresowanie zakupem **${game.name}**.\n\n` +
      `> 🛒 Jedyną osobą upoważnioną do sprzedaży gier Steam jest <@${GLOBAL.sellerUserId}>.\n\n` +
      `**💰 Cena: \`${game.price}\`**\n\n` +
      `Sprzedawca odezwie się do Ciebie wkrótce. Proszę czekać cierpliwie.\n\n` +
      `Aby zamknąć ticket, kliknij przycisk poniżej.`
    )
    .setColor(game.color)
    .setThumbnail(GLOBAL.logoUrl)
    .setFooter({ text: "System Ticketów • Zakup Steam", iconURL: GLOBAL.logoUrl })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("🔒 Zamknij Ticket")
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: `<@${user.id}> <@${GLOBAL.sellerUserId}>`,
    embeds: [ticketEmbed],
    components: [closeRow],
  });

  await sendLog(guild, {
    action: "📂 Ticket Otwarty",
    color: 0x57f287,
    user,
    channel: ticketChannel,
    extra: `Gra: **${game.name}** • Cena: \`${game.price}\``,
  });

  await interaction.editReply({ content: `✅ Twój ticket został otwarty: ${ticketChannel}` });
}

// ─── ZAMYKANIE TICKETU ────────────────────────────────────────────────────────
async function handleCloseTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel;
  const user = interaction.user;
  const guild = interaction.guild;

  await sendLog(guild, {
    action: "🔒 Ticket Zamknięty",
    color: 0xed4245,
    user,
    channel,
    extra: `Zamknięty przez <@${user.id}>`,
  });

  await interaction.editReply({ content: "🔒 Ticket zostanie zamknięty za 5 sekund..." });

  setTimeout(async () => {
    await channel.delete().catch(() => null);
  }, 5000);
}

// ─── LOGI ─────────────────────────────────────────────────────────────────────
async function sendLog(guild, { action, color, user, channel, extra }) {
  const logChannel = await guild.channels.fetch(GLOBAL.logChannelId).catch(() => null);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(action)
    .addFields(
      { name: "👤 Użytkownik", value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: "📁 Kanał",      value: `${channel}`,                   inline: true },
      ...(extra ? [{ name: "ℹ️ Info", value: extra }] : [])
    )
    .setColor(color)
    .setThumbnail(GLOBAL.logoUrl)
    .setFooter({ text: "System Ticketów • Logi", iconURL: GLOBAL.logoUrl })
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
