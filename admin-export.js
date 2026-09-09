// Exports always use one saved server snapshot, never unfinished form edits.
function recordsCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (typeof value !== 'number' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');
}
function recordsStandings(data) {
  const rows = [['Department', 'Rank', 'Team', 'Points']];
  overviewGroups(data).forEach(group => {
    let rank = 1;
    group.teams.forEach((team, index) => {
      if (index && team.points !== group.teams[index - 1].points) rank = index + 1;
      rows.push([group.short, team.points === null ? '' : rank, team.name, team.points ?? 'Not recorded']);
    });
  });
  return rows;
}
function recordsHistory(history) {
  return [['Timestamp (UTC)', 'Username', 'Administrator', 'Team', 'Previous points', 'New points', 'Change', 'Save reference'], ...history.map(item => [item.timestamp, item.username, item.administrator, overviewTeamName(item.team), item.oldPoints, item.newPoints, item.change, item.revision])];
}
function recordsDownload(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function recordsPrintHtml(report) {
  const esc = escapeHtml;
  function table(rows) {
    return '<table><thead><tr>' + rows[0].map(value => '<th>' + esc(value) + '</th>').join('') + '</tr></thead><tbody>' + rows.slice(1).map(row => '<tr>' + row.map(value => '<td>' + esc(String(value ?? '')) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  const history = recordsHistory(report.history).map(row => row.slice(0, 7));
  return '<!doctype html><html><head><meta charset="utf-8"><title>Sportsfest event records</title><style>@page{size:A4 landscape;margin:14mm}body{font:12px/1.5 Arial,sans-serif;color:#172033;margin:24px}h1{font-size:24px}h2{font-size:18px;margin-top:24px}p{color:#485365}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #cbd0d8;padding:7px;text-align:left;overflow-wrap:anywhere}th{background:#edf0f4}thead{display:table-header-group}tr{break-inside:avoid}.history{break-before:page}button{padding:10px 18px;cursor:pointer}@media print{body{margin:0}button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>Sportsfest 2026 · Event records</h1><p>Saved results as of ' + esc(report.data.updatedAt || 'Not yet saved') + ' · Updated by ' + esc(report.data.updatedBy || 'Not recorded') + '<br>Exported: ' + esc(report.exportedAt) + ' (UTC). Unsaved edits are excluded.</p><h2>Department standings</h2>' + table(recordsStandings(report.data)) + '<section class="history"><h2>Points history</h2><p>' + report.history.length + ' recorded changes · newest first · timestamps in UTC</p>' + (report.history.length ? table(history) : '<p>No score changes recorded yet.</p>') + '</section></body></html>';
}
async function exportEventRecords(format) {
  if (!connected) { toast('Please sign in to export records.', true); return; }
  const buttons = [...document.querySelectorAll('[data-export-records]')];
  buttons.forEach(button => button.disabled = true);
  const status = document.getElementById('records-export-status');
  status.textContent = 'Preparing saved event records…';
  try {
    const report = await apiRequest('exportRecords');
    if (!report.data || !Array.isArray(report.history)) throw new Error('Complete the Supabase database setup to enable complete record exports.');
    const date = report.exportedAt.slice(0,19).replace(/[:T]/g, '-');
    if (format === 'standings') recordsDownload(recordsCsv(recordsStandings(report.data)), 'text/csv;charset=utf-8', 'sportsfest-standings-' + date + '.csv');
    else if (format === 'history') recordsDownload(recordsCsv(recordsHistory(report.history)), 'text/csv;charset=utf-8', 'sportsfest-history-' + date + '.csv');
    else recordsDownload(recordsPrintHtml(report), 'text/html;charset=utf-8', 'sportsfest-print-records-' + date + '.html');
    status.textContent = format === 'print' ? 'Open the downloaded report and choose Print / Save as PDF.' : 'Export downloaded. Includes saved records only.';
  } catch (error) {
    status.textContent = /Unknown admin action/i.test(error.message) ? 'Complete the Supabase database setup to enable exports, then try again.' : error.message;
  } finally { buttons.forEach(button => button.disabled = false); }
}
document.addEventListener('DOMContentLoaded', () => {
  const section = document.createElement('section'); section.className = 'overview-card'; section.style.marginTop = '20px';
  section.innerHTML = '<h2>Export event records</h2><p class="overview-muted">Download saved standings or the full points history. Print the combined report for event records.</p><div class="safety-tools"><button type="button" class="button" data-export-records="standings">Standings CSV</button><button type="button" class="button" data-export-records="history">Full history CSV</button><button type="button" class="button" data-export-records="print">Printable report</button></div><p id="records-export-status" class="overview-muted" role="status"></p>';
  document.getElementById('panel-overview').append(section);
  section.querySelectorAll('[data-export-records]').forEach(button => button.onclick = () => exportEventRecords(button.dataset.exportRecords));
  const photo = document.createElement('div');
  photo.className = 'safety-tools';
  photo.innerHTML = '<label for="photo-department">Leaderboard photo</label><select id="photo-department" aria-label="Department for leaderboard photo"><option value="grade">Grade School</option><option value="junior">Junior High School</option><option value="senior">Senior High School</option><option value="leaderboard">College</option></select><button type="button" class="button" id="export-leaderboard-photo">Download PNG for Facebook</button>';
  section.insertBefore(photo, section.querySelector('#records-export-status'));
  photo.querySelector('button').onclick = exportLeaderboardPhoto;
});

function drawLeaderboardPhoto(canvas, group, data, logos = {}, brand = null) {
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 1080);
  gradient.addColorStop(0, '#affbfb'); gradient.addColorStop(.65, '#affbfb'); gradient.addColorStop(1, '#ffffff');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1080);
  const text = (value, x, y, size, color = '#ffffff', weight = 600, maxWidth) => {
    ctx.fillStyle = color;
    ctx.font = Math.min(weight,700) + ' ' + size + 'px Quicksand, Arial, sans-serif';
    while (maxWidth && ctx.measureText(value).width > maxWidth && size > 20) { size--; ctx.font = Math.min(weight,700) + ' ' + size + 'px Quicksand, Arial, sans-serif'; }
    ctx.fillText(value, x, y);
  };
  if (brand) {
    const scale = Math.min(380 / brand.width, 135 / brand.height);
    ctx.drawImage(brand,64,48,brand.width * scale,brand.height * scale);
  } else {
    text('Southlandfest 2026', 64, 110, 45, '#740085', 700, 620);
    text('TORCH OF LEGACY', 64, 151, 22, '#bd4f00', 700);
  }
  ctx.save(); ctx.scale(1080/479,1080/476);
  const flame=(path,color)=>{ctx.fillStyle=color;ctx.fill(new Path2D(path));};
  flame('M0 283 L26 240 C8 309 42 357 83 385 C128 414 201 418 247 455 L270 476 H0 Z','#ffd21a');
  flame('M396 232 C421 295 414 335 375 384 C332 418 278 433 228 476 H479 V332 C460 292 430 260 396 232 Z','#ffd21a');
  const orange=ctx.createLinearGradient(0,350,0,476);orange.addColorStop(0,'#ff841c');orange.addColorStop(1,'#ff841c10');
  flame('M0 351 C48 402 172 406 226 434 C245 444 248 458 277 476 H0 Z',orange);
  flame('M454 307 C468 353 438 392 447 414 L479 379 V476 H227 C280 441 314 429 376 402 C424 380 446 357 454 307 Z',orange);
  const purple=ctx.createLinearGradient(0,335,0,510);purple.addColorStop(0,'#9254a4');purple.addColorStop(1,'#9254a450');
  flame('M103 335 C128 350 150 376 147 399 C143 431 106 461 80 476 H0 V420 C64 398 105 375 103 335 Z',purple);
  flame('M342 342 C353 383 416 394 479 406 V476 H404 C357 455 316 432 311 409 C306 382 325 360 342 342 Z',purple);
  flame('M0 412 C16 424 28 452 22 476 H0 Z','#dd78b680');
  flame('M479 386 C447 395 437 438 454 476 H479 Z','#dd78b680');
  ctx.restore();
  const titleGradient=ctx.createLinearGradient(550,0,1008,0);titleGradient.addColorStop(0,'#ff8c00');titleGradient.addColorStop(1,'#ff007b');
  ctx.textAlign='right';
  text(group.short.toUpperCase()+' DEPARTMENT',1008,111,30,titleGradient,600,535);
  ctx.textAlign='center';text('OFFICIAL TEAM STANDINGS',540,233,24,'#406176',700);ctx.textAlign='left';
  const colors={SBA:'#20c8df',SECSA:'#ff7710',SHTM:'#f7007d',STED:'#edc624',SHARP:'#20cbaa'};
  let rank = 1;
  group.teams.forEach((team, index) => {
    if (index && team.points !== group.teams[index - 1].points) rank = index + 1;
    const y = 275 + (5-group.teams.length)*60 + index * 120;
    const color=team.color || colors[team.id] || '#9b58bb';
    ctx.save(); ctx.shadowColor='#19557530'; ctx.shadowBlur=12; ctx.shadowOffsetY=6;
    ctx.beginPath(); ctx.roundRect(83,y,925,112,56); ctx.fillStyle=color; ctx.fill(); ctx.restore();
    const shine=ctx.createLinearGradient(0,y,0,y+112);
    shine.addColorStop(0,'#ffffff90'); shine.addColorStop(.2,'#ffffff00'); shine.addColorStop(.8,'#00000000'); shine.addColorStop(1,'#00000022');
    ctx.fillStyle=shine; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(815,y+12,177,88,44); ctx.fillStyle='#ffffffde'; ctx.fill(); ctx.restore();
    const logo=logos[team.id];
    if(logo) {
      const scale=Math.min(140/logo.width,140/logo.height);
      ctx.save();ctx.shadowColor='#ffffff';ctx.shadowBlur=14;
      ctx.drawImage(logo,147-logo.width*scale/2,y+56-logo.height*scale/2,logo.width*scale,logo.height*scale);ctx.restore();
    } else {
      ctx.beginPath();ctx.arc(147,y+56,44,0,Math.PI*2);ctx.fillStyle='#ffffffdd';ctx.fill();
      ctx.textAlign='center';text(team.points===null?'—':String(rank),147,y+69,34,'#57266b',800);
    }
    ctx.textAlign = 'left';
    const darkText=['#edc624','#ffd700','#87ceeb','#32cd32'].includes(color.toLowerCase());
    text(team.name, 241, y + 72, 40, darkText?'#493950':'#ffffff', 800, 551);
    ctx.textAlign = 'center'; text(team.points === null ? '—' : team.points.toLocaleString(), 904, y + 73, 46, '#50505a', 800, 145);
    ctx.textAlign = 'left';
  });
  ctx.textAlign = "center";
  const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleString('en-PH', {timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + ' PHT' : 'No published update yet';
  text('AS OF ' + updated, 540, 935, 20, '#514263', 600, 936);
  text('SOUTHLAND COLLEGE · ' + group.teams.length + ' TEAMS', 540, 969, 18, '#655575', 600);
}

async function leaderboardPhotoLogos(group) {
  const entries=await Promise.all(group.teams.map(team=>new Promise(resolve=>{
    if(!team.logo) {resolve([team.id,null]);return;}
    const img=new Image();img.crossOrigin='anonymous';
    const timer=setTimeout(()=>resolve([team.id,null]),5000);
    img.onload=()=>{clearTimeout(timer);resolve([team.id,img]);};
    img.onerror=()=>{clearTimeout(timer);resolve([team.id,null]);};
    img.src=window.SportsfestExportAssets?.logos[team.id] || encodeURI(team.logo);
  })));
  return Object.fromEntries(entries);
}

let leaderboardFontReady;
async function leaderboardBrandAssets() {
  const assets=window.SportsfestExportAssets;
  if(!assets) throw new Error('Refresh this page to load the Sportsfest logo and Quicksand font.');
  if(!leaderboardFontReady) {
    leaderboardFontReady=(async()=>{
      const font=new FontFace('Quicksand','url("'+assets.font+'")',{weight:'300 700'});
      await font.load(); document.fonts.add(font);
    })().catch(error=>{leaderboardFontReady=null;throw error;});
  }
  await leaderboardFontReady;
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('The Sportsfest logo could not load. Refresh and try again.'));
    img.src=assets.brand;
  });
}

async function exportLeaderboardPhoto() {
  const button = document.getElementById('export-leaderboard-photo');
  const status = document.getElementById('records-export-status');
  if (!connected) { status.textContent = 'Sign in to export saved standings.'; return; }
  const department = document.getElementById('photo-department').value;
  button.disabled = true; status.textContent = 'Preparing leaderboard image…';
  try {
    const report = await apiRequest('loadAdmin');
    const group = overviewGroups(report.data).find(group => group.tab === department);
    if (!group) throw new Error('Department not found.');
    const canvas = document.createElement('canvas');
    const [logos,brand]=await Promise.all([leaderboardPhotoLogos(group),leaderboardBrandAssets()]);
    drawLeaderboardPhoto(canvas, group, report.data, logos,brand);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The image could not be created. Please try again.');
    recordsDownload(blob, 'image/png', 'sportsfest-' + department + '-leaderboard-' + localDate() + '.png');
    status.textContent = 'PNG downloaded (1080 × 1080). Ready to upload to Facebook. Saved standings only.' + (group.teams.some(team=>team.logo&&!logos[team.id]) ? ' Some logos could not load; ranks are shown instead. Open the admin through the local web server to load logos.' : '');
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}
