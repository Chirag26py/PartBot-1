// Updated version of Ecuacion's connection.

const util = require('util');
const https = require('https');
const url = require('url');
const EventEmitter = require('events');
const WebSocketClient = require('websocket').client;

function toID (text) {
	if (typeof text !== 'string') return text;
	return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

class Client extends EventEmitter {
	constructor (server, port, opts) {
		super();
		this.opts = {
			server: server,
			serverid: 'showdown',
			port: port,
			secprotocols: [],
			connectionTimeout: 2 * 60 * 1000,
			loginServer: 'https:\/\/play.pokemonshowdown.com/~~showdown/action.php',
			nickName: null,
			pass: null,
			avatar: null,
			status: null,
			retryLogin: 4 * 1000,
			autoConnect: true,
			autoReconnect: true,
			autoReconnectDelay: 5 * 1000,
			autoJoin: [],
			showErrors: true,
			debug: false
		}
		if (typeof opts === 'object') {
			for (let i in opts) this.opts[i] = opts[i];
		}
		this.actionUrl = url.parse(this.opts.loginServer);

		this._queued = [];

		this.app = opts.app;
		this.keys = {};
		this.pageData = {};
	
		this.rooms = {};
		this.battleRooms = {};

		this.streams = {};

		[].forEach(room => {
			this.streams[room] = fs.createWriteStream(`./data/LOGS/${room}.txt`, {flags: 'a'});
		});

		this.jps = {};
		this.jpcool = {};
		fs.readdir('./data/JPS', (err, files) => {
			if (err) return console.log(err);
			files.forEach(room => {
				fs.readFile(`./data/JPS/${room}`, 'utf8', (e, file) => {
					if (e) return console.log(e);
					this.jps[room.substr(0, room.length - 5)] = JSON.parse(file);
				});
			});
		});

		this.auth = Object.assign({}, config.auth);
	
		this.connection = null;
		this.status = {
			connected: false,
			nickName: null
		}
		this.challstr = {
			id: 0,
			str: ''
		}
		this.events = {};
		this.debug = function (str) {
			if (this.opts.debug) console.log("DEBUG: " + str);
		}
		this.error = function (str) {
			if (this.opts.showErrors) console.log("ERROR: " + str);
		}
		this.getRooms = function (user) {
			user = toID(user);
			let out;
			try {
				return out = Object.keys(this.rooms).filter(room => this.rooms[room].users.find(u => toID(u) === user));
			} catch (e) {
				if (e) return out = [];
			}
			return out;
		}
	}
}
	
Client.prototype.init = function () {
	if (this.opts.autoConnect) {
		this.connect();
	}
	if (this.opts.connectionTimeout) {
		this.startConnectionTimeOut();
	}
}

Client.prototype.serve = function (user, html) {
	let id = toID(user);
	if (!this.keys[id]) this.keys[id] = 7000 + Math.floor(Math.random() * 93000);
	this.pageData[id] = html;
	return this.pm(user, `${websiteLink}/user/${id}/${this.keys[id]}`);
}

Client.prototype.sendHTML = function (user, html) {
	let cRooms = this.getRooms(user);
	for (let room of cRooms) {
		if (this.rooms[room] && ['*', '#', '&', '~', '★'].includes(this.rooms[room].rank)) return this.say(room, `/pminfobox ${user}, ${html.replace(/\n/g, '')}`);
	}
	if (!this.keys) return undefined;
	let id = toID(user);
	if (!this.keys[id]) this.keys[id] = 7000 + Math.floor(Math.random() * 93000);
	return this.serve(user, html);
}


/********************************
* Connection
*********************************/

Client.prototype.connect = function (retry) {
	if (retry) {
		this.debug('Retrying...');
	}
	if (this.status.connected) return this.error("Already connected");
	this.closed = false;
	const webSocket = new WebSocketClient({maxReceivedFrameSize: 104857600});
	this.webSocket = webSocket;
	var self = this;
	self.rooms = {};
	self.roomcount = 0;
	webSocket.on('connectFailed', function(err) {
		self.error("Could not connect to server " + self.opts.server + ": " + util.inspect(err));
		self.emit('disconnect', err);
		if (self.opts.autoReconnect) {
			self.debug("Retrying in " + (self.opts.autoReconnectDelay / 1000) + " seconds");
			setTimeout(function() {
				self.connect(true);
			}, self.opts.autoReconnectDelay);
		}
	});
	webSocket.on('connect', function(connection) {
		self.emit('connect', connection);
		self.debug('Connected to server: ' + self.opts.server);
		self.status.connected = true;
		self.connection = connection;
		self._spacer = setInterval(() => {
			self.send(self._queued.splice(0, 3));
		}, 320);
		connection.on('error', function(err) {
			self.error('Connection error: ' + util.inspect(err));
			self.connection = null;
			self.status.connected = false;
			self.emit('disconnect', err);
			if (self.opts.autoReconnect) {
				self.debug("Retrying in " + (self.opts.autoReconnectDelay / 1000) + " seconds.");
				setTimeout(function() {
					self.connect(true);
				}, self.opts.autoReconnectDelay);
			}
		});
		connection.on('close', function() {
			self.debug('Connection closed: ' + util.inspect(arguments));
			self.connection = null;
			self.status.connected = false;
			self.emit('disconnect', 0);
			clearInterval(self._spacer);
			if (!self.closed && self.opts.autoReconnect) {
				self.debug("Retrying in " + (self.opts.autoReconnectDelay / 1000) + " seconds.");
				setTimeout(function() {
					self.connect(true);
				}, self.opts.autoReconnectDelay);
			}
		});
		connection.on('message', function(message) {
			if (message.type === 'utf8') {
				if (self.events['message'] && typeof self.events['message'] === 'function') {
					self.events['message'](message.utf8Data);
				}
				self.receive(message.utf8Data);
			}
		});
	});
	let id = ~~(Math.random() * 900) + 100;
	let chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
	let str = '';
	for (let i = 0, l = chars.length; i < 8; i++) {
		str += chars.charAt(~~(Math.random() * l));
	}
	let conStr = 'ws://' + self.opts.server + ':' + self.opts.port + '/showdown/' + id + '/' + str + '/websocket';
	self.debug('connecting to ' + conStr + ' - secondary protocols: ' + util.inspect(self.opts.secprotocols));
	webSocket.connect(conStr, self.opts.secprotocols);
}

Client.prototype.disconnect = function () {
	this.closed = true;
	if (this.connection) this.connection.close();
}

Client.prototype.softDisconnect = function () {
	if (this.connection) this.connection.close();
}

/********************************
* Login
*********************************/

Client.prototype.rename = function (nick, pass) {
	const requestOptions = {
		hostname: this.actionUrl.hostname,
		port: this.actionUrl.port,
		path: this.actionUrl.pathname,
		agent: false
	}
	if (!pass) {
		requestOptions.method = 'GET';
		requestOptions.path += '?act=getassertion&userid=' + toID(nick) + '&challengekeyid=' + this.challstr.id + '&challenge=' + this.challstr.str;
		this.debug("Sending login request to: " + requestOptions.path);
	} else {
		requestOptions.method = 'POST';
		var data = 'act=login&name=' + toID(nick) + '&pass=' + pass + '&challengekeyid=' + this.challstr.id + '&challenge=' + this.challstr.str;
		requestOptions.headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': data.length
		}
		this.debug("Sending log in request to: " + requestOptions.path + " | Data -> " + data);
	}
	var req = https.request(requestOptions, function(res) {
		res.setEncoding('utf8');
		var data = '';
		res.on('data', function(chunk) {
			data += chunk;
		});
		res.on('end', function() {
			if (data === ';') {
				this.error('failed to log in; nick is registered - invalid or no password given');
				if (this.events['renamefailure'] && typeof this.events['renamefailure'] === 'function') {
					this.events['renamefailure'](-1);
				}
				return;
			}
			if (data.length < 50) {
				this.error('failed to log in: ' + data);
				if (this.opts.retryLogin) {
					this.debug("Retrying log in process in " + (this.opts.retryLogin / 1000) + " seconds...");
					setTimeout(function() {this.rename(nick, pass);}.bind(this), this.opts.retryLogin);
				}
				if (this.events['renamefailure'] && typeof this.events['renamefailure'] === 'function') {
					this.events['renamefailure'](-2);
				}
				return;
			}
			if (data.indexOf('heavy load') !== -1) {
				this.error('the login server is under heavy load');
				if (this.opts.retryLogin) {
					this.debug("Retrying login process in " + (this.opts.retryLogin / 1000) + " seconds...");
					setTimeout(function() {this.rename(nick, pass);}.bind(this), this.opts.retryLogin);
				}
				this.emit('renamefailure', -3);
				return;
			}
			try {
				data = JSON.parse(data.substr(1));
				if (data.actionsuccess) {
					data = data.assertion;
				} else {
					this.error('could not log in; action was not successful: ' + JSON.stringify(data));
					if (this.opts.retryLogin) {
						this.debug("Retrying log in process in " + (this.opts.retryLogin / 1000) + " seconds...");
						setTimeout(function() {this.rename(nick, pass);}.bind(this), this.opts.retryLogin);
					}
					this.emit('renamefailure', -4);
					return;
				}
			} catch (e) {}
			this.debug('Sending log in trn...');
			this.send('|/trn ' + nick + ',0,' + data);
		}.bind(this));
	}.bind(this));
	req.on('error', function(err) {
		this.error('login error: ' + util.inspect(err));
		if (this.opts.retryLogin) {
			this.debug("Retrying log in process in " + (this.opts.retryLogin / 1000) + " seconds...");
			setTimeout(function() {this.rename(nick, pass);}.bind(this), this.opts.retryLogin);
		}
		if (this.events['renamefailure'] && typeof this.events['renamefailure'] === 'function') {
			this.events['renamefailure'](err);
		}
		return;
	}.bind(this));
	if (data) {
		req.write(data);
	}
	req.end();
}

/********************************
* Sending data
*********************************/

Client.prototype.send = function (data, delay) {
	var connection = this.connection;
	var self = this;
	if (!delay) delay = 1200;
	if (connection && connection.connected) {
		if (!(data instanceof Array)) {
			data = [data.toString()];
		}
		if (data.length > 3) {
			let spacer;
			let nextToSend = function () {
				if (!data.length) {
					clearInterval(spacer);
					return;
				}
				let toSend = data.splice(0, 3);
				toSend = JSON.stringify(toSend);
				if (self.events['send'] && typeof self.events['send'] === 'function') {
					self.events['send'](toSend);
				}
				connection.send(toSend);
			}
			spacer = setInterval(nextToSend, delay);
			nextToSend();
		} else {
			data = JSON.stringify(data);
			if (self.events['send'] && typeof self.events['send'] === 'function') {
				self.events['send'](data);
			}
			connection.send(data);
		}
	} else {
		this.error("Could not send data: ERR_NOT_CONNECTED");
		if (self.events['sendfailure'] && typeof self.events['sendfailure'] === 'function') {
			self.events['sendfailure'](-1);
		}
	}
}

/*Client.prototype.sendRoom = function (room, data, delay) {
	if (!(data instanceof Array)) {
		data = [data.toString()];
	}
	for (var i = 0; i < data.length; i++) {
		data[i] = room + '|' + data[i];
	}
	this.send(data, delay);
}*/

Client.prototype.say = function (room, msg) {
	if (room.charAt(0) === ',') {
		return this.pm(room.substr(1), msg);
	}
	this._queued.push(room + '|' + msg);
}

Client.prototype.pm = function (user, msg) {
	this._queued.push('|/pm ' + user + ',' + msg);
}

Client.prototype.roomReply = function (room, user, msg) {
	this.say(room, `/sendprivatehtmlbox ${user}, ${tools.escapeHTML(msg).replace(/\n/g, '<br/>')}`);
}

Client.prototype.joinRooms = function (rooms) {
	var cmds = [];
	var room;
	for (var i = 0; i < rooms.length; i++) {
		room = rooms[i].toLowerCase();
		cmds.push('|/join ' + room);
	}
	if (cmds.length) this.send(cmds);
}

Client.prototype.setAvatar = function (avatar) {
	this._queued.push('|/avatar ' + avatar);
}

Client.prototype.setStatus = function (status) {
	this._queued.push('|/status ' + status);
}

Client.prototype.leaveRooms = function (rooms) {
	var cmds = [];
	var room;
	for (var i = 0; i < rooms.length; i++) {
		room = toID(rooms[i]);
		cmds.push('|/leave ' + room);
	}
	if (cmds.length) this._queued.push(cmds);
}

Client.prototype.log = function (thing) {
	return new Promise((resolve, reject) => {
		fs.appendFile('./logs.txt', `\n${require('util').format(thing)}`, function (e) {
			if (e) return console.log (e);
			console.log(thing);
			try {
				client.channels.cache.get('719087165241425981').send("```\n" + require('util').format(thing).substr(0, 1990) + "```").then(() => resolve());
			} catch (e) {
				console.log(e);
				resolve();
			}
		});
	});
}

/********************************
* Data reception
*********************************/

Client.prototype.receive = function (message) {
	this.lastMessage = Date.now();
	var flag = message.substr(0, 1);
	var data;
	switch (flag) {
		case 'a':
			data = JSON.parse(message.substr(1));
			if (data instanceof Array) {
				for (var i = 0; i < data.length; i++) {
					this.receiveMsg(data[i]);
				}
			} else {
				this.receiveMsg(message);
			}
			break;
	}
}

Client.prototype.receiveMsg = function (message) {
	if (!message) return;
	if (message.indexOf('\n') > -1) {
		const spl = message.split('\n');
		let room = 'lobby';
		if (spl[0].charAt(0) === '>') {
			room = spl[0].substr(1);
			if (room === '') room = 'lobby';
		}
		for (var i = 0, len = spl.length; i < len; i++) {
			if (spl[i].split('|')[1] && (spl[i].split('|')[1] === 'init')) {
				for (let j = i; j < len; j++) {
					this.receiveLine(room, spl[j], true);
				}
				break;
			} else {
				this.receiveLine(room, spl[i]);
			}
		}
	} else {
		this.receiveLine('lobby', message);
	}
}

Client.prototype.receiveLine = function (room, message, isIntro) {
	let larg = message.substr(1).split('|');
	this.emit('line', room, message, isIntro, larg);
	if (room.startsWith('battle-')) this.emit('battle', room, message, isIntro, larg);
	switch (larg[0]) {
		case 'formats':
			break;
		case 'challstr':
			this.challstr = {
				id: larg[1],
				str: larg[2]
			}
			if (this.opts.nickName) this.rename(this.opts.nickName, this.opts.pass);
			break;
		case 'updateuser':
			if (larg[1].startsWith(' Guest ')) break;
			this.status.nickName = larg[1].substr(1);
			this.log('Connected to Pokémon Showdown.');
			if (!this.opts.status) this.setStatus('say ' + this.status.nickName + '? for help.');
			else this.setStatus(this.opts.status);
			if (parseInt(larg[2])) this.joinRooms(config.autoJoin);
			if (this.opts.avatar) this.setAvatar(this.opts.avatar);
			break;
		case 'c': {
			let by = larg[1];
			let timeOff = Date.now();
			larg.splice(0, 2);
			if (isIntro) this.emit('intro', room, timeOff, by, larg.join('|'));
			else if (by.substr(1) === this.status.nickName) this.emit('chatsuccess', room, timeOff, by, larg.join('|'));
			else this.emit('chat', room, timeOff, by, larg.join('|'));
			break;
		}
		case 'c:': {
			let by = larg[2];
			let timeOff = parseInt(larg[1]) * 1000;
			larg.splice(0, 3);
			if (isIntro) this.emit('intro', room, timeOff, by, larg.join('|'));
			else if (by.substr(1) === this.status.nickName) this.emit('chatsuccess', room, timeOff, by, larg.join('|'));
			else this.emit('chat', room, timeOff, by, larg.join('|'));
			break;
		}
		case 'init':
			if (!this.rooms[room]) {
				this.rooms[room] = {rank: false, users: []};
				// if (this.baseAuth[room]) this.rooms[room].auth = Object.assign({}, this.baseAuth[room]);
				tools.loadShops(room);
				tools.loadLB(room);
				this.jpcool[room] = {};
			}
			this.send(`|/cmd roominfo ${room}`);
			this.emit('joinRoom', room);
			break;
		case 'users': {
			let args = larg[1].split(',');
			let amt = parseInt(args.shift());
			if (args.length !== amt) console.log('User initialization error: length did not match.', room);
			args.forEach(user => this.rooms[room].users.push(user));
			break;
		}
		case 'title':
			if (this.rooms[room]) this.rooms[room].title = larg[1];
			if (!room.startsWith('groupchat-') && !room.startsWith('battle-')) console.log(`Joined ${larg[1]}.`);
			break;
		case 'deinit':
			if (this.rooms[room]) {
				if (!room.startsWith('groupchat-') && !room.startsWith('battle-')) console.log(`Left ${this.rooms[room].title}.`);
				delete this.rooms[room];
			}
			break;
		case 'popup':
			this.emit('popup', larg.join('|').substr(6));
			break;
		case 'error':
			larg.splice(0, 1);
			this.emit('chaterror', room, larg.join('|'), isIntro);
			break;
		case 'popup':
			larg.splice(0, 1);
			this.emit('popup', larg.join('|'));
			break;
		case 'tour': case 'tournament':
			if (!isIntro) this.emit('tour', room, larg.slice(1, larg.length));
			break;
		case 'pm': {
			let by = larg[1];
			let dest = larg[2];
			larg.splice(0, 3);
			let pmcontent = larg.join('|');
			if (pmcontent.startsWith('/error ')) break;
			else if (by.substr(1) === this.status.nickName) this.emit('pmsuccess', dest, pmcontent);
			else this.emit('pm', by, pmcontent);
			break;
		}
		case 'queryresponse': {
			if (larg[1] === 'userdetails') {
				larg.splice(0, 2);
				this.emit('userdetails', larg.join('|'));
			}
			else {
				larg.splice(0, 1);
				this.emit('queryresponse', larg.join('|'));
			}
			break;
		}
		case 'j': case 'J': 
			if (!this.rooms[room].users.includes(larg[1])) this.rooms[room].users.push(larg[1]);
			this.emit('join', toID(larg[1]), room, Date.now());
			break;
		case 'n': case 'N': 
			let by = toID(larg[1]);
			let old = toID(larg[2]);
			this.emit('nick', by, old, room, Date.now());
			this.rooms[room].users.remove(this.rooms[room].users.find(u => toID(u) === toID(old)));
			this.rooms[room].users.push(larg[1]);
			let rank = tools.rankLevel(old);
			if (old === toID(this.status.nickName)) {
				this.rooms[room].rank = larg[1].charAt(0);
			}
			switch (rank) {
				case 10:
					if (this.auth.admin.includes(old) && !(by === old) && !this.auth.adminalts.includes(by) && !this.auth.admin.includes(by)) this.auth.adminalts.push(by);
					else if (this.auth.adminalts.includes(old)) {
						this.auth.adminalts.remove(old);
						if (!this.auth.admin.includes(by)) this.auth.adminalts.push(by);
					}
					break;
				case 9:
					if (this.auth.coder.includes(old) && !(by === old) && !this.auth.coderalts.includes(by) && !this.auth.coder.includes(by)) this.auth.coderalts.push(by);
					else if (this.auth.coderalts.includes(old)) {
						this.auth.coderalts.remove(old);
						if (!this.auth.coder.includes(by)) this.auth.coderalts.push(by);
					}
					break;
				case 5:
					if (this.auth.alpha.includes(old) && !(by === old) && !this.auth.alphaalts.includes(by) && !this.auth.alpha.includes(by)) this.auth.alphaalts.push(by);
					else if (this.auth.alphaalts.includes(old)) {
						this.auth.alphaalts.remove(old);
						if (!this.auth.alpha.includes(by)) this.auth.alphaalts.push(by);
					}
					break;
				case 4:
					if (this.auth.beta.includes(old) && !(by === old) && !this.auth.betaalts.includes(by) && !this.auth.beta.includes(by)) this.auth.betaalts.push(by);
					else if (this.auth.betaalts.includes(old)) {
						this.auth.betaalts.remove(old);
						if (!this.auth.beta.includes(by)) this.auth.betaalts.push(by);
					}
					break;
				case 3:
					if (room.startsWith('groupchat-')) return;
					if (this.auth.gamma.includes(old) && !(by === old) && !this.auth.gammaalts.includes(by) && !this.auth.gamma.includes(by)) this.auth.gammaalts.push(by);
					else if (this.auth.gammaalts.includes(old)) {
						this.auth.gammaalts.remove(old);
						if (!this.auth.gamma.includes(by)) this.auth.gammaalts.push(by);
					}
					break;
				case 1:
					if (this.auth.locked.includes(old) && !(by === old) && !this.auth.lockedalts.includes(by) && !this.auth.locked.includes(by)) this.auth.lockedalts.push(by);
					else if (this.auth.lockedalts.includes(old)) {
						this.auth.lockedalts.remove(old);
						if (!this.auth.locked.includes(by)) this.auth.lockedalts.push(by);
					}
					break;
				default:
					break;
			}
			break;
		case 'l': case 'L':
			let user = toID(larg[1]);
			this.rooms[room].users.remove(this.rooms[room].users.find(u => toID(u) === user));
			['admin', 'coder', 'alpha', 'beta', 'gamma', 'locked'].forEach(type => this.auth[type + 'alts']?.remove(user));
			this.emit('leave', user, room, Date.now());
			break;
		case 'raw': {
			larg.shift();
			this.emit('raw', room, larg.join('|'), isIntro);
			break;
		}
		case 'updatechallenges': {
			this.emit('updatechallenges', larg.slice(1).join('|'));
			break;
		}
		default: {
			this.emit('other', room, larg.join('|'));
			break;
		}
	}
}

/*********************************
*		Connection Timer					*
*********************************/

Client.prototype.startConnectionTimeOut = function () {
	let self = this;
	this.stopConnectionTimeOut();
	this.connectionTimeOutInterval = setInterval(function () {
		if (self.status.connected && self.lastMessage) {
			let t = Date.now();
			if (t - self.lastMessage > self.opts.connectionTimeout) {
				self.error("Connection timeout: " + (t - self.lastMessage));
				self.softDisconnect();
			}
		}
	}, self.opts.connectionTimeout);
}

Client.prototype.stopConnectionTimeOut = function () {
	if (this.connectionTimeOutInterval) clearInterval(this.connectionTimeOutInterval);
}

module.exports = Client;
