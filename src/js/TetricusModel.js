import _ from 'lodash';
import { EventEmitter2 } from 'eventemitter2';
import TetricusCONST from './TetricusCONST';

const CONST = TetricusCONST;

export default class TetricusModel extends EventEmitter2 {
  constructor() {
    super();
  }
  
  newGame() {
    this.initGame();
    this.startGame();
  }
  
  initGame() {
    clearTimeout(this.tickId);
    clearInterval(this.renderId);
    this.isPlayng = false;
    this.isPausing = false;
    this.lose = false;
    this.tickInterval = CONST.TICK_INTERVAL;
    this.sumOfClearLines = 0;
    this.level = 1;
    this.score = 0;
    this.frameCount = 0;
    this.initBoard();
    this.initBlock();
    this.createNextBlock();
  }
  
  startGame() {
    this.isPlayng = true;
    this.isPausing = false;
    this.createCurrentBlock();
    this.createNextBlock();
    this.tick();
    this.emit('gamestart');
  }
  
  pauseGame() {
    this.isPlayng = false;
    this.isPausing = true;
    clearTimeout(this.tickId);
    delete this.tickId;
  }
  
  resumeGame() {
    if (this.isPlayng || !this.isPausing) return;
    this.isPlayng = true;
    this.isPausing = false;
    this.tickId = setTimeout(() => { this.tick(); }, this.tickInterval);
  }
  
  quitGame() {
    let dfd = $.Deferred();
    // this.gameOverEffect().then(() => {
    //   this.isPlayng = false;
    //   this.emit('gamequit');
    //   dfd.resolve();
    // });
    return dfd.promise();
  }
  stopGame() { this.quitGame(); } // alias
  
  // メインでループする関数
  tick() {
    clearTimeout(this.tickId);
    if (!this.isPlayng || this.isPausing) return;
    let isMoveDown = this.moveBlockY();
    if (!isMoveDown) {
      this.freeze();
      this.checkClearLines();
      if (this.checkGameOver()) {
        this.emit('gameover');
        // this.quitGame().then(function(){});
        return false;
      }
      this.frameCount++;
      this.createCurrentBlock();
      this.createNextBlock();
    }
    this.tickId = setTimeout(() => { this.tick(); }, this.tickInterval);
    this.emit('tick', !isMoveDown);
  }
  
  initBoard() {
    this.board = [];
    for ( let z = 0; z < CONST.COLS; ++z ) {
      this.board[z] = [];
      for ( let y = 0; y < CONST.LOGICAL_ROWS; ++y ) {
        this.board[z][y] = [];
        for ( let x = 0; x < CONST.COLS; ++x ) {
          this.board[z][y][x] = 0;
        }
      }
    }
  }
  
  initBlock() {
    this.nextBlock = this.createBlock(0);
    this.currentBlock = this.createBlock(0);
    this.currentBlock.x = CONST.START_X;
    this.currentBlock.y = CONST.START_Y;
    this.currentBlock.z = CONST.START_Z;
  }
  
  createBlock(id = 0) {
    // ディープコピー
    const blockCONST = CONST.BLOCK_LIST[id] || {};
    const shape = blockCONST.shape;
    const block = {
      id: id,
      color: blockCONST.color,
      shape: [], // blockの形状
      x: 0,
      y: 0,
      z: 0,
    };
    for ( let z = 0; z < CONST.VOXEL_LENGTH; ++z ) {
      block.shape[z] = [];
      for ( let y = 0; y < CONST.VOXEL_LENGTH; ++y ) {
        block.shape[z][y] = [];
        for ( let x = 0; x < CONST.VOXEL_LENGTH; ++x ) {
          block.shape[z][y][x] = shape[z][y][x] || 0;
        }
      }
    }
    this.emit('newblockcreated');
    return block;
  }
  
  createCurrentBlock() {
    if (!this.nextBlock) this.createNextBlock();
    this.currentBlock = this.nextBlock;
    this.currentBlock.x = CONST.START_X;
    this.currentBlock.y = CONST.START_Y;
    this.currentBlock.z = CONST.START_Z;
    this.emit('currentblockcreated');
  }
  
  createNextBlock() {
    const id = Math.floor(Math.random() * CONST.BLOCK_LIST.length);
    this.nextBlock = this.createBlock(id);
    this.emit('nextblockcreated');
  }
  
  freeze() {
    for ( let z = 0; z < CONST.VOXEL_LENGTH; ++z ) {
      for ( let y = 0; y < CONST.VOXEL_LENGTH; ++y ) {
        for ( let x = 0; x < CONST.VOXEL_LENGTH; ++x ) {
          const boardX = x + this.currentBlock.x;
          const boardY = y + this.currentBlock.y;
          const boardZ = z + this.currentBlock.z;
          if (!this.currentBlock.shape[z][y][x] || boardZ < 0) continue;
          this.board[boardZ][boardY][boardX] = this.currentBlock.shape[z][y][x] ? (this.currentBlock.id + 1) : 0;
        }
      }
    }
    this.emit('freeze');
  }
  
  checkClearLines() {
    const dfd = $.Deferred();
    
    const filledRowList = this.getFilledRowList();
    const clearLineLength = _.flattenDeep(filledRowList).length; // 同時消去ライン数
    
    if (!clearLineLength) {
      return;
    }
    // clear line drop
    dfd
      .resolve()
      .then(() => {
        const d = $.Deferred();
        const evt = {
          filledRowList: filledRowList,
          dfd: d,
        };
        this.emit('beforeDropClearLines', evt);
        return d.promise();
      })
      .then(() => this.dropRow(filledRowList))
      .then(() => {
        this.emit('afterDropClearLines');
        
        this.sumOfClearLines += clearLineLength;
        
        this.levelUp();
        this.setSpeed();
        this.calcScore(clearLineLength);
        
        if (clearLineLength > 0) this.emit('clearline');
      });
  }
  
  getFilledRowList() {
    const filledRowList = [];
    for ( let y = CONST.LOGICAL_ROWS - 1; y >= 0; --y ) {
      const filledRowListZ = [];
      const filledRowListX = [];
      for ( let z = 0; z < CONST.COLS; ++z ) {
        const isRowFilled = this.board[z][y].every(val => val !== 0);
        if (!isRowFilled) continue;
        filledRowListZ.push(z);
      }
      for ( let x = 0; x < CONST.COLS; ++x ) {
        const isRowFilled = this.board.every(val => val[y][x] !== 0);
        if (!isRowFilled) continue;
        filledRowListX.push(x);
      }
      filledRowList.push([filledRowListX, filledRowListZ]);
    }
    return filledRowList;
  }
  
  levelUp() {
    let goalLines = 0;
    for (let i = 0; i < this.level; i++) {
      goalLines += CONST.GOAL_LINES_RATE * (i + 1);
    }
    if (this.sumOfClearLines >= goalLines) {
      ++this.level;
    }
  }
  
  setSpeed(level = this.level) {
    this.tickInterval = CONST.TICK_INTERVAL - CONST.SPEEDUP_RATE * (level - 1);
  }
  
  calcScore(lines = 0) {
    this.score += (lines <= 1) ? lines : Math.pow(2, lines);
  }
  
  dropRow(filledRowList) {
    if (!filledRowList.length) return;
    filledRowList.forEach((row, y) => {
      let filledRowListX = row[0];
      let filledRowListZ = row[1];
      if (!filledRowListX.length && !filledRowListZ.length) return;
      filledRowListX.forEach((d) => {
        this.dropRowX(d, y);
      });
      filledRowListZ.forEach((d) => {
        this.dropRowZ(d, y);
      });
    });
  }
  
  dropRowX(x, targetY) {
    let beforeList = [];
    for ( let y = 0; y <= targetY; ++y ) {
      beforeList[y] = [];
      for ( let z = 0; z < CONST.COLS; ++z ) {
        beforeList[y][z] = this.board[z][y][x];
        this.board[z][y][x] = y ? beforeList[y - 1][z] : 0;
      }
    }
  }
  
  dropRowZ(z, targetY) {
    let beforeList = [];
    for ( let y = 0; y <= targetY; ++y ) {
      beforeList[y] = [];
      for ( let x = 0; x < CONST.COLS; ++x ) {
        beforeList[y][x] = this.board[z][y][x];
        this.board[z][y][x] = y ? beforeList[y - 1][x] : 0;
      }
    }
  }
  
  rotateBoard(board) {
    const last = CONST.COLS - 1;
    const newBoard = [];
    for ( let z = 0; z < CONST.COLS; ++z ) {
      newBoard[z] = [];
      for ( let y = 0; y < CONST.LOGICAL_ROWS; ++y ) {
        newBoard[z][y] = [];
        for ( let x = 0; x < CONST.COLS; ++x ) {
          newBoard[z][y][x] = board[last - x][y][z];
        }
      }
    }
    return newBoard;
  }
  
  dropBlockY(block = this.currentBlock) {
    let isValid = this.validate(0, 1, 0, block);
    while (isValid) {
      block.y++;
      isValid = this.validate(0, 1, 0, block);
    }
    return isValid;
  }
  
  moveBlockX(distance = 1) {
    const isValid = this.validate(distance, 0, 0);
    if (isValid) {
      this.currentBlock.x += distance;
      this.emit('blockmoved');
    }
    return isValid;
  }
  
  moveBlockY(distance = 1) {
    const isValid = this.validate(0, distance, 0);
    if (isValid) {
      this.currentBlock.y += distance;
      this.emit('blockmoved');
    }
    return isValid;
  }
  
  moveBlockZ(distance = 1) {
    const isValid = this.validate(0, 0, distance);
    if (isValid) {
      this.currentBlock.z += distance;
      this.emit('blockmoved');
    }
    return isValid;
  }
  
  rotateBlockXZ(sign = true) {
    const rotatedBlock = Object.assign({}, this.currentBlock);
    rotatedBlock.shape = this.rotateXZ(this.currentBlock.shape, sign);
    const isValid = this.validate(0, 0, 0, rotatedBlock);
    if (isValid) this.currentBlock = rotatedBlock;
    return isValid;
  }
  
  rotateBlockXY(sign = true) {
    const rotatedBlock = Object.assign({}, this.currentBlock);
    rotatedBlock.shape = this.rotateXY(this.currentBlock.shape, sign);
    const isValid = this.validate(0, 0, 0, rotatedBlock);
    if (isValid) this.currentBlock = rotatedBlock;
    return isValid;
  }
  
  rotateBlockZY(sign = true) {
    const rotatedBlock = Object.assign({}, this.currentBlock);
    rotatedBlock.shape = this.rotateZY(this.currentBlock.shape, sign);
    const isValid = this.validate(0, 0, 0, rotatedBlock);
    if (isValid) this.currentBlock = rotatedBlock;
    return isValid;
  }
  
  rotateXZ(shape, sign) { // x軸→z軸方向
    const last = CONST.VOXEL_LENGTH - 1;
    const newBlockShape = [];
    for ( let z = 0; z < CONST.VOXEL_LENGTH; ++z ) {
      newBlockShape[z] = [];
      for ( let y = 0; y < CONST.VOXEL_LENGTH; ++y ) {
        newBlockShape[z][y] = [];
        for ( let x = 0; x < CONST.VOXEL_LENGTH; ++x ) {
          if (sign) newBlockShape[z][y][x] = shape[last - x][y][z];
          else newBlockShape[z][y][x] = shape[x][y][last - z];
        }
      }
    }
    return newBlockShape;
  }
  
  rotateXY(shape, sign) { // x軸→y軸方向
    const last = CONST.VOXEL_LENGTH - 1;
    const newBlockShape = [];
    for ( let z = 0; z < CONST.VOXEL_LENGTH; ++z ) {
      newBlockShape[z] = [];
      for ( let y = 0; y < CONST.VOXEL_LENGTH; ++y ) {
        newBlockShape[z][y] = [];
        for ( let x = 0; x < CONST.VOXEL_LENGTH; ++x ) {
          if (sign) newBlockShape[z][y][x] = shape[z][last - x][y];
          else newBlockShape[z][y][x] = shape[z][x][last - y];
        }
      }
    }
    return newBlockShape;
  }
  
  rotateZY(shape, sign) { // z軸→y軸方向
    const last = CONST.VOXEL_LENGTH - 1;
    const newBlockShape = [];
    for ( let z = 0; z < CONST.VOXEL_LENGTH; ++z ) {
      newBlockShape[z] = [];
      for ( let y = 0; y < CONST.VOXEL_LENGTH; ++y ) {
        newBlockShape[z][y] = [];
        for ( let x = 0; x < CONST.VOXEL_LENGTH; ++x ) {
          if (sign) newBlockShape[z][y][x] = shape[y][last - z][x];
          else newBlockShape[z][y][x] = shape[last - y][z][x];
        }
      }
    }
    return newBlockShape;
  }
  
  validate(offsetX = 0, offsetY = 0, offsetZ = 0, block = this.currentBlock) {
    const nextX = block.x + offsetX;
    const nextY = block.y + offsetY;
    const nextZ = block.z + offsetZ;
    
    for ( let z = 0; z < CONST.VOXEL_LENGTH; ++z ) {
      for ( let y = 0; y < CONST.VOXEL_LENGTH; ++y ) {
        for ( let x = 0; x < CONST.VOXEL_LENGTH; ++x ) {
          let boardX = x + nextX;
          let boardY = y + nextY;
          let boardZ = z + nextZ;
          if (!block.shape[z][y][x]) continue;
          if ( typeof this.board[boardZ] === 'undefined' // 次の位置が盤面外なら
            || typeof this.board[boardZ][boardY] === 'undefined' // 盤面外なら
            || typeof this.board[boardZ][boardY][boardX] === 'undefined' // 盤面外なら
            || !!this.board[boardZ][boardY][boardX] // 次の位置にブロックがあれば
            || boardX < 0 // 壁
            || boardX >= CONST.COLS // 壁
            || boardZ < 0 // 壁
            || boardZ >= CONST.COLS // 壁
            || boardY >= CONST.LOGICAL_ROWS ) { // 底面
            
            return false;
          }
        }
      }
    }
    return true;
  }
  
  checkGameOver() {
    // ブロックの全てが画面外ならゲームオーバー
    let isGameOver = true;
    for ( let z = 0; z < CONST.VOXEL_LENGTH; ++z ) {
      for ( let y = 0; y < CONST.VOXEL_LENGTH; ++y ) {
        for ( let x = 0; x < CONST.VOXEL_LENGTH; ++x ) {
          let boardX = x + this.currentBlock.x;
          let boardY = y + this.currentBlock.y;
          let boardZ = z + this.currentBlock.z;
          if (boardY >= CONST.HIDDEN_ROWS) {
            isGameOver = false;
            break;
          }
        }
      }
    }
    return isGameOver;
  }
}
