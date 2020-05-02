import { OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway()
export class WebsocketGateway implements OnGatewayDisconnect {

  @WebSocketServer()
  private server: Server;

  private rooms: Map<string, Room> = new Map();
  private usersConnected: { [id: string]: Room } = {};

  @SubscribeMessage('create-room')
  createRoom(client: Socket, name: string) {
    console.log('create-room', client.id);
    const roomId = Math.random() + '';
    const room = new Room(roomId);
    room.addPlayer(client.id, name);
    client.join(roomId);
    this.usersConnected[client.id] = room;
    this.rooms.set(roomId, room);
    return new SocketResponse(true, roomId);
  }

  @SubscribeMessage('join-room')
  join(client: Socket, {roomId: roomIdToJoin, name}: { roomId: string, name: string }) {
    console.log('join-room', client.id, roomIdToJoin);
    const room = this.rooms.get(roomIdToJoin);
    if (room) {
      if (!room.isPresent(client.id)) {
        const player = room.addPlayer(client.id, name);
        client.join(room.id);
        this.usersConnected[client.id] = room;
        this.server.to(room.id).emit('player-join', new SocketResponse(true, player));
      }
      return new SocketResponse(true, room);
    } else {
      return new SocketResponse(false, roomIdToJoin + ' non trovato');
    }
  }

  @SubscribeMessage('leave-room')
  leaveRoom(client: Socket) {
    console.log('leave-room', client.id);
    const room = this.usersConnected[client.id];
    if (room) {
      this.usersConnected[client.id] = undefined;
      const master = room.master;
      const player = room.removePlayer(client.id);
      const resp: { player: PlayerInfo, master?: string } = {
        player
      };
      if (master !== room.master) {
        resp.master = room.master;
      }
      client.to(room.id).emit('player-leave', new SocketResponse(true, resp));

      if (room.players.length) {

        if (player.id === room.currentTurn) {
          this.server.to(room.id).emit('new-turn', new SocketResponse(true, room.updateNextTurn()));
        }
      } else {
        this.rooms.delete(room.id);
      }
    }
  }

  @SubscribeMessage('init-game')
  initGame(client: Socket) {
    const room = this.usersConnected[client.id];
    room.updateNextTurn();
    this.server.to(room.id).emit('go-to-start', new SocketResponse(true, room));
  }

  @SubscribeMessage('get-state')
  getState(client: Socket) {
    const room = this.usersConnected[client.id];
    if (room) {
      return new SocketResponse(true, room);
    } else {
      return new SocketResponse(false, undefined);
    }
  }

  @SubscribeMessage('set-word')
  setWord(client: Socket, word: string) {
    console.log('set-word', client.id, word);
    const room = this.usersConnected[client.id];
    room.setWord(word);
    this.server.to(room.id).emit('set-word', new SocketResponse(true, room.currentWord));
    this.server.to(room.id).emit('new-turn', new SocketResponse(true, room.updateNextTurn()));
  }

  @SubscribeMessage('new-guess')
  newGuess(client: Socket, guessKey: string) {
    console.log('new-guess', client.id, guessKey);
    const room = this.usersConnected[client.id];
    const guessInfo = room.addGuess(guessKey);

    const finishState = room.isGameFinished();
    this.server.to(room.id).emit('new-guess', new SocketResponse(true, guessInfo));
    if (!finishState) {
      this.server.to(room.id).emit('new-turn', new SocketResponse(true, room.updateNextTurn()));
    } else {
      this.server.to(room.id).emit('finish-game', new SocketResponse(true, finishState));
    }
  }

  @SubscribeMessage('restart-game')
  restartGame(client: Socket) {
    const room = this.usersConnected[client.id];
    room.resetGame();
    this.server.to(room.id).emit('restart-game', new SocketResponse(true, room));
  }

  handleDisconnect(client: Socket): any {
    this.leaveRoom(client);
  }
}

class SocketResponse<R = string> {
  constructor(
    public ok: boolean,
    public data: R
  ) {
  }
}


export type Status = string | 'lose' | null;

export interface LetterInfo {
  id: string;
  letter: string;
  isGuessed: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  points: number;
}

export interface GuessInfo {
  letter: string;
  ids: string[]; // if present are the id of the LetterInfo of which this letter is the answer
}


class Room {
  currentWord: LetterInfo[];
  guesses: string[];
  status: Status;
  errors: number;
  master: string; // The id of the player that is the game master
  currentTurn: string; // The id of the player whose has the current turn
  players: PlayerInfo[];

  constructor(
    public id: string
  ) {
    this.resetGame();
    this.players = [];
    this.master = null;
  }

  resetGame() {
    this.currentWord = [];
    this.guesses = [];
    this.status = null;
    this.errors = 0;
    this.currentTurn = null;
    if (this.master) {
      this.setNextMaster();
      this.currentTurn = this.master;
    }
  }

  setNextMaster() {
    let masterIndex = this.players.findIndex(p => p.id === this.master);
    masterIndex = (masterIndex + 1) % this.players.length;
    this.master = this.players[masterIndex].id;
  }

  isPresent(userId: string) {
    return !!this.players.find(p => p.id === userId);
  }

  addPlayer(user: string, name: string) {
    let player;
    if (!this.isPresent(user)) {
      player = {id: user, name, points: 0};
      this.players.push(player);
    } else {
      player = this.players.find(p => p.id === user);
    }
    this.updateMaster();
    return player;
  }

  removePlayer(userId: string): PlayerInfo {
    let player;
    this.players = this.players.filter(p => {
      if (p.id === userId) {
        player = p;
        return false;
      } else {
        return true;
      }
    });
    this.updateMaster();
    return player;
  }

  updateMaster() {
    if (this.players.length === 1) {
      this.master = this.players[0].id;
      return;
    }
    const players = this.players;
    if (!players.length) {
      this.master = undefined;
      return;
    }

    if (!this.master || !players.find(p => p.id === this.master)) {
      const [{id}] = players;
      this.master = id;
    }
  }

  updateNextTurn() {
    if (this.players.length !== 1) {
      if (!this.currentTurn) {
        this.currentTurn = this.players[0].id;
      } else {
        let currIndex = this.players.findIndex(p => p.id === this.currentTurn);
        currIndex = (currIndex + 1) % this.players.length;
        this.currentTurn = this.players[currIndex].id;
        if (this.currentTurn === this.master) {
          this.currentTurn = this.updateNextTurn();
        }
      }
    } else {
      this.currentTurn = this.players[0].id;
    }
    return this.currentTurn;
  }

  setWord(word: string) {
    this.currentWord = [];
    for (const c of word.toUpperCase()) {
      this.currentWord.push({
        letter: c === ' ' ? undefined : c,
        isGuessed: false,
        id: this.currentWord.length.toString()
      });
    }
  }

  addGuess(guess: string): GuessInfo {
    this.guesses.push(guess);

    const letterInfo = this.currentWord.filter(l => l.letter === guess);
    if (!letterInfo || !letterInfo.length) {
      this.errors += 1;
    } else {
      letterInfo.forEach(l => l.isGuessed = true);
    }

    return {
      letter: guess,
      ids: letterInfo.map(l => l.id)
    };
  }

  isGameFinished() {
    if (this.currentWord.every(l => l.isGuessed)) {
      this.status = this.currentTurn;

      this.players.find(p => p.id === this.currentTurn).points += 1;
    }

    if (this.errors > 5) {
      this.status = 'lose';
    }

    return this.status;
  }
}
