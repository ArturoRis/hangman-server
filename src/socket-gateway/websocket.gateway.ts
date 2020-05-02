import { OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createErrorResp, createOkResp, SocketResp } from './socket-resp';
import { GuessInfo, PlayerInfo, Room } from './room';

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
    return new SocketResp(true, roomId);
  }

  @SubscribeMessage('join-room')
  join(client: Socket, { roomId: roomIdToJoin, name }: { roomId: string, name: string }) {
    console.log('join-room', client.id, roomIdToJoin);
    const room = this.rooms.get(roomIdToJoin);
    if (room) {
      if (!room.isPresent(client.id)) {
        const player = room.addPlayer(client.id, name);
        client.join(room.id);
        this.usersConnected[client.id] = room;
        this.server.to(room.id).emit('player-join', createOkResp(player));
      }
      return createOkResp(room);
    } else {
      return createErrorResp(roomIdToJoin + ' non trovato');
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
        player,
      };
      if (master !== room.master) {
        resp.master = room.master;
      }
      client.to(room.id).emit('player-leave', createOkResp(resp));

      if (room.players.length) {

        if (player.id === room.currentTurn) {
          this.server.to(room.id).emit('new-turn', createOkResp(room.updateNextTurn()));
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
    this.server.to(room.id).emit('go-to-start', createOkResp(room));
  }

  @SubscribeMessage('get-state')
  getState(client: Socket) {
    const room = this.usersConnected[client.id];
    if (room) {
      return createOkResp(room);
    } else {
      return createErrorResp(undefined);
    }
  }

  @SubscribeMessage('set-word')
  setWord(client: Socket, word: string) {
    console.log('set-word', client.id, word);
    const room = this.usersConnected[client.id];
    room.setWord(word);
    this.server.to(room.id).emit('set-word', createOkResp(room.currentWord));
    this.server.to(room.id).emit('new-turn', createOkResp(room.updateNextTurn()));
  }

  @SubscribeMessage('new-guess')
  newGuess(client: Socket, guessKey: string) {
    console.log('new-guess', client.id, guessKey);
    const room = this.usersConnected[client.id];
    const guessInfo = room.addGuess(guessKey);

    this.server.to(room.id).emit('new-guess', createOkResp(guessInfo));
    if (!this.checkGameFinished(room)) {
      this.server.to(room.id).emit('new-turn', createOkResp(room.updateNextTurn()));
    }
  }

  @SubscribeMessage('new-word-guess')
  newWordGuess(client: Socket, word: string) {
    console.log('new-word-guess', word);
    const room = this.usersConnected[client.id];
    room.checkWordGuess(client.id, word);
    if(!this.checkGameFinished(room)) {
      this.server.to(room.id).emit('new-word-guesses', createOkResp(room.wordGuesses))
    }
  }

  @SubscribeMessage('restart-game')
  restartGame(client: Socket) {
    const room = this.usersConnected[client.id];
    room.resetGame();
    this.server.to(room.id).emit('restart-game', createOkResp(room));
  }

  checkGameFinished(room) {
    const finishState = room.isGameFinished();
    if (finishState) {
      room.currentWord
        .filter( l => !l.isGuessed)
        .map( l => room.addGuess(l.letter))
        .forEach(
          (guessInfo: GuessInfo) => {
          this.server.to(room.id).emit('new-guess', createOkResp(guessInfo))
        }
      );
      this.server.to(room.id).emit('finish-game', createOkResp(finishState));
      return true;
    } else {
      return false;
    }
  }

  handleDisconnect(client: Socket): any {
    this.leaveRoom(client);
  }
}
