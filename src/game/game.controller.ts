import { Body, Controller, Delete, Get, Logger, Param, Post } from '@nestjs/common';
import { GameService } from './game.service';
import { GuessInfo, PlayerInfo, RoomDto, RoomEntity, roomEntityToDto, UserDto, WordGuessDto } from './game.models';
import { GameGateway } from './game.gateway';

import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import * as rawBody from "raw-body";

export const PlainBody = createParamDecorator(async (_, context: ExecutionContext) => {
  const req = context.switchToHttp().getRequest<import("express").Request>();
  if (!req.readable) { throw new BadRequestException("Invalid body"); }

  return (await rawBody(req)).toString("utf8").trim();
})

@Controller('game')
export class GameController {
  private readonly logger = new Logger(GameController.name);

  constructor(
    private gameService: GameService,
    private gameGateway: GameGateway
  ) {
  }

  @Post('rooms')
  createRoom(@Body() {id: userId, name: userName}: UserDto): RoomDto {
    this.logger.log('create-room ' + userId);
    const room = this.gameService.createRoom(userId, userName);
    return roomEntityToDto(room);
  }

  @Get('rooms/:roomId')
  getRoom(@Param('roomId') roomId: string): RoomDto {
    this.logger.log('controller-room ' + roomId);
    const room = this.gameService.getRoomById(roomId);
    return roomEntityToDto(room);
  }

  @Post('rooms/:roomId/players')
  joinRoom(@Param('roomId') roomId: string, @Body() userDto: UserDto): PlayerInfo {
    this.logger.log('controller-join ' + roomId + ', ' + userDto.id + ', ' + userDto.name);
    const player = this.gameService.addPlayer(roomId, userDto.id, userDto.name);
    this.gameGateway.join(roomId, player);
    return player
  }

  @Delete('rooms/:roomId/players/:playerId')
  removePlayer(@Param() {roomId, playerId}: { roomId: string, playerId: string }): PlayerInfo {
    this.logger.log('controller-remove-player ' + roomId + ', ' + playerId);
    const playerLeaving = this.gameService.removePlayer(roomId, playerId, { save: false });
    this.gameGateway.leaveRoom(roomId, playerLeaving);

    if (this.gameService.isPlayerInTurn(roomId, playerId)) {
      this.gameGateway.newTurn(roomId, this.gameService.updateNextTurn(roomId));
    }
    return playerLeaving.player;
  }

  @Post('rooms/:roomId/word')
  setWord(@Param('roomId') roomId: string, @PlainBody() word: string): string {
    this.logger.log('controller-word ' + roomId + ', ' + word);
    const room = this.gameService.getRoomById(roomId);
    room.setWord(word);
    this.gameGateway.setWord(roomId, room.currentWord);
    this.gameGateway.newTurn(roomId, room.updateNextTurn());
    return word;
  }

  @Post('rooms/:roomId/guesses')
  newGuess(@Param('roomId') roomId: string, @PlainBody() char: string): GuessInfo {
    this.logger.log('controller-new-guess ' + roomId + ', ' + char);
    const room = this.gameService.getRoomById(roomId);
    const guessInfo = room.addGuess(char);

    if (!this.checkGameFinished(room)) {
      this.gameGateway.newGuess(roomId, guessInfo);
      this.gameGateway.newTurn(room.id, room.updateNextTurn());
    }

    return guessInfo;
  }

  private checkGameFinished(room: RoomEntity): boolean {
    const finishState = this.gameService.checkGameFinished(room.id);
    if (finishState) {
      room.currentWord
        .map(l => room.addGuess(l.letter))
        .forEach(
          (guessInfo: GuessInfo) => {
            this.gameGateway.newGuess(room.id, guessInfo)
          }
        );
      this.gameGateway.finishGame(room.id, finishState);
      this.gameGateway.updatePlayer(room.id, finishState.player);
    }
    return !!finishState;
  }

  @Post('rooms/:roomId/word-guesses')
  newWordGuess(@Param('roomId') roomId: string, @Body() wordGuess: WordGuessDto): WordGuessDto {
    this.logger.log('controller-word-guess ' + roomId + ', ' + wordGuess.word);
    const room = this.gameService.getRoomById(roomId);
    room.checkWordGuess(wordGuess.playerId, wordGuess.word)
    if (!this.checkGameFinished(room)) {
      this.gameGateway.newWordGuess(roomId, wordGuess.word);
    }
    return wordGuess;
  }
}
