const MAP_SIZE = 600;
const TOTAL_PLAYERS = 500;
const USER_ID = 0;
const VIEW_SIZE = 40;

const worldCanvas = document.getElementById('world');
const wctx = worldCanvas.getContext('2d');
const battleCanvas = document.getElementById('battle');
const bctx = battleCanvas.getContext('2d');

const ui = {
  castlePos: document.getElementById('castle-pos'),
  playerCount: document.getElementById('player-count'),
  myTerritory: document.getElementById('my-territory'),
  mySoldiers: document.getElementById('my-soldiers'),
  log: document.getElementById('battle-log'),
  nextTurn: document.getElementById('next-turn'),
};

const world = new Map();
const players = [];
let activeBattle = null;

function key(x, y) { return `${x},${y}`; }
function rand(max) { return Math.floor(Math.random() * max); }

function addCell(x, y, owner, isCastle = false) {
  world.set(key(x, y), { owner, isCastle });
}

function getCell(x, y) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return null;
  return world.get(key(x, y)) || { owner: -1, isCastle: false };
}

function setOwner(x, y, owner) {
  const k = key(x, y);
  const old = world.get(k);
  world.set(k, { owner, isCastle: old?.isCastle || false });
}

function neighbors(x, y) {
  return [
    [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
  ].filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < MAP_SIZE && ny < MAP_SIZE);
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
      color: i === USER_ID ? '#3da9ff' : `hsl(${(i * 37) % 360} 70% 55%)`,
    });
    addCell(x, y, i, true);
  }
}

function ownerCellsAround(player) {
  const list = [];
  for (const [k, v] of world.entries()) {
    if (v.owner !== player.id) continue;
    const [x, y] = k.split(',').map(Number);
    list.push([x, y]);
  }
  return list;
}

function findAttackTarget(player) {
  const cells = ownerCellsAround(player);
  for (let i = 0; i < 12; i += 1) {
    const [x, y] = cells[rand(cells.length)] || [player.x, player.y];
    const ns = neighbors(x, y);
    for (const [nx, ny] of ns) {
      if (getCell(nx, ny).owner === -1) return { from: [x, y], to: [nx, ny] };
    }
  }
  return null;
}

function buildBattle(attackerId, defenderId, target) {
  const attackerUnits = Array.from({ length: 10 }, (_, i) => ({ x: 0, y: i % 9, hp: 2, side: 'A' }));
  const defenderCount = defenderId === -1 ? 6 : 10;
  const defenderUnits = Array.from({ length: defenderCount }, (_, i) => ({ x: 8, y: i % 9, hp: 2, side: 'D' }));
  return {
    attackerId,
    defenderId,
    target,
    turn: 1,
    units: [...attackerUnits, ...defenderUnits],
    finished: false,
    winner: null,
  };
}

function alive(side) {
  return activeBattle.units.filter((u) => u.side === side && u.hp > 0);
}

function stepUnit(unit, enemies) {
  if (unit.hp <= 0) return;
  const near = enemies.reduce((best, e) => {
    const d = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y);
    return d < best.d ? { e, d } : best;
  }, { e: null, d: Infinity }).e;
  if (!near) return;

  const dist = Math.abs(near.x - unit.x) + Math.abs(near.y - unit.y);
  if (dist === 1) {
    near.hp -= 1;
    return;
  }

  const dx = near.x === unit.x ? 0 : (near.x > unit.x ? 1 : -1);
  const dy = near.y === unit.y ? 0 : (near.y > unit.y ? 1 : -1);
  const nx = Math.max(0, Math.min(8, unit.x + dx));
  const ny = Math.max(0, Math.min(8, unit.y + dy));

  const blocked = activeBattle.units.some((u) => u.hp > 0 && u !== unit && u.x === nx && u.y === ny);
  if (!blocked) {
    unit.x = nx;
    unit.y = ny;
  }
}

function runBattleTurn() {
  if (!activeBattle || activeBattle.finished) return;

  const attackers = alive('A');
  const defenders = alive('D');
  attackers.forEach((u) => stepUnit(u, defenders.filter((e) => e.hp > 0)));
  defenders.forEach((u) => stepUnit(u, attackers.filter((e) => e.hp > 0)));

  activeBattle.units = activeBattle.units.filter((u) => u.hp > 0);
  const a = alive('A').length;
  const d = alive('D').length;

  if (a === 0 || d === 0 || activeBattle.turn >= 40) {
    activeBattle.finished = true;
    activeBattle.winner = a > d ? 'A' : 'D';
    finalizeBattle();
  } else {
    activeBattle.turn += 1;
    ui.log.textContent = `回合 ${activeBattle.turn}: 攻方 ${a} / 守方 ${d}`;
  }

  drawBattle();
  drawWorld();
}

function finalizeBattle() {
  const attacker = players[activeBattle.attackerId];
  const [tx, ty] = activeBattle.target;

  if (activeBattle.winner === 'A') {
    const oldOwner = getCell(tx, ty).owner;
    setOwner(tx, ty, attacker.id);
    attacker.territory += 1;
    if (oldOwner >= 0 && oldOwner !== attacker.id) players[oldOwner].territory -= 1;
    ui.log.textContent = `战斗结束：攻方胜利，占领 (${tx},${ty})。`;
  } else {
    ui.log.textContent = `战斗结束：守方坚守成功。`;
  }

  attacker.soldiers = Math.max(0, attacker.soldiers - 5);
  activeBattle = null;
  ui.nextTurn.disabled = true;
  syncTopBar();
}

function tryUserAttack(x, y) {
  const me = players[USER_ID];
  if (me.soldiers < 5 || activeBattle) return;
  if (getCell(x, y).owner !== -1) return;

  const canReach = neighbors(x, y).some(([nx, ny]) => getCell(nx, ny).owner === USER_ID);
  if (!canReach) return;

  activeBattle = buildBattle(USER_ID, -1, [x, y]);
  ui.log.textContent = `发起进攻 (${x},${y})，点击“执行下一回合”推进战斗。`;
  ui.nextTurn.disabled = false;
  drawBattle();
}

function aiExpandTick() {
  for (let i = 1; i < players.length; i += 1) {
    const p = players[i];
    p.soldiers += 1 + Math.floor(p.territory / 6);
    if (p.soldiers < 6) continue;
    const t = findAttackTarget(p);
    if (!t) continue;
    if (Math.random() < 0.35) {
      setOwner(t.to[0], t.to[1], p.id);
      p.territory += 1;
      p.soldiers -= 5;
    }
  }
}

function economyTick() {
  const me = players[USER_ID];
  me.soldiers += 2 + Math.floor(me.territory / 4);
  aiExpandTick();
  syncTopBar();
  drawWorld();
}

function syncTopBar() {
  const me = players[USER_ID];
  ui.castlePos.textContent = `${me.x}, ${me.y}`;
  ui.playerCount.textContent = `${TOTAL_PLAYERS}`;
  ui.myTerritory.textContent = `${me.territory}`;
  ui.mySoldiers.textContent = `${me.soldiers}`;
}

function drawWorld() {
  const me = players[USER_ID];
  const startX = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, me.x - Math.floor(VIEW_SIZE / 2)));
  const startY = Math.max(0, Math.min(MAP_SIZE - VIEW_SIZE, me.y - Math.floor(VIEW_SIZE / 2)));
  const cell = worldCanvas.width / VIEW_SIZE;

  wctx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
  for (let y = 0; y < VIEW_SIZE; y += 1) {
    for (let x = 0; x < VIEW_SIZE; x += 1) {
      const wx = startX + x;
      const wy = startY + y;
      const c = getCell(wx, wy);
      let fill = '#5f5a52';
      if (c.owner === USER_ID) fill = '#2e8bd5';
      else if (c.owner >= 0) fill = players[c.owner].color;
      wctx.fillStyle = fill;
      wctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);

      if (c.isCastle) {
        wctx.fillStyle = '#ffe07a';
        wctx.fillRect(x * cell + cell * 0.32, y * cell + cell * 0.32, cell * 0.36, cell * 0.36);
      }
    }
  }

  wctx.strokeStyle = '#fff';
  wctx.lineWidth = 2;
  const ux = (me.x - startX) * cell;
  const uy = (me.y - startY) * cell;
  wctx.strokeRect(ux + 1, uy + 1, cell - 2, cell - 2);

  worldCanvas.dataset.startX = String(startX);
  worldCanvas.dataset.startY = String(startY);
}

function drawBattle() {
  const size = 9;
  const cell = battleCanvas.width / size;
  bctx.clearRect(0, 0, battleCanvas.width, battleCanvas.height);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      bctx.fillStyle = (x + y) % 2 === 0 ? '#2c2520' : '#201a15';
      bctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  if (!activeBattle) return;
  for (const unit of activeBattle.units) {
    bctx.fillStyle = unit.side === 'A' ? '#4fb4ff' : '#ff8f8f';
    bctx.beginPath();
    bctx.arc(unit.x * cell + cell / 2, unit.y * cell + cell / 2, cell * 0.28, 0, Math.PI * 2);
    bctx.fill();
  }
}

worldCanvas.addEventListener('click', (event) => {
  const rect = worldCanvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const cell = worldCanvas.width / VIEW_SIZE;
  const gx = Math.floor(px / cell);
  const gy = Math.floor(py / cell);
  const wx = Number(worldCanvas.dataset.startX) + gx;
  const wy = Number(worldCanvas.dataset.startY) + gy;
  tryUserAttack(wx, wy);
});

ui.nextTurn.addEventListener('click', runBattleTurn);

initPlayers();
syncTopBar();
drawWorld();
drawBattle();
setInterval(economyTick, 1200);
