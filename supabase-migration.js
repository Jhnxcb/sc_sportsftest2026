(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let report = null, owner = false, busy = false;
  function update() { $('import').disabled = !report || !owner || !$('reviewed').checked || busy; }
  function status(id, message, error = false) { $(id).textContent = message; $(id).classList.toggle('error',error); }
  function receive(value) {
    if (!value?.data || !Array.isArray(value.history) || !Array.isArray(value.data.leaderboard) || !Array.isArray(value.data.basicEdLeaderboard)) throw new Error('Choose a complete export with dashboard data and points history.');
    report = value;
    $('reviewed').checked = false;
    $('preview').textContent = [
      'Exported: ' + (value.exportedAt || 'Unknown'),
      'College: ' + value.data.leaderboard.map(row => row.dept + ' ' + row.points).join(' · '),
      'Basic Education: ' + value.data.basicEdLeaderboard.map(row => row.teamId + ' ' + row.points).join(' · '),
      'Matches: ' + ((value.data.matches?.length || 0) + (value.data.matches2?.length || 0)),
      'Announcements: ' + (value.data.announcements?.length || 0),
      'Media: ' + (value.data.media?.length || 0),
      'Points history: ' + value.history.length + ' records'
    ].join('\n');
    $('download').disabled = false; update();
  }
  async function legacy(endpoint, action, sessionToken, credentials = {}) {
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)) throw new Error('Use the Google Apps Script URL ending in /exec.');
    const response = await fetch(endpoint,{method:'POST',body:new URLSearchParams({payload:JSON.stringify({action,sessionToken,...credentials})}),signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error('Google export returned HTTP ' + response.status);
    const payload=await response.json(); if (!payload.ok) throw new Error(payload.error || 'Export failed'); return payload;
  }
  $('legacy-form').onsubmit = async event => {
    event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true;
    const endpoint=$('legacy-url').value.trim(); let token;
    try {
      status('export-status','Reading saved records…');
      const login=await legacy(endpoint,'login','',{username:$('legacy-username').value.trim(),password:$('legacy-password').value});
      token=login.sessionToken; $('legacy-password').value='';
      receive(await legacy(endpoint,'exportRecords',token));
      status('export-status','Export ready. Review the totals and download the backup.');
    } catch(error) { status('export-status',error.message,true); }
    finally { $('legacy-password').value=''; button.disabled=false; if(token) legacy(endpoint,'logout',token).catch(()=>{}); }
  };
  $('backup-file').onchange = async () => {
    try { const file=$('backup-file').files[0]; if(file) { receive(JSON.parse(await file.text())); status('export-status','Backup loaded. Review the records below.'); } }
    catch(error) { status('export-status',error.message,true); }
  };
  $('download').onclick = () => {
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a'); link.href=url; link.download='sportsfest-complete-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('supabase-form').onsubmit = async event => {
    event.preventDefault(); const button=event.currentTarget.querySelector('button');button.disabled=true;owner=false;update();
    try {
      const payload=await window.SportsfestAPI.admin('login',null,{username:$('email').value.trim(),password:$('password').value});
      if(payload.user.role!=='owner') throw new Error('Sign in with an owner account to import records.');
      if(payload.data.revision!=='0') throw new Error('This database already has saved records. Import is disabled to protect them.');
      owner=true; status('auth-status','Owner verified. Database is ready for its first import.');
    } catch(error) { status('auth-status',error.message,true); }
    finally { $('password').value='';button.disabled=false;update(); }
  };
  $('reviewed').onchange=update;
  // Reuse the owner login from the dashboard in this tab; never ask for the
  // password a second time just to return to the migration page.
  if (window.SportsfestAPI.hasSession()) {
    window.SportsfestAPI.admin('loadAdmin').then(payload => {
      if (payload.user.role !== 'owner') return;
      if (payload.data.revision !== '0') {
        status('auth-status','This database already has saved records. Import is disabled to protect them.',true);
        return;
      }
      owner=true;
      $('supabase-form').hidden=true;
      status('auth-status','Owner verified. Database is ready for its first import.');
      update();
    }).catch(error => status('auth-status',error.message,true));
  }
  $('import').onclick = async () => {
    if(busy || !report || !owner || !$('reviewed').checked) return;
    busy=true; update();
    try {
      status('import-status','Importing records and history together…');
      await window.SportsfestAPI.admin('importRecords',{data:report.data,history:report.history});
      const imported=await window.SportsfestAPI.admin('exportRecords');
      const publicData=await window.SportsfestAPI.publicData();
      if(imported.history.length!==report.history.length || !publicData.ok) throw new Error('Import saved, but verification needs review. Open the dashboard before proceeding.');
      owner=false;
      status('import-status','Import verified: '+imported.history.length+' history records. Open the administrator dashboard and refresh the TV page.');
    } catch(error) { status('import-status',error.message,true); }
    finally { busy=false;update(); }
  };
})();
