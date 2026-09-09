// Review, conflict resolution, history and account controls for the local dashboard.
let savedDashboard = null;
let safetyUser = null;
let safetyBusy = false;
const safetyCopy = value => JSON.parse(JSON.stringify(value));
const safetyEqual = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => safetyEqual(value, b[index]));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && safetyEqual(a[key], b[key]));
};
const editableSections = ['leaderboard', 'basicEdLeaderboard', 'specialEvents', 'displaySettings', 'matches', 'matches2', 'announcements', 'media'];
function safetyTeam(id) {
  const basic = typeof departments === 'undefined' ? null : Object.values(departments).flatMap(d => d.teams).find(t => t.id === id);
  return basic?.name || TEAMS[id]?.team || id;
}
function safetyCells(data) {
  const cells = {};
  editableSections.forEach(section => {
    if (data[section] === undefined) return;
    if (['leaderboard', 'basicEdLeaderboard', 'specialEvents'].includes(section)) {
      const key = section === 'leaderboard' ? 'dept' : section === 'specialEvents' ? 'eventId' : 'teamId';
      data[section].forEach(row => { cells[section + '/' + row[key]] = section === 'specialEvents' ? row.winnerTeamId : Number(row.points); });
    } else if (section === 'displaySettings') {
      Object.entries(data.displaySettings.sections).forEach(([id, value]) => { cells[section + '/' + id] = value; });
    } else cells[section] = data[section];
  });
  return cells;
}
function safetyLabel(key) {
  const [section, id] = key.split('/');
  if (section === 'leaderboard' || section === 'basicEdLeaderboard') return safetyTeam(id);
  if (section === 'specialEvents') return ({cheerdance:'Cheerdance winner',bench:'Bench cheering winner',mr:'Mr. Sportsfest winner',ms:'Ms. Sportsfest winner'})[id] || id;
  if (section === 'displaySettings') return 'TV section: ' + (typeof DISPLAY_SECTIONS !== 'undefined' ? DISPLAY_SECTIONS.find(item => item.id === id)?.label || id : id);
  return ({matches:'Matches 1', matches2:'Matches 2', announcements:'Announcements', media:'Online media'})[section] || section;
}
function safetyValue(value, key) {
  if (value === undefined) return 'Not set';
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (key.startsWith('specialEvents/')) return value ? safetyTeam(value) : 'To be announced';
  if (Array.isArray(value)) return value.length ? value.map((row, i) => {
    const labels = {teamA:'Team A', teamB:'Team B', date:'Date', time:'Time', sport:'Sport', venue:'Venue', status:'Status', active:'Visible on TV', message:'Message', url:'Link', type:'Type', title:'Title'};
    return 'Item ' + (i + 1) + '\n' + Object.entries(row).map(([field, val]) => {
      const label = labels[field] || field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase());
      const text = field === 'teamA' || field === 'teamB' ? safetyTeam(val) : typeof val === 'boolean' ? (val ? 'Yes' : 'No') : val === '' || val == null ? 'Not set' : val;
      return label + ': ' + text;
    }).join('\n');
  }).join('\n\n') : 'None';
  if (key.startsWith('leaderboard/') || key.startsWith('basicEdLeaderboard/')) return Number(value).toLocaleString() + ' points';
  return String(value);
}
function safetyApply(data, key, value) {
  const [section, id] = key.split('/');
  if (!id) { data[section] = safetyCopy(value); return; }
  if (section === 'displaySettings') { data.displaySettings.sections[id] = value; return; }
  const field = section === 'leaderboard' ? 'dept' : section === 'specialEvents' ? 'eventId' : 'teamId';
  let row = data[section].find(row => row[field] === id);
  if (!row) { row = { [field]: id }; data[section].push(row); }
  row[section === 'specialEvents' ? 'winnerTeamId' : 'points'] = value;
}
function safetyDialog(title, content, action = 'Continue') {
  const dialog = document.createElement('dialog');
  dialog.className = 'safety-dialog';
  dialog.innerHTML = '<h2></h2><div class="safety-content"></div><div class="safety-actions"><button type="button" class="button" data-cancel>Cancel</button><button type="button" class="button primary" data-proceed></button></div>';
  dialog.querySelector('h2').textContent = title;
  dialog.querySelector('.safety-content').append(content);
  dialog.querySelector('[data-proceed]').textContent = action;
  const comparisonStyle = document.createElement('style');
  comparisonStyle.textContent = '.safety-comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.safety-value{min-width:0;padding:12px 16px;border:1px solid #ffffff25;border-radius:10px;background:#ffffff08}.safety-value>strong{font-size:13px;color:#d4c7e5}.safety-value:last-child{border-color:#b69ade;background:#b69ade18}@media(max-width:560px){.safety-comparison{grid-template-columns:1fr}}';
  dialog.append(comparisonStyle);
  document.body.append(dialog);
  return new Promise(resolve => {
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close('cancel');
    dialog.querySelector('[data-proceed]').onclick = () => dialog.close('ok');
    dialog.onclose = () => { const accepted = dialog.returnValue === 'ok'; dialog.remove(); resolve(accepted); };
    dialog.showModal();
  });
}
function safetyChangeRow(key, before, after, beforeLabel = 'Currently saved', afterLabel = 'Your changes') {
  const row = document.createElement('article');
  const title = document.createElement('strong'); title.textContent = safetyLabel(key);
  row.append(title);
  const values = document.createElement('div'); values.className = 'safety-comparison';
  [[beforeLabel, before], [afterLabel, after]].forEach(([label, value]) => {
    const block = document.createElement('div'); block.className = 'safety-value';
    const heading = document.createElement('strong'); heading.textContent = label;
    const text = document.createElement('p'); text.textContent = safetyValue(value, key);
    block.append(heading, text); values.append(block);
  });
  row.append(values);
  if (typeof after === 'number' && typeof before === 'number') {
    const difference = document.createElement('p');
    difference.textContent = after === before ? 'Points unchanged' : Math.abs(after - before).toLocaleString() + ' points ' + (after > before ? 'added' : 'removed');
    row.append(difference);
  }
  return row;
}
async function safetyResolve(latest, draft) {
  const base = safetyCells(savedDashboard), mine = safetyCells(draft), theirs = safetyCells(latest);
  const merged = safetyCopy(latest), content = document.createElement('div'), choices = [];
  const intro = document.createElement('p');
  intro.textContent = 'New results were saved by ' + (latest.updatedBy || 'another administrator') + '. Your edits are preserved. Review the differences below; applying this review does not publish.';
  content.append(intro);
  Object.keys(mine).forEach(key => {
    const mineChanged = !safetyEqual(base[key], mine[key]);
    const remoteChanged = !safetyEqual(base[key], theirs[key]);
    if (mineChanged && remoteChanged && !safetyEqual(mine[key], theirs[key])) {
      const row = safetyChangeRow(key, theirs[key], mine[key]);
      const label = document.createElement('label'); label.textContent = 'Choose which value to keep';
      const select = document.createElement('select');
      select.append(new Option('Choose a value', ''), new Option('Keep latest saved value', 'latest'), new Option('Keep my edit', 'mine'));
      label.append(select); row.append(label); content.append(row); choices.push({key, select});
    } else {
      if (mineChanged) safetyApply(merged, key, mine[key]);
      if (remoteChanged) content.append(safetyChangeRow(key, base[key], theirs[key], 'Previously saved', 'Latest saved by another admin'));
    }
  });
  while (await safetyDialog('Newer changes found', content, 'Apply review')) {
    if (choices.some(item => !item.select.value)) { toast('Choose a value for each conflicting change.', true); continue; }
    choices.forEach(({key, select}) => safetyApply(merged, key, select.value === 'mine' ? mine[key] : theirs[key]));
    savedDashboard = safetyCopy(latest); dashboardData = merged; renderAll(); setDirty(true);
    toast('Review applied. Use Save changes to review and publish.'); return;
  }
}
async function safetySave() {
  if (safetyBusy) return;
  if (!connected) { showLogin('Please sign in.'); return; }
  if (!savedDashboard || savedDashboard.revision === undefined) { toast('Complete the Supabase database setup, then sign in again.', true); return; }
  if (typeof validateBasicEdAdmin === 'function' && !validateBasicEdAdmin()) return;
  const invalid = document.querySelector('.panel input:invalid');
  if (invalid) { document.querySelector('[data-tab="' + invalid.closest('.panel').id.replace('panel-', '') + '"]')?.click(); invalid.reportValidity(); return; }
  collectData();
  const draft = safetyCopy(dashboardData), previous = safetyCells(savedDashboard), next = safetyCells(draft);
  const keys = Object.keys(next).filter(key => !safetyEqual(previous[key], next[key]));
  if (!keys.length) { toast('No changes to save.'); return; }
  safetyBusy = true;
  try {
    const content = document.createElement('div');
    const intro = document.createElement('p'); intro.textContent = 'Check the saved values against your edits below. Nothing goes live until you select Publish changes.'; content.append(intro);
    keys.forEach(key => content.append(safetyChangeRow(key, previous[key], next[key])));
    if (!await safetyDialog('Review changes before publishing', content, 'Publish changes')) return;
    const controls = [...document.querySelectorAll('#admin-app input, #admin-app select, #admin-app textarea, #admin-app button')];
    const disabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    const saveButton = document.getElementById('save-top');
    const saveLabel = saveButton?.textContent;
    if (saveButton) saveButton.textContent = 'Saving…';
    try {
      const payload = await apiRequest('saveAll', { ...draft, revision: savedDashboard.revision });
      dashboardData = { ...draft, updatedAt: payload.updatedAt, updatedBy: payload.updatedBy, revision: payload.revision };
      savedDashboard = safetyCopy(dashboardData); setDirty(false); renderOverview();
      setStatus('Saved · ' + formatUpdated(payload.updatedAt) + ' by ' + payload.updatedBy, 'ok'); toast('Changes published.');
    } catch (error) {
      if (error.code === 'CONFLICT' && error.data) await safetyResolve(error.data, draft);
      else { setStatus(error.message, 'error'); toast(error.message, true); }
    } finally {
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
      if (saveButton) saveButton.textContent = saveLabel;
    }
  } finally { safetyBusy = false; }
}
function safetyDashboard(payload) {
  savedDashboard = safetyCopy(dashboardData); safetyUser = payload.user;
  const button = document.getElementById('manage-admins-button');
  if (button) button.hidden = safetyUser?.role !== 'owner';
}
async function safetyHistory() {
  try {
    const payload = await apiRequest('loadHistory');
    const content = document.createElement('div');
    const note = document.createElement('p'); note.textContent = 'Latest 200 score changes. The full history is kept in the database.'; content.append(note);
    if (!payload.history.length) { const empty = document.createElement('p'); empty.textContent = 'No points changes recorded yet.'; content.append(empty); }
    payload.history.forEach(item => {
      const row = safetyChangeRow('leaderboard/' + item.team, item.oldPoints, item.newPoints);
      const who = document.createElement('small'); who.textContent = formatUpdated(item.timestamp) + ' · ' + item.administrator + ' (@' + item.username + ')'; row.append(who); content.append(row);
    });
    await safetyDialog('Points history', content, 'Done');
  } catch (error) { toast(error.message, true); }
}
async function safetyAdministrators() {
  try {
    let {users} = await apiRequest('listAdmins');
    const content = document.createElement('div'), list = document.createElement('div'), form = document.createElement('form');
    form.noValidate = true;
    form.innerHTML = '<h3>Add administrator</h3><label>Email<input name="username" type="email" required maxlength="254" autocomplete="off"></label><label>Display name<input name="displayName" required maxlength="100"></label><label>Password<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="admin-password-help"></label><p id="admin-password-help">Use 12–128 characters. The administrator will sign in with this email and password.</p><button class="button" type="submit">Create account</button><p role="status" aria-live="polite"></p>';
    function render() {
      list.replaceChildren();
      users.forEach(user => {
        const row = document.createElement('article'), label = document.createElement('p');
        label.textContent = user.displayName + ' (@' + user.username + ') · ' + user.role + ' · ' + (user.active ? 'Active' : 'Inactive'); row.append(label);
        if (user.role !== 'owner') {
          const button = document.createElement('button'); button.className = 'button'; button.textContent = user.active ? 'Deactivate' : 'Reactivate';
          button.onclick = async () => {
            if (!confirm((user.active ? 'Deactivate ' : 'Reactivate ') + user.username + '?')) return;
            button.disabled = true;
            try { ({users} = await apiRequest('manageAdmin', {operation:'setActive', username:user.username, active:!user.active})); render(); }
            catch (error) { form.querySelector('[role="status"]').textContent = error.message; button.disabled = false; }
          }; row.append(button);
        } list.append(row);
      });
    }
    form.onsubmit = async event => {
      event.preventDefault();
      const button = form.querySelector('button'), status = form.querySelector('[role="status"]');
      if (button.disabled) return;
      const input = Object.fromEntries(new FormData(form));
      input.username = input.username.trim().toLowerCase();
      input.displayName = input.displayName.trim();
      let invalidField, message;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.username) || input.username.length > 254) {
        invalidField = 'username'; message = 'Enter a valid email address.';
      } else if (!input.displayName || input.displayName.length > 100) {
        invalidField = 'displayName'; message = 'Enter a display name of 1–100 characters.';
      } else if (input.password.length < 12 || input.password.length > 128) {
        invalidField = 'password'; message = 'Password must contain 12–128 characters. The account has not been created.';
      }
      if (message) {
        status.textContent = message;
        form.elements.namedItem(invalidField).focus();
        return;
      }
      button.disabled = true; button.textContent = 'Creating account…';
      status.textContent = 'Creating administrator account…';
      try {
        ({users} = await apiRequest('manageAdmin', {operation:'create', ...input}));
        form.reset(); status.textContent = 'Administrator created. Sign in with ' + input.username + ' and the password you entered.'; render();
      } catch (error) {
        status.textContent = /already.*registered|already.*exists/i.test(error.message)
          ? 'This email already has a sign-in account. Creating it again does not change its password or grant Sportsfest access. Use its existing password (or recover it in Supabase), then have the project owner link the existing account using supabase/add-admin.sql.'
          : 'Account creation failed: ' + error.message;
      }
      finally { button.disabled = false; button.textContent = 'Create account'; }
    };
    render(); content.append(list, form); await safetyDialog('Administrators', content, 'Done');
  } catch (error) { toast(error.message, true); }
}
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = '.safety-dialog{margin:auto;width:min(720px,94vw);max-height:88vh;overflow:auto;padding:24px;border:1px solid #66517f;border-radius:16px;background:#1d142c;color:#fff;font:16px/1.5 system-ui}.safety-dialog::backdrop{background:#080410b8}.safety-dialog h2{font-size:22px;margin:0 0 20px}.safety-dialog article{padding:16px 0;border-bottom:1px solid #ffffff25}.safety-dialog p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.safety-dialog label{display:block;margin:14px 0}.safety-dialog input,.safety-dialog select{display:block;width:100%;padding:10px;color:#fff;background:#2e223f;border:1px solid #806991;border-radius:6px}.safety-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}.safety-tools{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.safety-tools [hidden]{display:none}'; document.head.append(style);
  const tools = document.createElement('div'); tools.className = 'safety-tools';
  tools.innerHTML = '<button type="button" class="button" id="points-history-button">Points history</button><button type="button" class="button" id="manage-admins-button" hidden>Administrators</button>';
  document.querySelector('#panel-overview').append(tools);
  tools.querySelector('#points-history-button').onclick = safetyHistory;
  tools.querySelector('#manage-admins-button').onclick = safetyAdministrators;
  tools.querySelector('#manage-admins-button').hidden = safetyUser?.role !== 'owner';
});
