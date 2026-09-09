(() => {
  const college = {
    SECSA: ['Shippuden', 'SECSA Shippuden.png'], SBA: ['Surging Dragons', 'SBA Surging Dragons.png'],
    STED: ['Golden Hawks', 'STED Golden Hawks.png'], SHARP: ['Celadons Hawks', 'SHARP Celadons Hawks.png'], SHTM: ['Pink Panthers', 'SHTM Pink Panthers.png']
  };
  const $ = id => document.getElementById(id);
  let data = null, busy = false;
  function render() {
    if (!data) return;
    const selected = $('department').value;
    const rows = selected === 'college' ? (data.leaderboard || []).map(row => ({
      name: college[row.dept]?.[0] || row.dept, detail: row.dept, points: Number(row.points), logo: college[row.dept] ? 'DEPT LOGOS/' + college[row.dept][1] : ''
    })) : (data.basicEdLeaderboard || []).filter(row => departments[selected].teams.some(team => team.id === row.teamId)).map(row => {
      const team = departments[selected].teams.find(team => team.id === row.teamId);
      return {name: team.name, detail: team.detail, points: Number(row.points), logo: 'DEPT LOGOS/BASIC ED/' + team.logo};
    });
    rows.sort((a,b) => b.points - a.points);
    $('standings').replaceChildren();
    let rank = 1;
    rows.forEach((team,index) => {
      if (index && team.points !== rows[index - 1].points) rank = index + 1;
      const row = document.createElement('li');
      const place = document.createElement('span'); place.className = 'rank'; place.textContent = rank;
      const logo = document.createElement('img'); if (team.logo) logo.src = team.logo; logo.alt = '';
      const name = document.createElement('strong'); name.textContent = team.name;
      const detail = document.createElement('small'); detail.textContent = team.detail; name.append(detail);
      const score = document.createElement('div'); score.className = 'score'; score.textContent = team.points.toLocaleString();
      const unit = document.createElement('small'); unit.textContent = 'POINTS'; score.append(unit);
      row.append(place,logo,name,score); $('standings').append(row);
    });
    $('empty').textContent = rows.length ? '' : 'No published scores for this department yet.';
    $('notice').textContent = (data.announcements || []).join('\n\n');
  }
  async function refresh() {
    if (busy) return;
    busy = true; $('refresh').disabled = true;
    try {
      const result = await window.SportsfestAPI.publicData();
      data = result; render();
      $('status').textContent = 'Connected · Checked ' + new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + ' · Updates every 30 seconds';
    } catch (_) {
      $('status').textContent = data ? 'Connection lost · Showing the last received scores. Retrying automatically.' : 'Unable to load scores. Check your internet and try Refresh scores.';
    } finally { busy = false; $('refresh').disabled = false; }
  }
  $('department').addEventListener('change',render);
  $('refresh').addEventListener('click',refresh);
  refresh(); setInterval(refresh,30000);
})();
