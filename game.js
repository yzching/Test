const MAP_SIZE = 600;
const TOTAL_PLAYERS = 500;
const USER_ID = 0;
const VIEW_SIZE = 42;
const WIN_TERRITORY = 20;

const worldCanvas = document.getElementById('world');
const wctx = worldCanvas.getContext('2d');
const battleCanvas = document.getElementById('battle');
const bctx = battleCanvas.getContext('2d');

const ui = {
  castlePos: document.getElementById('castle-pos'),
  myTerritory: document.getElementById('my-territory'),
  mySoldiers: document.getElementById('my-soldiers'),
  marchingCount: document.getElementById('marching-count'),
  goal: document.getElementById('goal'),
  status: document.getElementById('status'),
  viewPos: document.getElementById('view-pos'),
  log: document.getElementById('battle-log'),
  start: document.getElementById('start-game'),
  pause: document.getElementById('pause-game'),
  resume: document.getElementById('resume-game'),
  nextTurn: document.getElementById('next-turn'),
  autoTurn: document.getElementById('auto-turn'),
};

const world = new Map();
const players = [];
const marches = [];
const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
let activeBattle = null;
let gameTimer = null;
let running = false;
const camera = { x: 0, y: 0 };

const key = (x, y) => `${x},${y}`;
const rand = (max) => Math.floor(Math.random() * max);

function getCell(x, y) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return null;
  return world.get(key(x, y)) || { owner: -1, isCastle: false };
}

function setCell(x, y, owner, isCastle = false) {
  world.set(key(x, y), { owner, isCastle });
}

function setOwner(x, y, owner) {
  const old = getCell(x, y);
  setCell(x, y, owner, old?.isCastle || false);
}

function neighbors(x, y) {
  return dirs.map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < MAP_SIZE && ny < MAP_SIZE);
}

function ownerCells(playerId) {
  const out = [];
  for (const [k, v] of world.entries()) {
    if (v.owner !== playerId) continue;
    out.push(k.split(',').map(Number));
  }
  return out;
}

function initWorld() {
  world.clear();
  players.length = 0;
  marches.length = 0;
  const occupied = new Set();

  for (let i = 0; i < TOTAL_PLAYERS; i += 1) {
    let x = rand(MAP_SIZE);
    let y = rand(MAP_SIZE);
    while (occupied.has(key(x, y))) {
      x = rand(MAP_SIZE);
      y = rand(MAP_SIZE);
    }
    occupied.add(key(x, y));
    players.push({
      id: i,
      x,
      y,
      territory: 1,
      soldiers: 30,
      color: i === USER_ID ? '#2e8bd5' : `hsl(${(i * 47) % 360} 68% 56%)`,
    });
    setCell(x, y, i, true);
  }

  const me = players[USER_ID];
  camera.x = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, me.x - Math.floor(VIEW_SIZE / 2)));
  camera.y = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, me.y - Math.floor(VIEW_SIZE / 2)));
}

function launchMarch(attackerId, targetX, targetY) {
  marches.push({ attackerId, targetX, targetY, remain: 2 + rand(3) });
}

function beginBattle(attackerId, defenderId, target) {
  const atk = 10;
  const def = defenderId === -1 ? 7 : 10;
  const units = [];
  for (let i = 0; i < atk; i += 1) units.push({ side: 'A', x: 0, y: i % 9, hp: 2 });
  for (let i = 0; i < def; i += 1) units.push({ side: 'D', x: 8, y: i % 9, hp: 2 });
  activeBattle = { attackerId, defenderId, target, units, turn: 1, winner: null };
  ui.log.textContent = `战斗开始 @(${target[0]},${target[1]}) 攻方${atk} vs 守方${def}`;
  ui.nextTurn.disabled = false;
  ui.autoTurn.disabled = false;
  drawBattle();
}

function alive(side) {
  return activeBattle.units.filter((u) => u.hp > 0 && u.side === side);
}

function moveOrAttack(unit, enemies) {
  if (unit.hp <= 0 || enemies.length === 0) return;
  const target = enemies.reduce((best, e) => {
    const d = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y);
    return d < best.d ? { d, e } : best;
  }, { d: Infinity, e: null }).e;

  const dist = Math.abs(target.x - unit.x) + Math.abs(target.y - unit.y);
  if (dist === 1) {
    target.hp -= 1;
    return;
  }

  const dx = target.x === unit.x ? 0 : (target.x > unit.x ? 1 : -1);
  const dy = target.y === unit.y ? 0 : (target.y > unit.y ? 1 : -1);
  const nx = Math.max(0, Math.min(8, unit.x + dx));
  const ny = Math.max(0, Math.min(8, unit.y + dy));
  const blocked = activeBattle.units.some((u) => u !== unit && u.hp > 0 && u.x === nx && u.y === ny);
  if (!blocked) {
    unit.x = nx;
    unit.y = ny;
  }
}

function finishBattle() {
  const attacker = players[activeBattle.attackerId];
  const [tx, ty] = activeBattle.target;
  if (activeBattle.winner === 'A') {
    const oldOwner = getCell(tx, ty).owner;
    setOwner(tx, ty, attacker.id);
    attacker.territory += 1;
    if (oldOwner >= 0 && oldOwner !== attacker.id) {
      players[oldOwner].territory = Math.max(0, players[oldOwner].territory - 1);
    }
    ui.log.textContent = `攻方胜利，占领 (${tx},${ty})`;
  } else {
    ui.log.textContent = `防守成功，未占领 (${tx},${ty})`;
  }

  attacker.soldiers = Math.max(0, attacker.soldiers - 5);
  activeBattle = null;
  ui.nextTurn.disabled = true;
  ui.autoTurn.disabled = true;
  updateGameState();
}

function runBattleTurn() {
  if (!activeBattle) return;
  const atk = alive('A');
  const def = alive('D');
  atk.forEach((u) => moveOrAttack(u, def.filter((x) => x.hp > 0)));
  def.forEach((u) => moveOrAttack(u, atk.filter((x) => x.hp > 0)));
  activeBattle.units = activeBattle.units.filter((u) => u.hp > 0);

  const a = alive('A').length;
  const d = alive('D').length;
  if (a === 0 || d === 0 || activeBattle.turn >= 45) {
    activeBattle.winner = a > d ? 'A' : 'D';
    finishBattle();
  } else {
    activeBattle.turn += 1;
    ui.log.textContent = `回合${activeBattle.turn}: 攻方${a} / 守方${d}`;
  }

  drawBattle();
  drawWorld();
}

function autoTurns(n) {
  let left = n;
  const timer = setInterval(() => {
    if (!activeBattle || left <= 0) {
      clearInterval(timer);
      return;
    }
    runBattleTurn();
    left -= 1;
  }, 120);
}

function pickAiTarget(player) {
  const mine = ownerCells(player.id);
  for (let i = 0; i < 16; i += 1) {
    const [x, y] = mine[rand(mine.length)] || [player.x, player.y];
    for (const [nx, ny] of neighbors(x, y)) {
      if (getCell(nx, ny).owner === -1) return [nx, ny];
    }
  }
  return null;
}

function processMarches() {
  for (let i = marches.length - 1; i >= 0; i -= 1) {
    marches[i].remain -= 1;
    if (marches[i].remain > 0) continue;
    const m = marches[i];
    marches.splice(i, 1);
    if (activeBattle) continue;
    if (getCell(m.targetX, m.targetY).owner !== -1) continue;
    beginBattle(m.attackerId, -1, [m.targetX, m.targetY]);
  }
}

function checkWinLose() {
  const me = players[USER_ID];
  if (me.territory >= WIN_TERRITORY) {
    ui.status.textContent = '你赢了 🎉';
    pauseGame();
    ui.log.textContent = '胜利条件达成：领土达到20';
    return true;
  }
  if (me.soldiers <= 0 && marches.length === 0 && !activeBattle) {
    ui.status.textContent = '失败 ❌';
    pauseGame();
    ui.log.textContent = '你已无兵可战，游戏结束';
    return true;
  }
  return false;
}

function tick() {
  if (!running) return;
  const me = players[USER_ID];
  me.soldiers += 2 + Math.floor(me.territory / 5);

  for (let i = 1; i < players.length; i += 1) {
    const p = players[i];
    p.soldiers += 1 + Math.floor(p.territory / 8);
    if (p.soldiers < 6) continue;
    const t = pickAiTarget(p);
    if (!t) continue;
    if (Math.random() < 0.28) {
      setOwner(t[0], t[1], p.id);
      p.territory += 1;
      p.soldiers -= 5;
    }
  }

  processMarches();
  updateGameState();
  checkWinLose();
}

function updateGameState() {
  const me = players[USER_ID];
  ui.castlePos.textContent = `${me.x}, ${me.y}`;
  ui.myTerritory.textContent = `${me.territory}`;
  ui.mySoldiers.textContent = `${me.soldiers}`;
  ui.marchingCount.textContent = `${marches.length}`;
  drawWorld();
}

function drawWorld() {
  const cell = worldCanvas.width / VIEW_SIZE;
  wctx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
  for (let gy = 0; gy < VIEW_SIZE; gy += 1) {
    for (let gx = 0; gx < VIEW_SIZE; gx += 1) {
      const wx = camera.x + gx;
      const wy = camera.y + gy;
      const c = getCell(wx, wy);
      let fill = '#60564a';
      if (c.owner === USER_ID) fill = '#2e8bd5';
      else if (c.owner >= 0) fill = players[c.owner].color;
      wctx.fillStyle = fill;
      wctx.fillRect(gx * cell, gy * cell, cell - 1, cell - 1);
      if (c.isCastle) {
        wctx.fillStyle = '#f7de84';
        wctx.fillRect(gx * cell + cell * 0.3, gy * cell + cell * 0.3, cell * 0.4, cell * 0.4);
      }
    }
  }

  marches.forEach((m) => {
    const mx = m.targetX - camera.x;
    const my = m.targetY - camera.y;
    if (mx < 0 || my < 0 || mx >= VIEW_SIZE || my >= VIEW_SIZE) return;
    wctx.fillStyle = '#fff';
    wctx.beginPath();
    wctx.arc(mx * cell + cell / 2, my * cell + cell / 2, Math.max(2, cell * 0.16), 0, Math.PI * 2);
    wctx.fill();
  });

  ui.viewPos.textContent = `视野: (${camera.x},${camera.y})`;
}

function drawBattle() {
  const size = 9;
  const cell = battleCanvas.width / size;
  bctx.clearRect(0, 0, battleCanvas.width, battleCanvas.height);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      bctx.fillStyle = (x + y) % 2 ? '#251f18' : '#332b22';
      bctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  if (!activeBattle) return;
  activeBattle.units.forEach((u) => {
    bctx.fillStyle = u.side === 'A' ? '#4fb4ff' : '#ff8f8f';
    bctx.beginPath();
    bctx.arc(u.x * cell + cell / 2, u.y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
    bctx.fill();
  });
}

function tryAttack(wx, wy) {
  const me = players[USER_ID];
  if (!running) return;
  if (activeBattle || me.soldiers < 5) return;
  if (getCell(wx, wy).owner !== -1) return;
  const adjacent = neighbors(wx, wy).some(([x, y]) => getCell(x, y).owner === USER_ID);
  if (!adjacent) return;
  launchMarch(USER_ID, wx, wy);
  ui.log.textContent = `行军出发 -> (${wx},${wy})`;
  updateGameState();
}

function moveCamera(dx, dy) {
  camera.x = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, camera.x + dx));
  camera.y = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, camera.y + dy));
  drawWorld();
}

function startGame() {
  initWorld();
  running = true;
  ui.status.textContent = '进行中';
  ui.log.textContent = '对局开始！请点击边界荒地发起进攻。';
  updateGameState();
  drawBattle();
  if (gameTimer) clearInterval(gameTimer);
  gameTimer = setInterval(tick, 1000);
}

function pauseGame() {
  running = false;
  ui.status.textContent = '已暂停';
}

function resumeGame() {
  if (players.length === 0) return;
  running = true;
  ui.status.textContent = '进行中';
}

worldCanvas.addEventListener('click', (e) => {
  const rect = worldCanvas.getBoundingClientRect();
  const cell = worldCanvas.width / VIEW_SIZE;
  const gx = Math.floor((e.clientX - rect.left) / cell);
  const gy = Math.floor((e.clientY - rect.top) / cell);
  tryAttack(camera.x + gx, camera.y + gy);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') moveCamera(-1, 0);
  if (e.key === 'ArrowRight') moveCamera(1, 0);
  if (e.key === 'ArrowUp') moveCamera(0, -1);
  if (e.key === 'ArrowDown') moveCamera(0, 1);
});

ui.start.addEventListener('click', startGame);
ui.pause.addEventListener('click', pauseGame);
ui.resume.addEventListener('click', resumeGame);
ui.nextTurn.addEventListener('click', runBattleTurn);
ui.autoTurn.addEventListener('click', () => autoTurns(10));

ui.goal.textContent = `占领${WIN_TERRITORY}块地获胜`;
ui.status.textContent = '等待开始';
drawWorld();
drawBattle();
