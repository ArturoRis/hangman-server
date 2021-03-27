import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createOkResp, GuessInfo, LetterInfo, PlayerInfo, PlayerLeaving, RoomDto, Status } from './game.models';
import { GameService } from './game.service';

@WebSocketGateway()
export class GameGateway implements OnGatewayDisconnect<Socket>, OnGatewayConnection<Socket> {

  @WebSocketServer()
  private server: Server;
  private userIdToClientMap: Map<string, Socket> = new Map();
  private socketUserMap = new Map<string, string>();

  constructor(
    private gameService: GameService
  ) {
  }

  restartGame(room: RoomDto) {
    console.log('restart-game', room);
    this.server.to(room.id).emit('restart-game', createOkResp(room));
  }

  join(roomIdToJoin: string, player: PlayerInfo) {
    console.log('join-room', player);
    this.userIdToClientMap.get(player.id).join(roomIdToJoin);
    this.server.to(roomIdToJoin).emit('player-join', createOkResp(player));
  }

  leaveRoom(roomId: string, playerLeaving: PlayerLeaving) {
    console.log('leave-room', roomId, playerLeaving.player.id);
    this.userIdToClientMap.get(playerLeaving.player.id)?.leave(roomId);
    this.server.to(roomId).emit('player-leave', createOkResp(playerLeaving));
  }

  newTurn(roomId: string, playerInTurn: string) {
    console.log('newTurn-room', roomId, playerInTurn);
    this.server.to(roomId).emit('new-turn', createOkResp(playerInTurn));
  }

  setWord(roomId: string, word: LetterInfo[]) {
    console.log('set-word', roomId, word);
    this.server.to(roomId).emit('set-word', createOkResp(word));
  }

  newGuess(roomId: string, guessInfo: GuessInfo) {
    console.log('new-guess', roomId, guessInfo);
    this.server.to(roomId).emit('new-guess', createOkResp(guessInfo));
  }

  finishGame(roomId, finishState: Status): void {
    // He we cannot have finishState as null, otherwise the game wouldn't have finished
    console.log('finish-game', roomId, finishState);
    const finish: string | 'lose' = finishState.win ?
    finishState.player.id
    : 'lose';
    this.server.to(roomId).emit('finish-game', createOkResp(finish));
  }

  newWordGuess(roomId: string, word: string) {
    console.log('new-word-guess', roomId, word);
    this.server.to(roomId).emit('new-word-guesses', createOkResp(word))
  }

  updatePlayer(roomId: string, player: PlayerInfo) {
    console.log('update-player', roomId, player);
    this.server.to(roomId).emit('update-player', createOkResp(player));
  }

  updateMaster(roomId: string, newMaster: string) {
    console.log('new-master', roomId, newMaster);
    this.server.to(roomId).emit('new-master', createOkResp(newMaster))
  }

  handleConnection(client: Socket): any {
    const userId = client.handshake.query.id;
    console.log('connection', userId);
    this.socketUserMap.set(client.id, userId);
    this.userIdToClientMap.set(userId, client);
  }

  handleDisconnect(client: Socket): any {
    const userId = this.socketUserMap.get(client.id);
    console.log('disconnection', userId);
    this.socketUserMap.delete(client.id);
    this.userIdToClientMap.delete(userId);
    const room = this.gameService.getRoomByPlayerId(userId);
    if (room) {
      const playerLeaving = this.gameService.removePlayer(room.id, userId, { save: true });
      this.leaveRoom(room.id, playerLeaving);
      if (room.players.length && room.currentTurn === playerLeaving.player.id) {
        this.newTurn(room.id, room.updateNextTurn());
      }
    }
  }
}
