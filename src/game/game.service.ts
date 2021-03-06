import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlayerLeaving, RoomEntity, Status } from './game.models';

@Injectable()
export class GameService {
  private roomsMap: Map<string, RoomEntity> = new Map();
  private userToRoomMap: Map<string, RoomEntity> = new Map();

  constructor() {
  }

  createRoom(userId: string, userName: string): RoomEntity {
    if (this.userToRoomMap.has(userId)) {
      throw new ConflictException('Room already present', 'desc');
    }
    const room = new RoomEntity(userId, userName);
    this.roomsMap.set(room.id, room);
    this.userToRoomMap.set(userId, room);

    return room;
  }

  createPlayer(roomId: string, userId: string, userName: string) {
    return this.getRoomById(roomId).addPlayer(userId, userName);
  }

  removePlayer(roomId: string, playerId: string): PlayerLeaving {
    const room = this.getRoomById(roomId);
    const player = room.removePlayer(playerId);

    this.userToRoomMap.delete(playerId);

    const playerLeaving: PlayerLeaving = {
      player,
      master: room.master
    }

    if (!room.players.length) {
      this.roomsMap.delete(roomId);
    }

    return playerLeaving;
  }

  isPlayerInTurn(roomId: string, playerId: string): boolean {
    return this.getRoomById(roomId).currentTurn === playerId;
  }

  updateNextTurn(roomId: string): string {
    return this.getRoomById(roomId).updateNextTurn();
  }

  getRoomById(roomId: string): RoomEntity {
    if (!this.roomsMap.has(roomId)) {
      throw new NotFoundException('My not found', 'Room not found: ' + roomId );
    }
    return this.roomsMap.get(roomId);
  }

  getRoomByPlayerId(playerId: string): RoomEntity {
    return this.userToRoomMap.get(playerId);
  }

  checkGameFinished(roomId: string): Status {
    return this.getRoomById(roomId).isGameFinished();
  }
}
