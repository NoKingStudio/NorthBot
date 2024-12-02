const { app, BrowserWindow, ipcMain } = require('electron');
const { Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Créer une fenêtre Electron
let win;
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
});

bot.commands = new Collection();

// Charger les commandes depuis le dossier "commands"
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  bot.commands.set(command.data.name, command);
}

// Charger les événements depuis le dossier "events"
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(path.join(__dirname, 'events', file));
  if (event.once) {
    bot.once(event.name, (...args) => event.execute(bot, ...args));
  } else {
    bot.on(event.name, (...args) => event.execute(bot, ...args));
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: `./img/logo2.ico`
  });

  win.setMenu(null)
  win.loadFile('./views/index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Fonction pour se connecter au bot
ipcMain.handle('connect-bot', async (event, token) => {
  try {
    await bot.login(token);
    return {
      success: true,
      botInfo: {
        username: bot.user.username,
        id: bot.user.id,
        avatarURL: bot.user.displayAvatarURL(),
        guildsCount: bot.guilds.cache.size,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// Enregistrer les commandes slash auprès de Discord API lorsque le bot est prêt
bot.on('ready', async () => {
  const data = bot.commands.map(command => command.data.toJSON());

  try {
    // Enregistrer les commandes globalement
    await bot.application.commands.set(data);
    console.log('Commandes slash enregistrees avec succes!');
  } catch (error) {
    console.error('Erreur lors de l\'enregistrement des commandes slash:', error);
  }
});

const logFilePath = path.join(__dirname, './data/logChannel.json');

bot.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = bot.commands.get(interaction.commandName);
  if (!command) return;

  try {
    // Exécution de la commande
    await command.execute(interaction);

    // Vérification si les logs sont activés pour ce serveur
    if (fs.existsSync(logFilePath)) {
      const logData = JSON.parse(fs.readFileSync(logFilePath));

      // Si les logs sont activés pour ce serveur
      if (logData[interaction.guild.id] && logData[interaction.guild.id].enabled) {
        const logChannelId = logData[interaction.guild.id].channelId;

        if (logChannelId) {
          const logChannel = interaction.guild.channels.cache.get(logChannelId);

          if (logChannel) {
            const embed = new EmbedBuilder()
              .setColor('Yellow')
              .setTitle('📜 Commande exécutée')
              .setDescription(`**Commande :** ${interaction.commandName}\n**Utilisateur :** ${interaction.user.tag}`)
              .addFields(
                { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                { name: 'Serveur', value: interaction.guild.name, inline: true },
                { name: 'Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>` } // Format de la date
              )
              .setFooter({
                text: `Exécutée par ${interaction.user.tag}`,
                iconURL: interaction.user.avatarURL({ dynamic: true }),
              })
              .setTimestamp();

            await logChannel.send({ embeds: [embed] });
          }
        }
      }
    }
  } catch (error) {
    console.error(error);

    // Gestion des erreurs
    await interaction.reply({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande!', ephemeral: true });
  }
});

// Gestionnaire pour enregistrer la couleur dans un fichier JSON
ipcMain.on('save-color', (event, color) => {
  // Utiliser __dirname pour obtenir le chemin absolu du répertoire de l'application
  const dataDir = path.join(__dirname, 'data');
  const colorFilePath = path.join(dataDir, 'color.json');

  // Vérifier si le dossier 'data' existe, sinon le créer
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // Vérifier si le fichier 'color.json' existe, sinon le créer avec des données vides
  if (!fs.existsSync(colorFilePath)) {
    fs.writeFileSync(colorFilePath, JSON.stringify({}, null, 2), 'utf-8');
  }

  // Préparer les données de couleur
  const colorData = { selectedColor: color };

  // Écrire la couleur dans le fichier JSON
  try {
    fs.writeFileSync(colorFilePath, JSON.stringify(colorData, null, 2), 'utf-8');
    console.log('Couleur enregistrée:', color);
  } catch (error) {
    console.error('Erreur lors de l\'écriture dans le fichier:', error);
  }
});