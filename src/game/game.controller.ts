import {
  BadRequestException,
  Body,
  Controller,
  createParamDecorator,
  Delete,
  ExecutionContext,
  Get,
  Logger,
  Param,
  Post,
  Put
} from '@nestjs/common';
import { GameService } from './game.service';
import {
  GuessDto,
  GuessInfo,
  PlayerInfo,
  RoomDto,
  RoomEntity,
  roomEntityToDto,
  UserDto,
  WordGuessDto,
  WordToGuessDto
} from './game.models';
import { GameGateway } from './game.gateway';
import { IsPlayerInTurnGuard, PlayerIdHeader } from './player-in-turn.guard';

@Controller('game')
export class GameController {
  private readonly logger = new Logger(GameController.name);

  constructor(
    private gameService: GameService,
    private gameGateway: GameGateway
  ) {
  }

  @Post('rooms')
  createRoom(@Body() {name: userName}: UserDto, @PlayerIdHeader() userId: string): RoomDto {
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

  @Put('rooms/:roomId/restart-game')
  @IsPlayerInTurnGuard()
  restartGame(@Param('roomId') roomId: string) {
    this.logger.log('restart-game ' + roomId)
    const room = this.gameService.getRoomById(roomId);
    room.restartGame();
    const roomDto = roomEntityToDto(room);
    this.gameGateway.restartGame(roomDto);
    return roomDto;
  }

  @Put('rooms/:roomId/init-game')
  @IsPlayerInTurnGuard()
  initGame(@Param('roomId') roomId: string) {
    this.logger.log('init-game ' + roomId)
    const room = this.gameService.getRoomById(roomId);
    const roomDto = roomEntityToDto(room);
    this.gameGateway.initGame(roomDto);
    return roomDto;
  }

  @Post('rooms/:roomId/players')
  joinRoom(
    @Param('roomId') roomId: string,
    @Body() {name}: UserDto,
    @PlayerIdHeader() userId: string
    ): PlayerInfo {
    this.logger.log('controller-join ' + roomId + ', ' + userId + ', ' + name);
    const player = this.gameService.addPlayer(roomId, userId, name);
    this.gameGateway.join(roomId, player);
    return player
  }

  @Delete('rooms/:roomId/players/:playerId')
  removePlayer(@Param() {roomId, playerId}: { roomId: string, playerId: string }): PlayerInfo {
    this.logger.log('controller-remove-player ' + roomId + ', ' + playerId);
    const playerLeaving = this.gameService.removePlayer(roomId, playerId, {save: false});
    this.gameGateway.leaveRoom(roomId, playerLeaving);

    if (this.gameService.isPlayerInTurn(roomId, playerId)) {
      this.gameGateway.newTurn(roomId, this.gameService.updateNextTurn(roomId));
    }
    return playerLeaving.player;
  }

  @Post('rooms/:roomId/word')
  @IsPlayerInTurnGuard()
  setWord(@Param('roomId') roomId: string, @Body() {word}: WordToGuessDto): string {
    this.logger.log('controller-word ' + roomId + ', ' + word);
    const room = this.gameService.getRoomById(roomId);
    room.setWord(word);
    this.gameGateway.setWord(roomId, room.currentWord);
    this.gameGateway.newTurn(roomId, room.updateNextTurn());
    return word;
  }

  @Post('rooms/:roomId/guesses')
  @IsPlayerInTurnGuard()
  newGuess(@Param('roomId') roomId: string, @Body() {letter: char}: GuessDto): GuessInfo {
    this.logger.log('controller-new-guess ' + roomId + ', ' + char);
    const room = this.gameService.getRoomById(roomId);
    try {
      const guessInfo = room.addGuess(char);
      if (!this.checkGameFinished(room)) {
        this.gameGateway.newGuess(roomId, guessInfo);
        this.gameGateway.newTurn(room.id, room.updateNextTurn());
      }

      return guessInfo;

    } catch (e) {
      throw new BadRequestException(`Letter "${char}" already guessed`)
    }
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
