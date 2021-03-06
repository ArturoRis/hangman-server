import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createOkResp, GuessInfo, PlayerInfo, PlayerLeaving, Status } from './game.models';
import { GameService } from './game.service';

@WebSocketGateway()
export class GameGateway implements OnGatewayDisconnect<Socket>, OnGatewayConnection<Socket> {

  @WebSocketServer()
  private server: Server;
  private userIdToClientMap: Map<string, Socket> = new Map();

  constructor(
    private gameService: GameService
  ) {
  }

  private socketUserMap = new Map<string, string>();

  join(roomIdToJoin: string, player: PlayerInfo) {
    console.log('join-room', JSON.stringify(player));
    this.userIdToClientMap.get(player.id).join(roomIdToJoin);
    this.server.to(roomIdToJoin).emit('player-join', createOkResp(player));
  }

  leaveRoom(roomId: string, playerLeaving: PlayerLeaving) {
    console.log('leave-room', playerLeaving.player.id);
    this.server.to(roomId).emit('player-leave', createOkResp(playerLeaving));
  }

  newTurn(roomId: string, playerInTurn: string) {
    this.server.to(roomId).emit('new-turn', createOkResp(playerInTurn));
  }

  @SubscribeMessage('init-game')
  initGame(client: Socket, {id}) {
    const room = this.gameService.getRoomByPlayerId(id);
    room.updateNextTurn();
    this.server.to(room.id).emit('go-to-start', createOkResp(room));
  }

  setWord(roomId: string, word: string) {
    console.log('set-word', roomId, word);
    this.server.to(roomId).emit('set-word', createOkResp(word));
  }

  newGuess(roomId: string, guessInfo: GuessInfo) {
    console.log('new-guess', roomId, JSON.stringify(guessInfo));
    this.server.to(roomId).emit('new-guess', createOkResp(guessInfo));
  }

  finishGame(roomId, finishState: Status): void {
    this.server.to(roomId).emit('finish-game', createOkResp(finishState));
  }

  newWordGuess(roomId: string, word: string) {
    console.log('new-word-guess', word);
    this.server.to(roomId).emit('new-word-guesses', createOkResp(word))
  }

  @SubscribeMessage('restart-game')
  restartGame(client: Socket, {id}) {
    const room = this.gameService.getRoomByPlayerId(id);
    room.restartGame();
    this.server.to(room.id).emit('restart-game', createOkResp(room));
  }

  handleConnection(client: Socket): any {
    const userId = client.handshake.query.id;
    this.socketUserMap.set(client.id, userId);
    this.userIdToClientMap.set(userId, client);
  }

  handleDisconnect(client: Socket): any {
    const userId = this.socketUserMap.get(client.id);
    this.socketUserMap.delete(client.id);
    this.userIdToClientMap.delete(userId);
    const room = this.gameService.getRoomByPlayerId(userId);
    const playerLeaving = this.gameService.removePlayer(room.id, userId);
    this.leaveRoom(room.id, playerLeaving);
  }
}
