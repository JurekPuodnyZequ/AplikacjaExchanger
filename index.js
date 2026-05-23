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

// ─── KONFIGURACJA ────────────────────────────────────────────────────────────
const CONFIG = {
  ticketChannelId: "1507722248755089438",   // kanał z embedem do tworzenia ticketów
  logChannelId: "1505788742445563946",       // kanał logów
  ticketCategoryId: "1505521873621094422",   // kategoria ticketów
  sellerUserId: "1215343846003576872",       // jedyna osoba upoważniona do sprzedaży
  logoUrl: "https://i.imgur.com/XF9hEnD.png",
  gameName: "Forza Horizon 6",
};
// ─────────────────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`✅ Zalogowano jako ${client.user.tag}`);
  await sendTicketEmbed();
});

// ── Wysyła embedy na kanał ticketów ──────────────────────────────────────────
async function sendTicketEmbed() {
  const channel = await client.channels.fetch(CONFIG.ticketChannelId).catch(() => null);
  if (!channel) return console.error("❌ Nie znaleziono kanału ticketów.");

  // Sprawdź czy embedy już istnieją (żeby nie duplikować po restarcie)
  const messages = await channel.messages.fetch({ limit: 10 });
  const alreadySent = messages.some((m) => m.author.id === client.user.id && m.embeds.length > 0);
  if (alreadySent) return console.log("ℹ️ Embedy już wysłane, pomijam.");

  // ── Embed 1: Informacje o produkcie ────────────────────────────────────────
  const productEmbed = new EmbedBuilder()
    .setTitle("Forza Horizon 6 Deluxe – Zakup")
    .setDescription(
      `**Kupując od nas Forze dostajesz:**\n` +
      `• Pełną wersję gry + **wszystkie DLC** (Premium)\n` +
      `• Dostęp grania **Online** ze znajomymi\n` +
      `• **Dodatkowe** auta na start gry\n` +
      `• Gra w twojej bibliotece **Steam** oraz w aplikacji **XBOX**\n\n` +

      `**Jak to działa?**\n` +
      `Dostajesz od nas pełny poradnik jak możesz taką forzę u siebie odblokować na koncie (nie żądamy od ciebie żadnych informacji dotyczących k0nta)\n\n` +

      `**💰 Cena: \`13 zł\`**\n\n` +

      `**<:ticket:1234567890> JAK OD NAS ZAKUPIĆ?**\n` +
      `Tworząc ticket na kanale w kategorii zakup.\n\n` +

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
      `> PayPal — \`13%\` prowizji`
    )
    .setImage("https://i.imgur.com/tA2sq1h.jpeg")
    .setColor(0x5b2d8e);

  await channel.send({ embeds: [productEmbed] });

  // ── Embed 2: Przycisk do tworzenia ticketu ──────────────────────────────────
  const ticketEmbed = new EmbedBuilder()
    .setTitle("🎮 Tickety Zakup Forza Horizon 6")
    .setDescription(
      `Kliknij przycisk poniżej, aby otworzyć ticket i zakupić **${CONFIG.gameName}**.\n\n` +
      `> 🔒 Jedyną osobą upoważnioną do sprzedaży gier Steam jest <@${CONFIG.sellerUserId}>.\n\n` +
      `Po otwarciu ticketu skontaktuje się z Tobą sprzedawca.`
    )
    .setColor(0x1b6fc8)
    .setThumbnail(CONFIG.logoUrl)
    .setFooter({ text: "System Ticketów • Zakup Steam", iconURL: CONFIG.logoUrl })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("🎟️ Otwórz Ticket")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [ticketEmbed], components: [row] });
  console.log("✅ Embedy wysłane.");
}

// ── Obsługa interakcji (przyciski) ───────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "open_ticket") await handleOpenTicket(interaction);
  if (interaction.customId === "close_ticket") await handleCloseTicket(interaction);
});

// ── Otwieranie ticketu ───────────────────────────────────────────────────────
async function handleOpenTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;
  const user = interaction.user;

  // Sprawdź czy użytkownik ma już otwarty ticket
  const existing = guild.channels.cache.find(
    (c) => c.name === `ticket-${user.username.toLowerCase().replace(/\s+/g, "-")}` && c.parentId === CONFIG.ticketCategoryId
  );
  if (existing) {
    return interaction.editReply({ content: `❌ Masz już otwarty ticket: ${existing}` });
  }

  // Utwórz kanał ticketu
  const ticketChannel = await guild.channels.create({
    name: `ticket-${user.username.toLowerCase().replace(/\s+/g, "-")}`,
    type: ChannelType.GuildText,
    parent: CONFIG.ticketCategoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: CONFIG.sellerUserId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
      },
      {
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
      },
    ],
  });

  // Embed w tickecie
  const ticketEmbed = new EmbedBuilder()
    .setTitle(`🎟️ Ticket – ${CONFIG.gameName}`)
    .setDescription(
      `Cześć ${user}! Dziękujemy za zainteresowanie zakupem **${CONFIG.gameName}**.\n\n` +
      `> 🛒 Jedyną osobą upoważnioną do sprzedaży gier Steam jest <@${CONFIG.sellerUserId}>.\n\n` +
      `Sprzedawca odezwie się do Ciebie wkrótce. Proszę czekać cierpliwie.\n\n` +
      `Aby zamknąć ticket, kliknij przycisk poniżej.`
    )
    .setColor(0x57f287)
    .setThumbnail(CONFIG.logoUrl)
    .setFooter({ text: "System Ticketów • Zakup Steam", iconURL: CONFIG.logoUrl })
    .setTimestamp();

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("close_ticket")
      .setLabel("🔒 Zamknij Ticket")
      .setStyle(ButtonStyle.Danger)
  );

  await ticketChannel.send({
    content: `<@${user.id}> <@${CONFIG.sellerUserId}>`,
    embeds: [ticketEmbed],
    components: [closeRow],
  });

  // Log otwarcia
  await sendLog(guild, {
    action: "📂 Ticket Otwarty",
    color: 0x57f287,
    user,
    channel: ticketChannel,
  });

  await interaction.editReply({ content: `✅ Twój ticket został otwarty: ${ticketChannel}` });
}

// ── Zamykanie ticketu ────────────────────────────────────────────────────────
async function handleCloseTicket(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel;
  const user = interaction.user;
  const guild = interaction.guild;

  // Log zamknięcia przed usunięciem kanału
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

// ── Wysyłanie logów ──────────────────────────────────────────────────────────
async function sendLog(guild, { action, color, user, channel, extra }) {
  const logChannel = await guild.channels.fetch(CONFIG.logChannelId).catch(() => null);
  if (!logChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(action)
    .addFields(
      { name: "👤 Użytkownik", value: `<@${user.id}> (${user.tag})`, inline: true },
      { name: "📁 Kanał", value: `${channel}`, inline: true },
      ...(extra ? [{ name: "ℹ️ Info", value: extra }] : [])
    )
    .setColor(color)
    .setThumbnail(CONFIG.logoUrl)
    .setFooter({ text: "System Ticketów • Logi", iconURL: CONFIG.logoUrl })
    .setTimestamp();

  await logChannel.send({ embeds: [embed] });
}

// ── Start ─────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
