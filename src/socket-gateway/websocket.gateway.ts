import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createErrorResp, createOkResp, SocketResp } from './socket-resp';
import { GuessInfo, PlayerInfo, Room } from './room';

@WebSocketGateway()
export class WebsocketGateway implements OnGatewayDisconnect<Socket>, OnGatewayConnection<Socket> {

  @WebSocketServer()
  private server: Server;

  private rooms: Map<string, Room> = new Map();
  private usersConnected: { [id: string]: Room } = {};
  private socketUserMap = new Map<string, string>();

  @SubscribeMessage('create-room')
  createRoom(client: Socket, {id, payload: name}: {id: string, payload: string}) {
    console.log('create-room', id);
    const roomId = Math.random() + '';
    const room = new Room(roomId);
    room.addPlayer(id, name);
    client.join(roomId);
    this.usersConnected[id] = room;
    this.rooms.set(roomId, room);
    return new SocketResp(true, roomId);
  }

  @SubscribeMessage('join-room')
  join(client: Socket, {id, payload: { roomId: roomIdToJoin, name }}: {id: string, payload: { roomId: string, name: string }}) {
    console.log('join-room', id, roomIdToJoin);
    const room = this.rooms.get(roomIdToJoin);
    if (room) {
      if (!room.isPresent(id)) {
        const player = room.addPlayer(id, name);
        client.join(room.id);
        this.usersConnected[id] = room;
        this.server.to(room.id).emit('player-join', createOkResp(player));
      }
      return createOkResp(room);
    } else {
      return createErrorResp(roomIdToJoin + ' non trovato');
    }
  }

  @SubscribeMessage('leave-room')
  leaveRoom(client: Socket, {id}) {
    console.log('leave-room', id);
    const room = this.usersConnected[id];
    if (room) {
      this.usersConnected[id] = undefined;
      const master = room.master;
      const player = room.removePlayer(id);
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
  initGame(client: Socket, {id}) {
    const room = this.usersConnected[id];
    room.updateNextTurn();
    this.server.to(room.id).emit('go-to-start', createOkResp(room));
  }

  @SubscribeMessage('get-state')
  getState(client: Socket, {id}) {
    const room = this.usersConnected[id];
    if (room) {
      return createOkResp(room);
    } else {
      return createErrorResp(undefined);
    }
  }

  @SubscribeMessage('set-word')
  setWord(client: Socket, {id, payload: word}: {id: string, payload: string}) {
    console.log('set-word', id, word);
    const room = this.usersConnected[id];
    room.setWord(word);
    this.server.to(room.id).emit('set-word', createOkResp(room.currentWord));
    this.server.to(room.id).emit('new-turn', createOkResp(room.updateNextTurn()));
  }

  @SubscribeMessage('new-guess')
  newGuess(client: Socket, {id, payload: guessKey}: {id: string, payload: string}) {
    console.log('new-guess', id, guessKey);
    const room = this.usersConnected[id];
    const guessInfo = room.addGuess(guessKey);

    this.server.to(room.id).emit('new-guess', createOkResp(guessInfo));
    if (!this.checkGameFinished(room)) {
      this.server.to(room.id).emit('new-turn', createOkResp(room.updateNextTurn()));
    }
  }

  @SubscribeMessage('new-word-guess')
  newWordGuess(client: Socket, {id, payload: word}: {id: string, payload: string}) {
    console.log('new-word-guess', word);
    const room = this.usersConnected[id];
    room.checkWordGuess(id, word);
    if(!this.checkGameFinished(room)) {
      this.server.to(room.id).emit('new-word-guesses', createOkResp(room.wordGuesses))
    }
  }

  @SubscribeMessage('restart-game')
  restartGame(client: Socket, {id}) {
    const room = this.usersConnected[id];
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

  handleConnection(client: Socket): any {
    this.socketUserMap.set(client.id, client.handshake.query.id);
  }

  handleDisconnect(client: Socket): any {
    this.leaveRoom(client, {id: this.socketUserMap.get(client.id)});
  }
}
