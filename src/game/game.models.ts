import { generateRoomId } from '../utils/generate-random-id';

export interface Status {
  player: PlayerInfo;
  win: boolean;
}

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

export interface PlayerRemoved {
  player: PlayerInfo;
  roomId: string;
  round: number;
  wasMaster: boolean;
}

export interface GuessInfo {
  letter: string;
  ids: string[]; // if present are the id of the LetterInfo of which this letter is the answer
}

export interface SocketMessage<D> {
  id: string;
  payload: D;
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
  word: string;
}

export interface WordToGuessDto {
  word: string;
}

export interface GuessDto {
  letter: string;
}

export interface UserDto {
  name: string;
}

export interface RoomDto {
  id: string;
  currentWord: LetterInfo[];
  guesses: GuessInfo[];
  wordGuesses: string[];
  status: Status;
  errors: number;
  master: string; // The id of the player that is the game master
  currentTurn: string; // The id of the player whose has the current turn
  players: PlayerInfo[];
}

export interface PlayerLeaving {
  player: PlayerInfo;
  master: string;
}

export class RoomEntity implements RoomDto{
  id: string;
  currentWord: LetterInfo[];
  guesses: GuessInfo[];
  wordGuesses: string[];
  status: Status;
  errors: number;
  master: string;
  currentTurn: string;
  players: PlayerInfo[];
  round: number;

  constructor(
    masterId: string,
    masterName: string
  ) {
    this.id = generateRoomId();
    this.master = null;
    this.players = [];
    this.round = 0;
    this.resetGame();
    this.addPlayer(masterId, masterName, 0);
    this.master = masterId;
    this.currentTurn = masterId;
  }

  private resetGame() {
    this.currentWord = [];
    this.guesses = [];
    this.wordGuesses = [];
    this.status = null;
    this.errors = 0;
    this.currentTurn = null;
    this.round += 1;
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

  addPlayer(userId: string, name: string, points: number): PlayerInfo {
    let player: PlayerInfo;
    // TODO is it possible to add an already present player?
    player = this.players.find(p => p.id === userId);
    if (!player) {
      player = { id: userId, name, points };
      this.players.push(player);
    }
    return player;
  }

  removePlayer(userId: string): PlayerInfo {
    const player = this.players.find( p => p.id === userId);

    this.players = this.players.filter(p => p.id !== userId);

    this.updateMaster();

    return player;
  }

  updateMaster(newMaster?: string) {
    if (!this.players.length) {
      // The room should be removed
      this.master = undefined;
      return;
    }

    if (newMaster) {
      this.master = newMaster;
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
      this.currentTurn = this.master;
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

  checkGuessIsPresent(guess: string): boolean {
    return !!this.guesses.find(g => g.letter === guess);
  }


  addGuess(guess: string): GuessInfo {
    // Get all letters equals to the guess
    const presentLetterInfos = this.currentWord.filter(l => l.letter === guess);
    if (!presentLetterInfos || !presentLetterInfos.length) {
      this.errors += 1;
    } else {
      presentLetterInfos.forEach(l => l.isGuessed = true);
    }

    const guessInfo = {
      letter: guess,
      ids: presentLetterInfos.map(l => l.id),
    };
    this.guesses.push(guessInfo);

    return guessInfo;
  }

  isGameFinished() {
    if (!this.status) {
      if (this.currentWord.every(l => l.isGuessed)) {
        this.finishGame(this.currentTurn, { win: true });
      }

      if (this.errors > 5) {
        this.finishGame(this.master, { win: false });
      }
    }
    return this.status;
  }

  private finishGame(playerId: string, { win }: { win: boolean}) {
    const finishPlayer = this.players.find(p => p.id === playerId);
    finishPlayer.points += 1;
    this.status = {
      player: finishPlayer,
      win
    };
  }

  checkWordGuess(userId: string, word: string) {
    const normalizedWord = word.toUpperCase();
    this.wordGuesses.push(normalizedWord);

    const currentWord = this.currentWord.map(l => l.letter || ' ').join('');
    if (normalizedWord === currentWord) {
      this.finishGame(userId, { win: true });
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
    players: room.players
  };
}
