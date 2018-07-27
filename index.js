const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY, OWNERID } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');
const Discord = require('discord.js');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Natsuki en ligne'));

client.on('disconnect', () => console.log('Natsuki déconecter'));

client.on('reconnecting', () => console.log('Natsuki reconecté !'));

client.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'play') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send('<:error:472354132359905291> Vous devez être en vocal !');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send('Je ne peut pas me connecter dans ce vocal, vérifiez mes permissions !');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send('Je ne peut pas parler dans ce vocal, vérifiez mes permissions !');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
				await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
			}
			return msg.channel.send(`Playlist: **${playlist.title}** a était ajouter a la queue`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
__**Suggestion :**__
${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
Please provide a value to select one of the search results ranging from 1-10.
					`);
					// eslint-disable-next-line max-depth
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send('No or invalid value entered, cancelling video selection.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 Je n\'ai pas pu obtenir de résultats de recherche.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === 'skip') {
		if (!msg.member.voiceChannel) return msg.channel.send('Vous devez être dans un salon vocal pour pouvoir utilisez cette commande !');
		if (!serverQueue) return msg.channel.send('There is nothing playing that I could skip for you.');
		serverQueue.connection.dispatcher.end('La musique a bien était skip !');
		return undefined;
	} else if (command === 'help') {
		const helpembed = new Discord.RichEmbed()
		.setColor('RANDOM')
		.setTitle("**Commande help**")
		.addField("Musique",'`n!stop`, `n!play`, `n!skip`, `n!volume`, `n!np`, `n!queue`, `n!pause`, `n!resume`')
		.addField("Fun","`en dev`")
		.addField("Information","`en dev`")

		msg.channel.send(helpembed);

	} else if (command === 'stop') {
		if (!msg.member.voiceChannel) return msg.channel.send('Vous devez être dans un salon vocal pour pouvoir utilisez cette commande !');
		if (!serverQueue) return msg.channel.send('There is nothing playing that I could stop for you.');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('La musique a bien était stoppé !');
		return undefined;
	} else if (command === 'volume') { // commande vip
		if (!msg.member.voiceChannel) return msg.channel.send('Vous devez être dans un salon vocal pour pouvoir utilisez cette commande !');
		if (!serverQueue) return msg.channel.send('There is nothing playing.');
		if (!args[1]) return msg.channel.send(`Volume : **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`Volume modifier a : **${args[1]}**`);
	} else if (command === 'np') {
		if (!serverQueue) return msg.channel.send('There is nothing playing.');
		return msg.channel.send(`🎶 Musique en cours : **${serverQueue.songs[0].title}**`);
	} else if (command === 'queue') {
		if (!serverQueue) return msg.channel.send('There is nothing playing.');
		return msg.channel.send(`
__**Song queue:**__
${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
**Musique en cours :** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'pause') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('⏸ Musique mis en pause !');
		}
		return msg.channel.send('There is nothing playing.');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('▶ Musique lancé !');
		}
		return msg.channel.send('There is nothing playing.');
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`Je ne peut pas rejoindre ce salon vocal : ${error}.`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`Je ne peut pas rejoindre ce salon vocal : ${error}.`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`✅ **${song.title}** a était rajouter a la queue.`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`🎶 : **${song.title}**`);
}

client.login(process.env.TOKEN);
