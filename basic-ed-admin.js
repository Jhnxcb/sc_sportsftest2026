// Department editors reuse the College table and score-controller styles.
let basicEdReady = false;
function renderBasicEdAdmin(data) {
  basicEdReady = Array.isArray(data.basicEdLeaderboard) && Array.isArray(data.specialEvents);
  document.querySelectorAll('.basic-ed-connection').forEach(note => {
    note.textContent = basicEdReady ? 'Connected to Supabase. Use Save changes to publish to the TV.' : 'Complete the Supabase database setup to enable these controls.';
  });
  const scores = Object.fromEntries((data.basicEdLeaderboard || []).map(row => [row.teamId, row.points]));
  const winners = Object.fromEntries((data.specialEvents || []).map(row => [row.eventId, row.winnerTeamId]));
  ['grade', 'junior', 'senior'].forEach(id => {
    const root = document.getElementById('basic-admin-' + id);
    root.innerHTML = '<div class="table-wrap"><table><thead><tr><th style="width:60px">Rank</th><th>Team</th><th>Tally Score</th></tr></thead><tbody></tbody></table></div>';
    const tbody = root.querySelector('tbody');
    departments[id].teams.forEach(team => {
      const row = document.createElement('tr');
      row.innerHTML = '<td><span class="rank-indicator"></span></td><td><div class="team-cell"><img alt=""><div><strong></strong><span></span></div></div></td><td><div class="points-controller"><button class="points-btn" type="button" data-points-step="-1" aria-label="Subtract one point">−</button><input class="points-input" type="number" min="0" max="999999" step="1" required><button class="points-btn" type="button" data-points-step="1" aria-label="Add one point">+</button></div></td>';
      row.querySelector('img').src = 'DEPT LOGOS/BASIC ED/' + team.logo;
      row.querySelector('strong').textContent = team.name;
      row.querySelector('.team-cell span').textContent = team.detail;
      const input = row.querySelector('input');
      input.value = scores[team.id] ?? 0;
      input.dataset.basicTeam = team.id;
      input.setAttribute('aria-label', team.name + ' points');
      row.querySelectorAll('button,input').forEach(control => { control.disabled = !basicEdReady; });
      tbody.append(row);
    });
    updateBasicRanks(tbody);
  });
  const root = document.getElementById('basic-admin-awards');
  root.innerHTML = '<div class="basic-award-grid"></div>';
  events.forEach(event => {
    const card = document.createElement('article');
    card.className = 'basic-award-card';
    const title = document.createElement('h2');
    title.textContent = event.name;
    const preview = document.createElement('img');
    const placeholder = document.createElement('div');
    placeholder.className = 'winner-placeholder';
    placeholder.textContent = '☆';
    const label = document.createElement('label');
    label.textContent = 'Winning team';
    const select = document.createElement('select');
    select.dataset.basicEvent = event.id;
    select.disabled = !basicEdReady;
    select.append(new Option('Champion to be announced', ''));
    awardDepartments(TEAMS).forEach(dept => {
      const group = document.createElement('optgroup');
      group.label = dept.short;
      dept.teams.forEach(team => group.append(new Option(team.name, team.id)));
      select.append(group);
    });
    select.value = winners[event.id] || '';
    function update() {
      const team = awardDepartments(TEAMS).flatMap(dept => dept.teams).find(team => team.id === select.value);
      preview.hidden = !team;
      preview.style.display = team ? 'block' : 'none';
      placeholder.style.display = team ? 'none' : 'grid';
      if (team) { preview.src = team.logo; preview.alt = team.name + ' logo'; }
      else preview.removeAttribute('src');
    }
    select.addEventListener('change', update);
    update();
    label.append(select);
    card.append(title, preview, placeholder, label);
    root.firstChild.append(card);
  });
}
// Update rank labels without moving score inputs from their fixed team order.
function updateBasicRanks(tbody) {
  const rows = [...tbody.rows].sort((a, b) => Number(b.querySelector('input').value) - Number(a.querySelector('input').value));
  let rank = 1;
  rows.forEach((row, i) => {
    if (i && Number(row.querySelector('input').value) !== Number(rows[i - 1].querySelector('input').value)) rank = i + 1;
    row.querySelector('.rank-indicator').textContent = rank;
  });
}
function collectBasicEdAdmin() {
  // Older deployments must never silently accept and discard these edits.
  if (!basicEdReady) return {};
  return {
    basicEdLeaderboard: [...document.querySelectorAll('[data-basic-team]')].map(input => ({ teamId: input.dataset.basicTeam, points: Number(input.value) })),
    specialEvents: [...document.querySelectorAll('[data-basic-event]')].map(select => ({ eventId: select.dataset.basicEvent, winnerTeamId: select.value }))
  };
}
function validateBasicEdAdmin() {
  const invalid = [...document.querySelectorAll('[data-basic-team]')].find(input => !input.checkValidity());
  if (!invalid) return true;
  document.querySelector('[data-tab="' + invalid.closest('.panel').id.replace('panel-', '') + '"]').click();
  invalid.reportValidity();
  return false;
}
