
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


export class Room {
  currentWord: LetterInfo[];
  guesses: string[];
  wordGuesses: string[];
  status: Status;
  errors: number;
  master: string; // The id of the player that is the game master
  currentTurn: string; // The id of the player whose has the current turn
  players: PlayerInfo[];

  constructor(
    public id: string,
  ) {
    this.resetGame();
    this.players = [];
    this.master = null;
  }

  resetGame() {
    this.currentWord = [];
    this.guesses = [];
    this.wordGuesses = [];
    this.status = null;
    this.errors = 0;
    this.currentTurn = null;
    if (this.master) {
      this.setNextMaster();
      this.currentTurn = this.master;
    }
  }

  setNextMaster() {
    let masterIndex = this.players.findIndex(p => p.id === this.master);
    masterIndex = (masterIndex + 1) % this.players.length;
    this.master = this.players[masterIndex].id;
  }

  isPresent(userId: string) {
    return !!this.players.find(p => p.id === userId);
  }

  addPlayer(user: string, name: string) {
    let player;
    if (!this.isPresent(user)) {
      player = { id: user, name, points: 0 };
      this.players.push(player);
    } else {
      player = this.players.find(p => p.id === user);
    }
    this.updateMaster();
    return player;
  }

  removePlayer(userId: string): PlayerInfo {
    let player;
    this.players = this.players.filter(p => {
      if (p.id === userId) {
        player = p;
        return false;
      } else {
        return true;
      }
    });
    this.updateMaster();
    return player;
  }

  updateMaster() {
    if (this.players.length === 1) {
      this.master = this.players[0].id;
      return;
    }
    const players = this.players;
    if (!players.length) {
      this.master = undefined;
      return;
    }

    if (!this.master || !players.find(p => p.id === this.master)) {
      const [{ id }] = players;
      this.master = id;
    }
  }

  updateNextTurn() {
    if (this.players.length !== 1) {
      if (!this.currentTurn) {
        this.currentTurn = this.players[0].id;
      } else {
        let currIndex = this.players.findIndex(p => p.id === this.currentTurn);
        currIndex = (currIndex + 1) % this.players.length;
        this.currentTurn = this.players[currIndex].id;
        if (this.currentTurn === this.master) {
          this.currentTurn = this.updateNextTurn();
        }
      }
    } else {
      this.currentTurn = this.players[0].id;
    }
    return this.currentTurn;
  }

  setWord(word: string) {
    this.currentWord = [];
    for (const c of word.toUpperCase()) {
      this.currentWord.push({
        letter: c === ' ' ? undefined : c,
        isGuessed: false,
        id: this.currentWord.length.toString(),
      });
    }
  }

  addGuess(guess: string): GuessInfo {
    this.guesses.push(guess);

    const letterInfo = this.currentWord.filter(l => l.letter === guess);
    if (!letterInfo || !letterInfo.length) {
      this.errors += 1;
    } else {
      letterInfo.forEach(l => l.isGuessed = true);
    }

    return {
      letter: guess,
      ids: letterInfo.map(l => l.id),
    };
  }

  isGameFinished() {
    if (this.status) {
      return this.status;
    }

    if (this.currentWord.every(l => l.isGuessed)) {
      this.status = this.currentTurn;

      this.players.find(p => p.id === this.currentTurn).points += 1;
    }

    if (this.errors > 5) {
      this.status = 'lose';
    }

    return this.status;
  }

  checkWordGuess(userId: string, word: string) {
    word = word.toUpperCase();
    this.wordGuesses.push(word);

    if (word === this.currentWord.map(l => l.letter || ' ').join('')) {
      this.status = userId;
      this.players.find(p => p.id === this.status).points += 1;
    }
  }
}
