import { CanActivate, ExecutionContext, Injectable, UseGuards, Headers } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GameService } from './game.service';
import { Request } from 'express';

const PLAYER_ID_HEADER = 'player-id';
export const PlayerIdHeader = () => Headers(PLAYER_ID_HEADER);

@Injectable()
export class PlayerInTurnGuard implements CanActivate {
  constructor(
    private gameService: GameService
  ) {
  }
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const playerId = request.header(PLAYER_ID_HEADER);
    const room = this.gameService.getRoomByPlayerId(playerId);

    return room && this.gameService.isPlayerInTurn(room.id, playerId);
  }
}
export const IsPlayerInTurnGuard = () => UseGuards(PlayerInTurnGuard);


@Injectable()
export class PlayerIsMasterGuard implements CanActivate {
  constructor(
    private gameService: GameService
  ) {
  }
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request: Request = context.switchToHttp().getRequest();
    const playerId = request.header(PLAYER_ID_HEADER);
    const room = this.gameService.getRoomByPlayerId(playerId);

    return room && this.gameService.isPlayerMaster(room.id, playerId);
  }
}
export const IsPlayerMasterGuard = () => UseGuards(PlayerIsMasterGuard);
