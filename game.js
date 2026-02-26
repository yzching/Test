const MAP_SIZE = 600;
const TOTAL_PLAYERS = 500;
const USER_ID = 0;
const VIEW_SIZE = 42;

const worldCanvas = document.getElementById('world');
const wctx = worldCanvas.getContext('2d');
const battleCanvas = document.getElementById('battle');
const bctx = battleCanvas.getContext('2d');

const ui = {
  castlePos: document.getElementById('castle-pos'),
  playerCount: document.getElementById('player-count'),
  myTerritory: document.getElementById('my-territory'),
  mySoldiers: document.getElementById('my-soldiers'),
  marchingCount: document.getElementById('marching-count'),
  viewPos: document.getElementById('view-pos'),
  log: document.getElementById('battle-log'),
  nextTurn: document.getElementById('next-turn'),
  autoTurn: document.getElementById('auto-turn'),
};

const world = new Map();
const players = [];
const marches = [];
let activeBattle = null;

const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
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
  return dirs.map(([dx,dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < MAP_SIZE && ny < MAP_SIZE);
}

function initPlayers() {
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
}

function ownerCells(playerId) {
  const out = [];
  for (const [k, v] of world.entries()) {
    if (v.owner !== playerId) continue;
    const [x, y] = k.split(',').map(Number);
    out.push([x, y]);
  }
  return out;
}

function launchMarch(attackerId, targetX, targetY, steps = 3) {
  marches.push({ attackerId, targetX, targetY, remain: steps });
}

function beginBattle(attackerId, defenderId, target) {
  const attackerCount = 10;
  const defenderCount = defenderId === -1 ? 7 : 10;
  const units = [];

  for (let i = 0; i < attackerCount; i += 1) units.push({ side: 'A', x: 0, y: i % 9, hp: 2 });
  for (let i = 0; i < defenderCount; i += 1) units.push({ side: 'D', x: 8, y: i % 9, hp: 2 });

  activeBattle = { attackerId, defenderId, target, units, turn: 1, winner: null };
  ui.log.textContent = `战斗开始 @ (${target[0]},${target[1]})：攻方${attackerCount} vs 守方${defenderCount}`;
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
  const occupied = activeBattle.units.some((u) => u !== unit && u.hp > 0 && u.x === nx && u.y === ny);
  if (!occupied) {
    unit.x = nx;
    unit.y = ny;
  }
}

function finishBattle() {
  const attacker = players[activeBattle.attackerId];
  const [tx, ty] = activeBattle.target;

  if (activeBattle.winner === 'A') {
    const old = getCell(tx, ty).owner;
    setOwner(tx, ty, attacker.id);
    attacker.territory += 1;
    if (old >= 0 && old !== attacker.id) players[old].territory = Math.max(0, players[old].territory - 1);
    ui.log.textContent = `攻方胜利，占领 (${tx},${ty})。`;
  } else {
    ui.log.textContent = `守方胜利，(${tx},${ty}) 防守成功。`;
  }

  attacker.soldiers = Math.max(0, attacker.soldiers - 5);
  activeBattle = null;
  ui.nextTurn.disabled = true;
  ui.autoTurn.disabled = true;
  syncTop();
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
    ui.log.textContent = `回合${activeBattle.turn}：攻方 ${a} / 守方 ${d}`;
  }

  drawBattle();
  drawWorld();
}

function autoTurns(n) {
  let left = n;
  const t = setInterval(() => {
    if (!activeBattle || left <= 0) {
      clearInterval(t);
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
    const defender = getCell(m.targetX, m.targetY).owner;
    if (defender !== -1) continue;
    beginBattle(m.attackerId, defender, [m.targetX, m.targetY]);
  }
}

function economyTick() {
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
  syncTop();
  drawWorld();
}

function syncTop() {
  const me = players[USER_ID];
  ui.castlePos.textContent = `${me.x}, ${me.y}`;
  ui.playerCount.textContent = `${TOTAL_PLAYERS}`;
  ui.myTerritory.textContent = `${me.territory}`;
  ui.mySoldiers.textContent = `${me.soldiers}`;
  ui.marchingCount.textContent = `${marches.length}`;
}

function drawWorld() {
  const me = players[USER_ID];
  const startX = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, me.x - Math.floor(VIEW_SIZE / 2)));
  const startY = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, me.y - Math.floor(VIEW_SIZE / 2)));
  const cell = worldCanvas.width / VIEW_SIZE;

  wctx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);

  for (let gy = 0; gy < VIEW_SIZE; gy += 1) {
    for (let gx = 0; gx < VIEW_SIZE; gx += 1) {
      const wx = startX + gx;
      const wy = startY + gy;
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

  for (const m of marches) {
    const mx = m.targetX - startX;
    const my = m.targetY - startY;
    if (mx < 0 || my < 0 || mx >= VIEW_SIZE || my >= VIEW_SIZE) continue;
    wctx.fillStyle = '#ffffff';
    wctx.beginPath();
    wctx.arc(mx * cell + cell / 2, my * cell + cell / 2, Math.max(2, cell * 0.15), 0, Math.PI * 2);
    wctx.fill();
  }

  worldCanvas.dataset.startX = String(startX);
  worldCanvas.dataset.startY = String(startY);
  ui.viewPos.textContent = `视野: (${startX},${startY})`;
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
  for (const u of activeBattle.units) {
    bctx.fillStyle = u.side === 'A' ? '#4fb4ff' : '#ff8f8f';
    bctx.beginPath();
    bctx.arc(u.x * cell + cell / 2, u.y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
    bctx.fill();
  }
}

function tryAttack(wx, wy) {
  const me = players[USER_ID];
  if (activeBattle || me.soldiers < 5) return;
  if (getCell(wx, wy).owner !== -1) return;
  const adjacent = neighbors(wx, wy).some(([x, y]) => getCell(x, y).owner === USER_ID);
  if (!adjacent) return;
  launchMarch(USER_ID, wx, wy, 2 + rand(3));
  ui.log.textContent = `已派遣行军前往 (${wx},${wy})，抵达后将自动开战。`;
  syncTop();
  drawWorld();
}

worldCanvas.addEventListener('click', (e) => {
  const rect = worldCanvas.getBoundingClientRect();
  const cell = worldCanvas.width / VIEW_SIZE;
  const gx = Math.floor((e.clientX - rect.left) / cell);
  const gy = Math.floor((e.clientY - rect.top) / cell);
  const wx = Number(worldCanvas.dataset.startX) + gx;
  const wy = Number(worldCanvas.dataset.startY) + gy;
  tryAttack(wx, wy);
});

ui.nextTurn.addEventListener('click', runBattleTurn);
ui.autoTurn.addEventListener('click', () => autoTurns(10));

initPlayers();
syncTop();
drawWorld();
drawBattle();
setInterval(economyTick, 1200);
