import { generateRoomId } from '../utils/generate-random-id';

// name of the winner, 'lose' if the game ended losing it, null if the game is active
export type Status = string | 'lose' | null;

export interface LetterInfo {
  id: string;
  letter: string;
  isGuessed: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  points: number;
}

export interface GuessInfo {
  letter: string;
  ids: string[]; // if present are the id of the LetterInfo of which this letter is the answer
}

export class SocketResp<R = string> {
  constructor(
      public ok: boolean,
      public data: R,
  ) {
  }
}

export function createOkResp<R>(data: R) {
  return new SocketResp(true, data);
}

export interface WordGuessDto {
  playerId: string;
  word: string;
}

export interface UserDto {
  id: string;
  name: string;
}

export interface RoomDto {
  id: string;
  currentWord: LetterInfo[];
  guesses: string[];
  wordGuesses: string[];
  status: Status;
  errors: number;
  master: string; // The id of the player that is the game master
  currentTurn: string; // The id of the player whose has the current turn
  players: PlayerInfo[];
  removedPlayers: Map<string, PlayerInfo>;
}

export interface PlayerLeaving {
  player: PlayerInfo;
  master: string;
}

export class RoomEntity implements RoomDto{
  id: string;
  currentWord: LetterInfo[];
  guesses: string[];
  wordGuesses: string[];
  status: Status;
  errors: number;
  master: string;
  currentTurn: string;
  players: PlayerInfo[];
  removedPlayers: Map<string, PlayerInfo>;

  constructor(
    masterId: string,
    masterName: string
  ) {
    this.id = generateRoomId();
    this.master = null;
    this.players = [];
    this.removedPlayers = new Map();
    this.resetGame();
    this.addPlayer(masterId, masterName);
    this.master = masterId;
  }

  private resetGame() {
    this.currentWord = [];
    this.guesses = [];
    this.wordGuesses = [];
    this.status = null;
    this.errors = 0;
    this.currentTurn = null;
  }

  restartGame() {
    // Reset variables
    this.resetGame();
    this.setNextMaster();
    // The first to begin is always the master
    this.currentTurn = this.master;
  }

  setNextMaster() {
    const currentMasterIndex = this.players.findIndex(p => p.id === this.master);
    const newMasterIndex = (currentMasterIndex + 1) % this.players.length;
    this.master = this.players[newMasterIndex].id;
  }

  isPresent(userId: string) {
    return !!this.players.find(p => p.id === userId);
  }

  addPlayer(userId: string, name: string): PlayerInfo {
    let player: PlayerInfo;
    const returningPlayer = this.removedPlayers.get(userId);
    if (returningPlayer) {
      player = returningPlayer;
      this.removedPlayers.delete(userId);
      this.players.push(player);
    } else {
      // TODO is it possible to add an already present player?
      player = this.players.find(p => p.id === userId);
      if (!player) {
        player = { id: userId, name, points: 0 };
        this.players.push(player);
      }
    }
    return player;
  }

  removePlayer(userId: string): PlayerInfo {
    const player = this.players.find( p => p.id === userId);

    this.players = this.players.filter(p => p.id !== userId);

    this.removedPlayers.set(player.id, player);

    this.updateMaster();

    return player;
  }

  updateMaster() {
    if (!this.players.length) {
      // The room should be removed
      this.master = undefined;
      return;
    }

    // If the master is not preset
    if (!this.players.find(p => p.id === this.master)) {
      // The first player will be the new master
      this.master =  this.players[0].id;
    }
  }

  updateNextTurn() {
    if (!this.players.length) {
      throw new Error('There are no player, can\'t determine next turn');
    }

    if (this.players.length === 1) {
      this.currentTurn = this.players[0].id;
      return this.currentTurn;
    }

    const currTurnIndex = this.players.findIndex(p => p.id === this.currentTurn);
    const nextTurnIndex = (currTurnIndex + 1) % this.players.length;
    const newCurrentTurn = this.players[nextTurnIndex].id;
    if (newCurrentTurn === this.master) {
      this.currentTurn = this.updateNextTurn();
    } else {
      this.currentTurn = newCurrentTurn;
    }

    return this.currentTurn;
  }

  setWord(word: string) {
    this.currentWord = word
      .toUpperCase()
      .split('')
      .map( (char, i) => ({
        letter: char === ' ' ? undefined : char,
        isGuessed: false,
        id: i.toString()
      }));
  }

  addGuess(guess: string): GuessInfo {
    this.guesses.push(guess);

    // Get all letters equals to the guess
    const presentLetterInfos = this.currentWord.filter(l => l.letter === guess);
    if (!presentLetterInfos || !presentLetterInfos.length) {
      this.errors += 1;
    } else {
      presentLetterInfos.forEach(l => l.isGuessed = true);
    }

    return {
      letter: guess,
      ids: presentLetterInfos.map(l => l.id),
    };
  }

  isGameFinished() {
    if (this.status) {
      return this.status;
    }

    if (this.currentWord.every(l => l.isGuessed)) {
      this.status = this.currentTurn;

      const winnerPlayer = this.players.find(p => p.id === this.currentTurn);
      winnerPlayer.points += 1;
    }

    if (this.errors > 5) {
      this.status = 'lose';

      const masterPlayer = this.players.find( p => p.id === this.master);
      masterPlayer.points += 1;
    }

    return this.status;
  }

  checkWordGuess(userId: string, word: string) {
    // TODO check this method: should the status really be updated here?
    const normalizedWord = word.toUpperCase();
    this.wordGuesses.push(normalizedWord);

    const currentWord = this.currentWord.map(l => l.letter || ' ').join('');
    if (normalizedWord === currentWord) {
      this.status = userId;
      this.players.find(p => p.id === this.status).points += 1;
    }
  }
}

export function roomEntityToDto(room: RoomEntity): RoomDto {
  return {
    id: room.id,
    currentWord: room.currentWord,
    guesses: room.guesses,
    wordGuesses: room.wordGuesses,
    status: room.status,
    errors: room.errors,
    master: room.master,
    currentTurn: room.currentTurn,
    players: room.players,
    removedPlayers: room.removedPlayers
  };
}
