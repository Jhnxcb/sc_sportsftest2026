// Read-only summaries for the local administrator's Overview.
let overviewHistoryRequest = 0;
function overviewGroups(data) {
  const college = Object.fromEntries((data.leaderboard || []).map(row => [row.dept, Number(row.points) || 0]));
  const basic = Object.fromEntries((data.basicEdLeaderboard || []).map(row => [row.teamId, Number(row.points) || 0]));
  return awardDepartments(TEAMS).map((group, index) => ({
    ...group,
    tab: ['grade', 'junior', 'senior', 'leaderboard'][index],
    teams: group.teams.map(team => ({ ...team, points: index === 3 ? college[team.id] ?? null : basic[team.id] ?? null }))
      .sort((a, b) => (b.points ?? -1) - (a.points ?? -1))
  }));
}
function overviewMatches(data, today) {
  return ['matches', 'matches2'].flatMap((section, index) => (data[section] || [])
    .filter(match => match.active !== false && match.date === today)
    .map(match => ({ ...match, collection: index + 1 })));
}
function overviewTeamName(id) {
  const key = String(id || '');
  const team = awardDepartments(TEAMS).flatMap(group => group.teams).find(team => team.id.toUpperCase() === key.toUpperCase());
  return team?.name || key || 'To be announced';
}
function renderOverviewDetails() {
  const root = document.getElementById('overview-details');
  if (!root) return;
  const esc = escapeHtml;
  const groups = overviewGroups(dashboardData);
  const matches = overviewMatches(dashboardData, localDate());
  const winners = Object.fromEntries((dashboardData.specialEvents || []).map(row => [row.eventId, row.winnerTeamId]));
  const enabled = DISPLAY_SECTIONS.filter(section => dashboardData.displaySettings?.sections?.[section.id] ?? section.enabled);
  root.innerHTML = `
    <div class="overview-section-heading"><h2>Department standings</h2><span>Grade School 2 · Junior High 4 · Senior High 3 · College 5</span></div>
    <div class="overview-departments">${groups.map(group => `<article class="overview-card">
      <div class="overview-card-heading"><h3>${esc(group.short)}</h3><button class="button small" type="button" data-overview-tab="${group.tab}">Edit scores</button></div>
      <ol class="overview-standing-list">${group.teams.map(team => `<li><img src="${esc(encodeURI(team.logo))}" alt=""><span>${esc(team.name)}</span><strong>${team.points === null ? '—' : team.points.toLocaleString()}<small>pts</small></strong></li>`).join('')}</ol>
    </article>`).join('')}</div>
    <div class="overview-columns">
      <section class="overview-card"><div class="overview-card-heading"><h2>Recent score changes</h2><button type="button" class="button small" id="overview-history-refresh">Refresh</button></div><div id="overview-recent-history" role="status"><p class="overview-muted">${connected ? 'Loading recent changes…' : 'Sign in to view score history.'}</p></div></section>
      <section class="overview-card"><div class="overview-card-heading"><h2>Today's matches</h2><span class="overview-muted">${esc(localDate())}</span></div>
        ${matches.length ? matches.map(match => `<article class="overview-match"><div class="overview-match-heading"><strong>${esc(match.sport)}</strong><span>${esc(match.status || 'Scheduled')}</span></div><p>${esc(overviewTeamName(match.teamA))} <span class="overview-muted">vs</span> ${esc(overviewTeamName(match.teamB))}</p><small>${esc(match.time || 'Time to be announced')} · ${esc(match.venue || 'Venue to be announced')} · Matches ${match.collection}</small></article>`).join('') : '<p class="overview-muted">No active matches scheduled for today.</p>'}
      </section>
    </div>
    <div class="overview-columns">
      <section class="overview-card"><div class="overview-card-heading"><h2>Major award winners</h2><button class="button small" type="button" data-overview-tab="awards">Edit winners</button></div>
        ${events.map(event => `<div class="overview-award"><span>${esc(event.name)}</span><strong>${winners[event.id] ? esc(overviewTeamName(winners[event.id])) : 'Awaiting results'}</strong></div>`).join('')}
      </section>
      <section class="overview-card"><div class="overview-card-heading"><h2>Enabled TV sections</h2><button class="button small" type="button" data-overview-tab="tv">Manage</button></div><p class="overview-muted">Sections included in the display rotation.</p><div class="overview-section-tags">${enabled.length ? enabled.map(section => `<span>${esc(section.id === 'matches' ? 'Matches 1' : section.id === 'matches2' ? 'Matches 2' : section.label)}</span>`).join('') : '<p class="overview-muted">All sections are off. The TV shows standby.</p>'}</div></section>
    </div>`;
  root.querySelectorAll('[data-overview-tab]').forEach(button => button.onclick = () => document.querySelector('.tab[data-tab="' + button.dataset.overviewTab + '"]')?.click());
  root.querySelector('#overview-history-refresh').onclick = loadOverviewHistory;
  if (connected) loadOverviewHistory();
}
async function loadOverviewHistory() {
  const request = ++overviewHistoryRequest;
  const token = sessionToken;
  const target = document.getElementById('overview-recent-history');
  const button = document.getElementById('overview-history-refresh');
  if (!connected || !target) return;
  if (button) button.disabled = true;
  try {
    const payload = await apiRequest('loadHistory');
    if (request !== overviewHistoryRequest || token !== sessionToken || !connected || !target.isConnected) return;
    const history = payload.history || [];
    target.innerHTML = history.slice(0, 5).map(item => `<article class="overview-history-item"><div><strong>${escapeHtml(overviewTeamName(item.team))}</strong><span>${escapeHtml(String(item.oldPoints))} → ${escapeHtml(String(item.newPoints))} <b>(${Number(item.change) >= 0 ? '+' : ''}${Number(item.change)})</b></span></div><small>${escapeHtml(item.administrator || item.username)} · ${escapeHtml(formatUpdated(item.timestamp))}</small></article>`).join('') || '<p class="overview-muted">No score changes recorded yet.</p>';
  } catch (error) {
    if (request === overviewHistoryRequest && target.isConnected) { target.textContent = 'Recent changes could not be loaded. Use Refresh to try again.'; }
  } finally { if (button) button.disabled = false; }
}
