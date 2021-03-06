import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { GameService } from './game.service';
import { GuessInfo, PlayerInfo, RoomDto, RoomEntity, roomEntityToDto, UserDto, WordGuessDto } from './game.models';
import { GameGateway } from './game.gateway';

@Controller('game')
export class GameController {
  constructor(
    private gameService: GameService,
    private gameGateway: GameGateway
  ) {
  }

  @Post('rooms')
  createRoom(@Body() {id: userId, name: userName}: UserDto): RoomDto {
    console.log('create-room', userId);
    const room = this.gameService.createRoom(userId, userName);
    return roomEntityToDto(room);
  }

  @Get('rooms/:roomId')
  getRoom(@Param('roomId') roomId): RoomDto {
    const room = this.gameService.getRoomById(roomId);
    return roomEntityToDto(room);
  }

  @Post('rooms/:roomId/players')
  joinRoom(@Param('roomId') roomId, @Body() userDto: UserDto): PlayerInfo {
    const player = this.gameService.createPlayer(roomId, userDto.id, userDto.name);
    this.gameGateway.join(roomId, player);
    return player
  }

  @Delete('rooms/:roomId/players/:playerId')
  removePlayer(@Param() {roomId, playerId}: { roomId: string, playerId: string }): PlayerInfo {
    const playerLeaving = this.gameService.removePlayer(roomId, playerId);
    this.gameGateway.leaveRoom(roomId, playerLeaving);

    if (this.gameService.isPlayerInTurn(roomId, playerId)) {
      this.gameGateway.newTurn(roomId, this.gameService.updateNextTurn(roomId));
    }
    return playerLeaving.player;
  }

  @Post('rooms/:roomId/word')
  setWord(@Param('roomId') roomId, @Body() word: string): string {
    const room = this.gameService.getRoomById(roomId);
    room.setWord(word);
    this.gameGateway.setWord(roomId, word);
    this.gameGateway.newTurn(roomId, room.updateNextTurn());
    return word;
  }

  @Post('rooms/:roomId/guesses')
  newGuess(@Param('roomId') roomId, @Body() char: string): GuessInfo {
    const room = this.gameService.getRoomById(roomId);
    const guessInfo = room.addGuess(char);

    if (!this.checkGameFinished(room)) {
      this.gameGateway.newGuess(roomId, guessInfo);
    }

    return guessInfo;
  }

  private checkGameFinished(room: RoomEntity): boolean {
    const finishState = this.gameService.checkGameFinished(room.id);
    if (!finishState) {
      this.gameGateway.newTurn(room.id, room.updateNextTurn());
    } else {
      room.currentWord
        .filter(l => !l.isGuessed)
        .map(l => room.addGuess(l.letter))
        .forEach(
          (guessInfo: GuessInfo) => {
            this.gameGateway.newGuess(room.id, guessInfo)
          }
        );
      this.gameGateway.finishGame(room.id, finishState);
    }
    return !!finishState;
  }

  @Post('rooms/:roomId/word-guesses')
  newWordGuess(@Param('roomId') roomId, @Body() wordGuess: WordGuessDto): WordGuessDto {
    this.gameService.getRoomById(roomId).checkWordGuess(wordGuess.playerId, wordGuess.word)
    if (!this.checkGameFinished(roomId)) {
      this.gameGateway.newWordGuess(roomId, wordGuess.word);
    }
    return wordGuess;
  }
}
