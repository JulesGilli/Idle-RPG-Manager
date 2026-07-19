/**
 * Popup du companion. Philosophie egress : UN SEUL fetch à l'ouverture (ou sur
 * « rafraîchir »), puis tout est recalculé en LOCAL chaque seconde — le farm
 * avance à 1 combat / 20 s depuis `last_resolved_at`, les expéditions et les
 * cooldowns de donjon sont de simples comptes à rebours. Zéro polling serveur.
 */
import { SECONDS_PER_FIGHT, OFFLINE_FIGHT_CAP, dungeonCooldownSeconds } from './config.js';
import { ensureSession, signIn, signOut, rest } from './api.js';

const $ = (id) => document.getElementById(id);

let session = null;
let data = null; // { deployments, expeditions, dungeonTypes, lastRunAt }
let tickId = null;

/* ------------------------------------------------------------------ FORMAT */

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

function esc(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

/* ------------------------------------------------------------------ FETCH */

async function loadData() {
  const [deployments, expeditions, dungeonTypes, dungeonRuns] = await Promise.all([
    rest(session, 'deployments?select=id,mode,last_resolved_at,blocked,level:levels(name)&order=created_at'),
    rest(
      session,
      'expedition_runs?select=id,ends_at,expedition_type:expedition_types(name)&status=eq.in_progress&order=ends_at',
    ),
    rest(session, 'dungeon_types?select=id,name,tier&order=tier'),
    // RLS « select own » : seuls les runs du joueur. On ne garde que le dernier par donjon.
    rest(session, 'dungeon_runs?select=dungeon_type_id,created_at&order=created_at.desc&limit=200'),
  ]);
  const lastRunAt = {};
  for (const r of dungeonRuns) {
    if (!(r.dungeon_type_id in lastRunAt)) lastRunAt[r.dungeon_type_id] = Date.parse(r.created_at);
  }
  data = { deployments, expeditions, dungeonTypes, lastRunAt };
}

/* ------------------------------------------------------------------ RENDER */

function renderFarm(now) {
  if (data.deployments.length === 0) return '<p class="empty">Aucun groupe déployé.</p>';
  return data.deployments
    .map((d) => {
      const name = d.level?.name ?? 'Niveau inconnu';
      const mode = d.mode === 'loop' ? 'Boucle' : 'Progression';
      if (d.blocked) {
        return `<div class="card"><div class="row"><span class="name">${esc(name)}</span>
          <span class="status blocked">Bloqué — équipe vaincue</span></div>
          <div class="muted">${mode} · relance ton groupe en jeu</div></div>`;
      }
      const elapsed = Math.max(0, (now - Date.parse(d.last_resolved_at)) / 1000);
      const fights = Math.min(OFFLINE_FIGHT_CAP, Math.floor(elapsed / SECONDS_PER_FIGHT));
      const pct = Math.min(100, (fights / OFFLINE_FIGHT_CAP) * 100);
      const full = fights >= OFFLINE_FIGHT_CAP;
      const status = full
        ? '<span class="status ready">Plein — viens récolter !</span>'
        : `<span class="status">${fights} combats accumulés</span>`;
      const eta = full ? '' : `<div class="muted">Plein dans ${fmtDuration((OFFLINE_FIGHT_CAP - fights) * SECONDS_PER_FIGHT)} (${mode})</div>`;
      return `<div class="card"><div class="row"><span class="name">${esc(name)}</span>${status}</div>
        <div class="bar${full ? ' full' : ''}"><div style="width:${pct}%"></div></div>${eta}</div>`;
    })
    .join('');
}

function renderExpeditions(now) {
  if (data.expeditions.length === 0) return '<p class="empty">Aucune expédition en cours.</p>';
  return data.expeditions
    .map((e) => {
      const name = e.expedition_type?.name ?? 'Expédition';
      const remaining = (Date.parse(e.ends_at) - now) / 1000;
      const status =
        remaining <= 0
          ? '<span class="status ready">Terminée — récompenses à récupérer !</span>'
          : `<span class="status">Retour dans ${fmtDuration(remaining)}</span>`;
      return `<div class="card"><div class="row"><span class="name">${esc(name)}</span>${status}</div></div>`;
    })
    .join('');
}

function renderDungeons(now) {
  if (data.dungeonTypes.length === 0) return '<p class="empty">Aucun donjon.</p>';
  return data.dungeonTypes
    .map((t) => {
      const last = data.lastRunAt[t.id];
      const readyAt = last ? last + dungeonCooldownSeconds(t.tier) * 1000 : 0;
      const remaining = (readyAt - now) / 1000;
      const status =
        remaining <= 0
          ? '<span class="status ready">Prêt !</span>'
          : `<span class="status">Repos ${fmtDuration(remaining)}</span>`;
      return `<div class="card"><div class="row"><span class="name">T${t.tier} · ${esc(t.name)}</span>${status}</div></div>`;
    })
    .join('');
}

function render() {
  const now = Date.now();
  $('farm').innerHTML = renderFarm(now);
  $('expeditions').innerHTML = renderExpeditions(now);
  $('dungeons').innerHTML = renderDungeons(now);
}

/* ------------------------------------------------------------------ FLOW */

async function showDashboard() {
  $('login').hidden = true;
  $('dashboard').hidden = false;
  $('logout').hidden = false;
  $('refresh').hidden = false;
  $('who').textContent = session.email;
  $('loading').hidden = false;
  $('error').hidden = true;
  $('content').hidden = true;
  try {
    await loadData();
  } catch (err) {
    $('loading').hidden = true;
    $('error').textContent = err.message;
    $('error').hidden = false;
    return;
  }
  $('loading').hidden = true;
  $('content').hidden = false;
  render();
  clearInterval(tickId);
  tickId = setInterval(render, 1000);
}

function showLogin() {
  clearInterval(tickId);
  $('login').hidden = false;
  $('dashboard').hidden = true;
  $('logout').hidden = true;
  $('refresh').hidden = true;
  $('who').textContent = '';
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  btn.disabled = true;
  $('login-error').hidden = true;
  try {
    session = await signIn($('email').value.trim(), $('password').value);
    await showDashboard();
  } catch (err) {
    $('login-error').textContent = err.message;
    $('login-error').hidden = false;
  } finally {
    btn.disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  await signOut();
  session = null;
  showLogin();
});

$('refresh').addEventListener('click', () => void showDashboard());

(async function init() {
  session = await ensureSession();
  if (session) await showDashboard();
  else showLogin();
})();
