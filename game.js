const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');

const ui = {
  food: document.getElementById('food'),
  wood: document.getElementById('wood'),
  stone: document.getElementById('stone'),
  foodRate: document.getElementById('foodRate'),
  woodRate: document.getElementById('woodRate'),
  stoneRate: document.getElementById('stoneRate'),
  coin: document.getElementById('coin'),
  tip: document.getElementById('tip'),
};

const state = {
  food: 70049,
  wood: 65721,
  stone: 60922,
  coin: 12,
  zones: [
    { x: 370, y: 760, w: 220, h: 200 },
    { x: 300, y: 860, w: 280, h: 160 },
    { x: 220, y: 620, w: 360, h: 420 },
  ],
  buildings: [
    { name: '主城', x: 460, y: 860, type: 'castle', level: 9 },
    { name: '农庄', x: 520, y: 740, type: 'farm', level: 5 },
    { name: '农庄', x: 370, y: 740, type: 'farm', level: 4 },
    { name: '农庄', x: 380, y: 930, type: 'farm', level: 4 },
    { name: '农庄', x: 520, y: 960, type: 'farm', level: 3 },
  ],
  selectedBuilding: null,
};

function drawGround() {
  ctx.fillStyle = '#d7a55f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 420; i += 1) {
    const x = (i * 137) % canvas.width;
    const y = (i * 89) % canvas.height;
    ctx.fillStyle = i % 3 === 0 ? '#b88748' : '#e8c27f';
    ctx.fillRect(x, y, 8, 6);
    ctx.fillStyle = '#a9c661';
    if (i % 8 === 0) ctx.fillRect(x + 6, y - 1, 3, 3);
  }

  ctx.fillStyle = '#63b8c8';
  ctx.beginPath();
  ctx.roundRect(70, 100, 320, 90, 24);
  ctx.roundRect(380, 1290, 200, 180, 26);
  ctx.fill();

  ctx.fillStyle = '#7dc6d6';
  ctx.beginPath();
  ctx.roundRect(88, 110, 270, 55, 20);
  ctx.roundRect(395, 1320, 160, 120, 22);
  ctx.fill();
}

function drawZones() {
  ctx.strokeStyle = '#2e9ad6';
  ctx.lineWidth = 3;
  state.zones.forEach((zone) => {
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
  });
}

function drawBuilding(building) {
  const { x, y, type, name, level } = building;
  if (type === 'castle') {
    ctx.fillStyle = '#d4dbc7';
    ctx.fillRect(x - 36, y - 40, 72, 86);
    ctx.fillStyle = '#58a8b8';
    ctx.fillRect(x - 42, y - 47, 84, 18);
    ctx.fillStyle = '#845f42';
    ctx.fillRect(x - 10, y + 6, 20, 26);
    ctx.fillStyle = '#2f76c4';
    ctx.fillRect(x - 14, y - 12, 28, 22);
  } else {
    ctx.fillStyle = '#a6c4bf';
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4f8cc2';
    ctx.beginPath();
    ctx.arc(x, y - 20, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ead9b7';
    ctx.fillRect(x - 20, y + 2, 40, 20);
  }

  ctx.fillStyle = 'rgba(67, 45, 29, 0.8)';
  ctx.fillRect(x - 50, y - 72, 100, 24);
  ctx.fillStyle = '#fff';
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${name} Lv.${level}`, x, y - 55);

  if (state.selectedBuilding === building) {
    ctx.strokeStyle = '#ffe17e';
    ctx.lineWidth = 4;
    ctx.strokeRect(x - 44, y - 52, 88, 98);
  }
}

function draw() {
  drawGround();
  drawZones();
  state.buildings.forEach(drawBuilding);
}

function updateResources() {
  state.food += Math.floor(2 + Math.random() * 7);
  state.wood += Math.floor(2 + Math.random() * 8);
  state.stone += Math.floor(1 + Math.random() * 6);

  ui.food.textContent = state.food;
  ui.wood.textContent = state.wood;
  ui.stone.textContent = state.stone;
  ui.coin.textContent = state.coin;

  draw();
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

  const pick = state.buildings
    .map((b) => ({ b, d: distance({ x, y }, b) }))
    .sort((m, n) => m.d - n.d)[0];

  if (pick && pick.d < 52) {
    state.selectedBuilding = pick.b;
    ui.tip.textContent = `已选择 ${pick.b.name}（Lv.${pick.b.level}）。升级可提升资源产量。`;
  } else {
    state.selectedBuilding = null;
    ui.tip.textContent = '点击建筑查看信息，点击“扩张领地”创建新边界。';
  }

  draw();
});

document.getElementById('expand-btn').addEventListener('click', () => {
  if (state.coin < 2) {
    ui.tip.textContent = '金币不足，无法扩张。';
    return;
  }

  state.coin -= 2;
  const width = 180 + Math.floor(Math.random() * 120);
  const height = 140 + Math.floor(Math.random() * 120);
  const x = 130 + Math.floor(Math.random() * 520);
  const y = 500 + Math.floor(Math.random() * 540);
  state.zones.push({ x, y, w: width, h: height });

  ui.tip.textContent = '扩张成功！新的领土可建设更多农庄。';
  draw();
  updateResources();
});

setInterval(updateResources, 1000);
draw();
