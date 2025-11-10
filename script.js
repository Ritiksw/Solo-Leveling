import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, firebaseOptions } from './firebase-config.js';

const STORAGE_KEY = 'soloGymPlayerId';

const state = {
  level: 1,
  xp: 0,
  xpToLevel: 120,
  energy: 100,
  energyMax: 100,
  stats: {
    strength: { label: 'Strength', value: 18, softCap: 260 },
    agility: { label: 'Agility', value: 14, softCap: 240 },
    endurance: { label: 'Endurance', value: 16, softCap: 280 },
    focus: { label: 'Focus', value: 12, softCap: 220 },
    aura: { label: 'Aura Sync', value: 10, softCap: 260 }
  },
  targets: null,
  bonusStacks: 0,
  effects: [],
  skills: {},
  logs: [],
  filter: 'all'
};

const actionBook = {
  strength: {
    name: 'Titan Lifts',
    energyCost: 18,
    xpGain: 26,
    stat: 'strength',
    statGain: 6,
    flavor: 'Crushed the Titan series with adaptive resistance platforms.'
  },
  agility: {
    name: 'Shadow Sprints',
    energyCost: 14,
    xpGain: 22,
    stat: 'agility',
    statGain: 5,
    flavor: 'Phased through an obstacle grid in 34.2 seconds.'
  },
  endurance: {
    name: 'Void Cycling',
    energyCost: 16,
    xpGain: 24,
    stat: 'endurance',
    statGain: 5,
    flavor: 'Maintained 170 BPM under zero-g resistance for 12 minutes.'
  },
  focus: {
    name: 'Mind Palace',
    energyCost: 12,
    xpGain: 18,
    stat: 'focus',
    statGain: 4,
    flavor: 'Cracked the mental dungeon; neural sync increased by 7%.'
  },
  raid: {
    name: 'Gate Raid',
    energyCost: 38,
    xpGain: 0,
    statGain: 0
  }
};

const skillLibrary = [
  {
    id: 'manual-reps',
    name: 'Manual Reps',
    desc: 'Baseline control. All stat gains are amplified by your determination.',
    tier: 'D',
    requirement: () => true
  },
  {
    id: 'shadow-momentum',
    name: 'Shadow Momentum',
    desc: 'Every third session refunds 25% energy. Stackable resonance.',
    tier: 'C',
    requirement: () => state.level >= 2
  },
  {
    id: 'hyper-anabolic',
    name: 'Hyper Anabolic Surge',
    desc: 'First workout after unlocking grants +75% XP and +2 bonus stat points.',
    tier: 'B',
    requirement: () => state.level >= 4
  },
  {
    id: 'monarch-redux',
    name: 'Monarch Redux',
    desc: 'Gate raids scale off total stats instead of randomness.',
    tier: 'A',
    requirement: () => totalPowerScore() >= 640
  },
  {
    id: 'shadow-legion',
    name: 'Shadow Legion Spotters',
    desc: 'Summons auto-trainers that harvest +1 stat per minute while above 60 energy.',
    tier: 'S',
    requirement: () => state.level >= 8
  }
];

const xpFill = document.getElementById('xp-fill');
const xpText = document.getElementById('xp-text');
const levelText = document.getElementById('level');
const energyFill = document.getElementById('energy-fill');
const energyText = document.getElementById('energy-text');
const statGrid = document.getElementById('stat-grid');
const statTemplate = document.getElementById('stat-template');
const skillGrid = document.getElementById('skill-grid');
const skillTemplate = document.getElementById('skill-template');
const questList = document.getElementById('quest-list');
const questTemplate = document.getElementById('quest-template');
const questTitle = document.getElementById('quest-title');
const questSubtitle = document.getElementById('quest-subtitle');
const questTimer = document.getElementById('quest-timer');
const notificationStack = document.getElementById('notification-stack');
const logFeed = document.getElementById('log-feed');
const recalibrateButton = document.getElementById('recalibrate-targets');

const statElements = {};

let firebaseApp = null;
let db = null;
let playerDocRef = null;
let saveTimeout = null;
let stateDirty = false;
let legionTicker = 0;
let suppressPersistence = false;
let targetRenderQueued = false;

async function init() {
  state.targets = state.targets ?? generateDefaultTargets();
  renderStats();
  renderSkills();
  renderTargets();
  updateCoreHud();
  bindActions();
  bindFilters();
  bindTargetControls();
  unlockSkills();
  addLog('status', 'Shadow training shell initialized.');
  addLog('status', 'Manual Reps protocol loaded. Awaiting commands.');
  updateActionStates();
  await initFirebase();
  setInterval(tickEffects, 1000);
  setInterval(regenEnergy, 6000);
}

function bindActions() {
  document.querySelectorAll('.action').forEach(button => {
    button.addEventListener('click', () => {
      const actionKey = button.dataset.action;
      if (actionKey === 'raid') {
        handleRaid();
      } else {
        executeTraining(actionKey);
      }
    });
  });
}

function bindTargetControls() {
  if (!recalibrateButton) return;
  recalibrateButton.addEventListener('click', () => {
    recalibrateTargets();
  });
}

function bindFilters() {
  document.querySelectorAll('.filter').forEach(filterBtn => {
    filterBtn.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(btn => btn.classList.remove('active'));
      filterBtn.classList.add('active');
      state.filter = filterBtn.dataset.filter;
      renderLogs();
    });
  });
}

function executeTraining(actionKey) {
  const action = actionBook[actionKey];
  if (!action) return;

  if (state.energy < action.energyCost) {
    addLog('alert', `Insufficient energy for ${action.name}. Initiate recovery protocols.`);
    return;
  }

  state.energy -= action.energyCost;
  let xpGain = action.xpGain;
  let statGain = action.statGain;

  if (consumeEffect('hyper-anabolic')) {
    xpGain = Math.round(xpGain * 1.75);
    statGain += 2;
    addLog('status', 'Hyper Anabolic Surge triggered. Stats amplified.');
  }

  state.bonusStacks = (state.bonusStacks + 1) % 3;
  if (state.bonusStacks === 0 && state.skills['shadow-momentum']) {
    const refund = Math.round(action.energyCost * 0.25);
    state.energy = Math.min(state.energy + refund, state.energyMax);
    addLog('status', `Shadow Momentum refunds ${refund} energy.`);
  }

  addXp(xpGain);
  addStat(action.stat, statGain);
  addLog('status', action.flavor);

  maybeTriggerEvent(actionKey);
  updateCoreHud();
  updateActionStates();
  checkTargetProgress();
  requestTargetRender();
  markStateDirty();
}

function handleRaid() {
  const action = actionBook.raid;
  if (state.energy < action.energyCost) {
    addLog('alert', 'Gate Raid denied. Energy core at critical levels.');
    return;
  }

  state.energy -= action.energyCost;
  const power = totalPowerScore();
  const difficulty = randomBetween(480, 820);
  const monarchUnlocked = !!state.skills['monarch-redux'];
  const variance = monarchUnlocked ? 0 : randomBetween(-90, 90);
  const raidScore = power + variance;

  if (raidScore >= difficulty) {
    const xpGain = Math.round(power / 6);
    const statGain = Math.max(4, Math.round(power / 180));
    addXp(xpGain);
    augmentAllStats(statGain);
    addLog('loot', `Gate conquered! Harvested ${xpGain} XP and team gains +${statGain} to all stats.`);
    if (Math.random() < 0.36) {
      triggerEffect({
        id: 'hyper-anabolic',
        duration: 1,
        label: 'Hyper Anabolic Surge primed.'
      });
      addLog('status', 'Hyper Anabolic Surge primed. Next workout enhanced.');
    }
  } else {
    const backlash = Math.round((difficulty - raidScore) / 18);
    state.energy = Math.max(0, state.energy - backlash);
    addLog('alert', `Raid backlash! Systems overloaded, -${backlash} energy.`);
  }

  updateCoreHud();
  updateActionStates();
  checkTargetProgress();
  requestTargetRender();
  markStateDirty();
}

function addXp(amount) {
  state.xp += amount;
  addLog('status', `Gained ${amount} XP.`);
  while (state.xp >= state.xpToLevel) {
    state.xp -= state.xpToLevel;
    levelUp();
  }
}

function levelUp() {
  state.level += 1;
  state.energyMax += 12;
  state.energy = state.energyMax;
  const statGain = 4 + Math.floor(state.level / 3);
  augmentAllStats(statGain);
  addLog('alert', `LEVEL UP! Ascended to Lv.${state.level}. Core stats +${statGain} each.`);
  pushNotification('ALARM', 'You leveled up!');

  state.xpToLevel = Math.round(state.xpToLevel * 1.32 + state.level * 18);
  unlockSkills();
  checkTargetProgress();
  requestTargetRender();
  markStateDirty();
}

function addStat(statKey, amount) {
  const stat = state.stats[statKey];
  if (!stat) return;
  const capBonus = state.level * 2;
  stat.value = Math.min(stat.value + amount, stat.softCap + capBonus);
  addLog('status', `${stat.label} increased by ${amount}.`);
  updateStatCard(statKey, stat);
}

function augmentAllStats(amount) {
  Object.entries(state.stats).forEach(([key, stat]) => {
    stat.value = Math.min(stat.value + amount, stat.softCap + state.level * 2);
    updateStatCard(key, stat);
  });
  checkTargetProgress();
  requestTargetRender();
}

function unlockSkills() {
  let unlocked = false;
  skillLibrary.forEach(skill => {
    if (skill.requirement() && !state.skills[skill.id]) {
      state.skills[skill.id] = { ...skill };
      unlocked = true;
      addLog('loot', `Skill unlocked: ${skill.name} (${skill.tier}).`);
      if (skill.id === 'hyper-anabolic') {
        triggerEffect({
          id: 'hyper-anabolic',
          duration: 1,
          label: 'Hyper Anabolic Surge primed.'
        });
      }
    }
  });
  if (unlocked) {
    renderSkills();
    markStateDirty();
  }
}

function triggerEffect(effect) {
  const existing = state.effects.find(e => e.id === effect.id);
  if (existing) {
    existing.duration = effect.duration;
  } else {
    state.effects.push({ ...effect });
  }
}

function consumeEffect(effectId) {
  const effect = state.effects.find(e => e.id === effectId && e.duration > 0);
  if (effect) {
    effect.duration -= 1;
    if (effect.duration <= 0) {
      state.effects = state.effects.filter(e => e.duration > 0);
    }
    return true;
  }
  return false;
}

function tickEffects() {
  legionTicker += 1;
  if (state.skills['shadow-legion'] && state.energy > 60 && legionTicker >= 60) {
    legionTicker = 0;
    augmentAllStats(1);
    addLog('status', 'Shadow Legion Spotters auto-train +1 to all stats.');
    markStateDirty();
  }
  state.effects = state.effects.filter(effect => effect.duration > 0);
  updateCoreHud();
}

function regenEnergy() {
  if (state.energy >= state.energyMax) return;
  const regen = Math.max(4, Math.round(state.energyMax * 0.06));
  state.energy = Math.min(state.energy + regen, state.energyMax);
  updateCoreHud();
  updateActionStates();
}

function maybeTriggerEvent(actionKey) {
  const luckyRoll = Math.random();
  if (luckyRoll < 0.12) {
    const bonusXp = randomBetween(12, 28);
    addXp(bonusXp);
    addLog('loot', `Shadow Monarch grants ${bonusXp} bonus XP.`);
    pushNotification('NOTIFICATION', 'You have received a reward.\n[Penalty Quest: Survival]\nCheck your reward?', [
      { label: 'Yes' },
      { label: 'No' }
    ]);
  } else if (luckyRoll < 0.22) {
    const shield = Math.round(state.energyMax * 0.15);
    state.energy = Math.min(state.energy + shield, state.energyMax);
    addLog('status', `Void shield pulses. Energy +${shield}.`);
    pushNotification('SYSTEM NOTICE', 'Void shield reinforcement detected.');
  } else if (luckyRoll > 0.92) {
    const drain = randomBetween(10, 18);
    state.energy = Math.max(0, state.energy - drain);
    addLog('alert', `Overexertion detected during ${actionBook[actionKey].name}. Energy -${drain}.`);
    pushNotification('WARNING', 'Overexertion detected during training.');
  }
}

function renderStats() {
  Object.entries(state.stats).forEach(([key, stat]) => {
    const clone = statTemplate.content.cloneNode(true);
    const card = clone.querySelector('.stat-card');
    const title = clone.querySelector('.stat-title');
    const value = clone.querySelector('.stat-value');
    const fill = clone.querySelector('.stat-bar-fill');

    title.textContent = stat.label;
    value.textContent = stat.value;
    fill.style.width = calcStatFill(stat) + '%';

    statGrid.appendChild(clone);
    statElements[key] = { card, title, value, fill };
  });
}

function updateStatCard(key, stat) {
  const element = statElements[key];
  if (!element) return;
  element.value.textContent = stat.value;
  element.fill.style.width = calcStatFill(stat) + '%';
}

function calcStatFill(stat) {
  const cap = stat.softCap + state.level * 2;
  return Math.min(100, Math.round((stat.value / cap) * 100));
}

function renderSkills() {
  skillGrid.innerHTML = '';
  skillLibrary.forEach(skill => {
    const clone = skillTemplate.content.cloneNode(true);
    const card = clone.querySelector('.skill-card');
    const name = clone.querySelector('.skill-name');
    const desc = clone.querySelector('.skill-desc');
    const tier = clone.querySelector('.skill-tier');

    name.textContent = skill.name;
    desc.textContent = skill.desc;
    tier.textContent = `Tier ${skill.tier}`;

    if (!state.skills[skill.id]) {
      card.classList.add('locked');
      card.dataset.locked = 'Locked';
    }

    skillGrid.appendChild(clone);
  });
}

function renderTargets() {
  if (!questList || !questTemplate) return;
  const targets = state.targets ?? generateDefaultTargets();
  questList.innerHTML = '';

  const entries = [];

  if (Number.isFinite(targets.level)) {
    entries.push({
      key: 'level',
      label: `Ascend to Lv. ${targets.level}`,
      current: state.level,
      goal: targets.level,
      displayCurrent: `Lv. ${state.level}`,
      displayGoal: `Lv. ${targets.level}`
    });
  }

  Object.entries(targets.stats ?? {}).forEach(([key, goal]) => {
    const stat = state.stats[key];
    if (!stat || !Number.isFinite(goal)) return;
    entries.push({
      key,
      label: `${stat.label} Training`,
      current: stat.value,
      goal,
      displayCurrent: `${stat.value} pts`,
      displayGoal: `${goal} pts`
    });
  });

  if (Number.isFinite(targets.raidPower)) {
    entries.push({
      key: 'raidPower',
      label: 'Gate Power Threshold',
      current: totalPowerScore(),
      goal: targets.raidPower,
      displayCurrent: `${totalPowerScore()} Power`,
      displayGoal: `${targets.raidPower} Power`
    });
  }

  entries.forEach(entry => {
    const goal = Math.max(entry.goal, 1);
    const percent = Math.min(100, Math.round((entry.current / goal) * 100));
    const clone = questTemplate.content.cloneNode(true);
    const card = clone.querySelector('.quest-item');
    const status = clone.querySelector('.quest-item-status');
    const label = clone.querySelector('.quest-item-label');
    const progress = clone.querySelector('.quest-item-progress');
    const fill = clone.querySelector('.quest-item-fill');

    const complete = entry.current >= entry.goal;
    status.textContent = complete ? '(COMPLETE)' : '(INCOMPLETE)';
    label.textContent = entry.label;
    const currentText = entry.displayCurrent ?? entry.current;
    const goalText = entry.displayGoal ?? entry.goal;
    progress.textContent = `[${currentText} / ${goalText}]`;
    fill.style.width = `${Math.max(4, percent)}%`;

    if (complete) {
      card.classList.add('completed');
    }

    questList.appendChild(clone);
  });

  if (questTitle) {
    questTitle.textContent = 'Daily Quest — Getting Ready To Become Powerful';
  }

  if (questSubtitle) {
    questSubtitle.textContent = 'Complete the assigned regimen before the System retaliates.';
  }

  if (questTimer) {
    questTimer.textContent = 'System surveillance active.';
  }
}

function requestTargetRender(force = false) {
  if (!questList || !questTemplate) return;
  if (force) {
    targetRenderQueued = false;
    renderTargets();
    return;
  }
  if (targetRenderQueued) return;
  targetRenderQueued = true;
  requestAnimationFrame(() => {
    renderTargets();
    targetRenderQueued = false;
  });
}

function recalibrateTargets() {
  state.targets = generateDefaultTargets();
  addLog('status', 'Mission targets recalibrated by System Handler.');
  requestTargetRender(true);
  markStateDirty();
  pushNotification('NOTICE', 'Quest directives recalibrated by the System Handler.');
}

function checkTargetProgress() {
  if (!state.targets) return;
  let recalculated = false;

  if (Number.isFinite(state.targets.level) && state.level >= state.targets.level) {
    addLog('loot', `Ascension target achieved: Lv.${state.level}.`);
    state.targets.level = state.level + 1;
    recalculated = true;
    pushNotification('QUEST UPDATE', `Ascension objective cleared at Lv.${state.level}.`);
  }

  if (Number.isFinite(state.targets.raidPower)) {
    const power = totalPowerScore();
    if (power >= state.targets.raidPower) {
      addLog('loot', `Raid readiness threshold hit: ${power} power.`);
      state.targets.raidPower = power + 160;
      recalculated = true;
      pushNotification('QUEST UPDATE', 'Gate power threshold secured.');
    }
  }

  Object.entries(state.targets.stats ?? {}).forEach(([key, goal]) => {
    const stat = state.stats[key];
    if (!stat || !Number.isFinite(goal)) return;
    if (stat.value >= goal) {
      addLog('loot', `${stat.label} target cleared at ${stat.value}.`);
      state.targets.stats[key] = goal + randomBetween(18, 32);
      recalculated = true;
      pushNotification('QUEST UPDATE', `${stat.label} regimen complete.`);
    }
  });

  if (recalculated) {
    requestTargetRender(true);
    markStateDirty();
  }
}

function updateCoreHud() {
  levelText.textContent = `LV. ${state.level}`;
  const xpPercent = Math.min(100, Math.round((state.xp / state.xpToLevel) * 100));
  xpFill.style.width = `${xpPercent}%`;
  xpText.textContent = `${state.xp} / ${state.xpToLevel}`;

  const energyPercent = Math.min(100, Math.round((state.energy / state.energyMax) * 100));
  energyFill.style.width = `${energyPercent}%`;
  energyText.textContent = `${state.energy} / ${state.energyMax}`;
}

function updateActionStates() {
  document.querySelectorAll('.action').forEach(button => {
    const actionKey = button.dataset.action;
    const cost = actionBook[actionKey]?.energyCost ?? 0;
    button.disabled = state.energy < cost;
  });
}

function addLog(type, message) {
  const timestamp = new Date();
  state.logs.push({ type, message, timestamp });
  if (state.logs.length > 120) {
    state.logs.shift();
  }
  renderLogs();
}

function renderLogs() {
  logFeed.innerHTML = '';
  const filtered = state.logs.filter(entry => state.filter === 'all' || entry.type === state.filter);
  filtered.slice(-40).reverse().forEach(entry => {
    const node = document.createElement('div');
    node.className = `log-entry ${entry.type}`;
    node.innerHTML = `
      <span class="timestamp">${formatTimestamp(entry.timestamp)}</span>
      <span class="message">${entry.message}</span>
    `;
    logFeed.appendChild(node);
  });
  logFeed.scrollTop = 0;
}

function formatTimestamp(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function totalPowerScore() {
  return Object.values(state.stats).reduce((acc, stat) => acc + stat.value, 0);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function markStateDirty() {
  if (suppressPersistence) return;
  if (!firebaseOptions.enabled || !db || !playerDocRef) return;
  stateDirty = true;
  scheduleSave();
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveStateToFirebase, 1400);
}

async function saveStateToFirebase() {
  if (!stateDirty || !db || !playerDocRef) return;
  stateDirty = false;
  try {
    await setDoc(playerDocRef, serializeState(), { merge: true });
  } catch (error) {
    console.error('Failed to persist state', error);
    stateDirty = true;
  }
}

function serializeState() {
  const stats = {};
  Object.entries(state.stats).forEach(([key, stat]) => {
    stats[key] = stat.value;
  });

  return {
    level: state.level,
    xp: state.xp,
    xpToLevel: state.xpToLevel,
    energy: state.energy,
    energyMax: state.energyMax,
    stats,
    skills: Object.keys(state.skills),
    targets: state.targets,
    bonusStacks: state.bonusStacks,
    updatedAt: Date.now()
  };
}

async function initFirebase() {
  if (!firebaseOptions.enabled) {
    addLog('status', 'Cloud sync offline. Update firebase-config.js to enable Firebase.');
    return;
  }

  try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    const playerId = getOrCreatePlayerId();
    playerDocRef = doc(db, 'soloGymPlayers', playerId);

    suppressPersistence = true;
    const snapshot = await getDoc(playerDocRef);
    if (snapshot.exists()) {
      applyRemoteState(snapshot.data());
      addLog('status', 'Firebase link established. Progress synchronized.');
    } else {
      await setDoc(playerDocRef, serializeState());
      addLog('status', 'Firebase profile created. Progress will sync automatically.');
    }
  } catch (error) {
    console.error('Firebase initialization failed', error);
    addLog('alert', 'Firebase link failed. Verify configuration and console output.');
  } finally {
    suppressPersistence = false;
  }
}

function applyRemoteState(data) {
  if (!data) return;

  state.level = data.level ?? state.level;
  state.xp = data.xp ?? state.xp;
  state.xpToLevel = data.xpToLevel ?? state.xpToLevel;
  state.energy = data.energy ?? state.energy;
  state.energyMax = data.energyMax ?? state.energyMax;
  state.bonusStacks = data.bonusStacks ?? state.bonusStacks;

  if (data.stats) {
    Object.entries(data.stats).forEach(([key, value]) => {
      if (state.stats[key]) {
        state.stats[key].value = value;
      }
    });
  }

  state.targets = data.targets ?? state.targets ?? generateDefaultTargets();

  state.skills = {};
  const unlocked = Array.isArray(data.skills) ? data.skills : [];
  unlocked.forEach(id => {
    const skill = skillLibrary.find(item => item.id === id);
    if (skill) {
      state.skills[id] = { ...skill };
    }
  });

  Object.entries(state.stats).forEach(([key, stat]) => updateStatCard(key, stat));
  renderSkills();
  requestTargetRender(true);
  updateCoreHud();
  updateActionStates();
  unlockSkills();
}

function generateDefaultTargets() {
  const statTargets = {};
  Object.entries(state.stats).forEach(([key, stat]) => {
    statTargets[key] = stat.value + randomBetween(18, 32);
  });
  return {
    level: state.level + 1,
    raidPower: totalPowerScore() + 140,
    stats: statTargets,
    createdAt: Date.now()
  };
}

function getOrCreatePlayerId() {
  try {
    let playerId = localStorage.getItem(STORAGE_KEY);
    if (!playerId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        playerId = crypto.randomUUID();
      } else {
        playerId = `player-${Math.random().toString(36).slice(2, 10)}`;
      }
      localStorage.setItem(STORAGE_KEY, playerId);
    }
    return playerId;
  } catch (error) {
    console.warn('localStorage unavailable, using session-bound id.', error);
    return `session-${Date.now()}`;
  }
}

function pushNotification(title, message, actions = []) {
  if (!notificationStack) return;
  const card = document.createElement('div');
  card.className = 'notification-card';

  const titleNode = document.createElement('div');
  titleNode.className = 'notification-title';
  titleNode.textContent = title;

  const messageNode = document.createElement('div');
  messageNode.className = 'notification-message';
  messageNode.textContent = message;

  card.appendChild(titleNode);
  card.appendChild(messageNode);

  if (Array.isArray(actions) && actions.length > 0) {
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'notification-actions';
    actions.forEach(option => {
      const config = typeof option === 'string' ? { label: option } : option;
      const button = document.createElement('button');
      button.textContent = config.label ?? 'OK';
      button.addEventListener('click', () => {
        if (typeof config.onClick === 'function') {
          config.onClick();
        }
        dismiss();
      });
      actionsWrap.appendChild(button);
    });
    card.appendChild(actionsWrap);
  }

  notificationStack.appendChild(card);
  requestAnimationFrame(() => card.classList.add('visible'));

  function dismiss() {
    card.classList.remove('visible');
    setTimeout(() => {
      if (card.parentElement) {
        card.parentElement.removeChild(card);
      }
    }, 260);
  }

  if (!actions || actions.length === 0) {
    setTimeout(dismiss, 4200);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});

