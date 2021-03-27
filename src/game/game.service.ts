import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlayerLeaving, PlayerRemoved, RoomEntity, Status } from './game.models';
import Timeout = NodeJS.Timeout;

@Injectable()
export class GameService {
  private static EMPTY_ROOM_TIMEOUT = 60 * 60 * 10; // 10 minutes;
  private roomsMap: Map<string, RoomEntity> = new Map();
  private userToRoomMap: Map<string, RoomEntity> = new Map();
  private removedPlayersMap: Map<string, PlayerRemoved> = new Map();
  // roomId, timeoutId map
  private emptyRoomMap: Map<string, Timeout> = new Map();

  constructor() {}

  createRoom(userId: string, userName: string): RoomEntity {
    if (this.userToRoomMap.has(userId)) {
      return this.getRoomByPlayerId(userId);
    }

    const room = new RoomEntity(userId, userName);
    this.roomsMap.set(room.id, room);
    this.userToRoomMap.set(userId, room);

    return room;
  }

  addPlayer(roomId: string, userId: string, userName: string, points: number = 0) {
    const room = this.getRoomById(roomId);
    this.userToRoomMap.set(userId, room);

    const wasEmpty = this.emptyRoomMap.has(roomId);
    if (wasEmpty) {
      clearTimeout(this.emptyRoomMap.get(roomId));
    }

    return room.addPlayer(userId, userName, points);
  }

  removePlayer(roomId: string, playerId: string, {save}: { save: boolean }): PlayerLeaving {
    const room = this.getRoomById(roomId);
    const wasMaster = room.master === playerId;
    const player = room.removePlayer(playerId);
    this.userToRoomMap.delete(playerId);
    if (save) {
      this.removedPlayersMap.set(playerId, {
        player,
        roomId,
        round: room.round,
        wasMaster
      });
    }

    const playerLeaving: PlayerLeaving = {
      player,
      master: room.master
    }

    if (!room.players.length) {
      const timeoutId = setTimeout(() => this.removeRoom(roomId), GameService.EMPTY_ROOM_TIMEOUT);
      this.emptyRoomMap.set(roomId, timeoutId);
    }

    return playerLeaving;
  }

  private removeRoom(roomId: string) {
    this.roomsMap.delete(roomId);

    Array.from(this.removedPlayersMap.entries())
      .filter( ([_, { roomId: rId }]) => roomId === rId)
      .forEach( ([key]) => this.removedPlayersMap.delete(key));
  }

  isPlayerInTurn(roomId: string, playerId: string): boolean {
    return this.getRoomById(roomId).currentTurn === playerId;
  }

  updateNextTurn(roomId: string): string {
    return this.getRoomById(roomId).updateNextTurn();
  }

  getRoomById(roomId: string): RoomEntity {
    if (!this.roomsMap.has(roomId)) {
      throw new NotFoundException('Room not found: ' + roomId );
    }
    return this.roomsMap.get(roomId);
  }

  getRoomByPlayerId(playerId: string): RoomEntity {
    return this.userToRoomMap.get(playerId);
  }

  getReturningPlayer(playerId: string): PlayerRemoved {
    return this.removedPlayersMap.get(playerId);
  }

  checkGameFinished(roomId: string): Status {
    return this.getRoomById(roomId).isGameFinished();
  }

  updateMaster(roomId: string, newMaster: string) {
    this.getRoomById(roomId).updateMaster(newMaster);
  }

  isPlayerMaster(roomId: string, playerId: string) {
    return this.getRoomById(roomId).master === playerId;
  }
}
