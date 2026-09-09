/**
 * Southland College Sportsfest 2026 leaderboard API.
 * Bind this project to the Google Sheet, then deploy it as a Web App.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sportsfest Admins')
    .addItem('Add or update administrator', 'setupAdminLogin')
    .addItem('Remove administrator', 'removeAdminLogin')
    .addItem('List administrator profiles', 'listAdminProfiles')
    .addItem('Designate system owner', 'setupSystemOwner')
    .addToUi();
}

function doGet() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var properties = PropertiesService.getScriptProperties();
    var leaderboard = readObjects_(spreadsheet, 'Leaderboard').map(function(row) {
      return {
        dept: text_(row.dept || row.department).toUpperCase(),
        points: number_(row.points || row.totalpoints)
      };
    }).filter(function(row) {
      return ['SECSA', 'SBA', 'STED', 'SHARP', 'SHTM'].indexOf(row.dept) !== -1;
    }).sort(function(a, b) {
      return b.points - a.points;
    }).map(function(row, index) {
      row.rank = index + 1;
      return row;
    });

    var announcementSheet = spreadsheet.getSheetByName('Announcements');
    var announcementRows = announcementSheet
      ? readObjects_(spreadsheet, 'Announcements')
      : readOptionalMedia_(spreadsheet);
    var announcements = announcementRows.filter(function(row) {
      return row.active == null || row.active === '' || boolean_(row.active);
    }).map(function(row) {
      return text_(row.message || row.announcement || row.title);
    }).filter(String);

    var matchRows = spreadsheet.getSheetByName('Matches')
      ? readObjects_(spreadsheet, 'Matches')
      : [];
    var matches = matchRows.filter(function(row) {
      return isToday_(row.date) && (row.active == null || row.active === '' || boolean_(row.active));
    }).map(function(row) {
      return {
        sport: text_(row.sport),
        teamA: text_(row.teama).toUpperCase(),
        teamB: text_(row.teamb).toUpperCase(),
        time: text_(row.time),
        venue: text_(row.venue),
        status: text_(row.status) || 'Scheduled'
      };
    }).filter(function(row) {
      return row.sport && row.teamA && row.teamB;
    });

    var allMediaRows = spreadsheet.getSheetByName('Media')
      ? readObjects_(spreadsheet, 'Media')
      : [];
    var media = allMediaRows.filter(function(row) {
      var type = text_(row.type).toLowerCase();
      return (type === 'school-promo' || type === 'sportsfest-motion') &&
        (row.active == null || row.active === '' || boolean_(row.active));
    }).map(function(row) {
      return {
        type: text_(row.type).toLowerCase(),
        title: text_(row.title),
        message: text_(row.message),
        url: text_(row.url),
        poster: text_(row.poster),
        duration: number_(row.duration) || 20
      };
    });

    return json_({
      ok: true,
      generatedAt: new Date().toISOString(),
      updatedAt: properties.getProperty('LAST_UPDATED_AT') || '',
      updatedBy: properties.getProperty('LAST_UPDATED_BY') || '',
      displaySettings: readDisplaySettings_(spreadsheet),
      basicEdLeaderboard: readBasicEd_(spreadsheet).basicEdLeaderboard,
      specialEvents: readBasicEd_(spreadsheet).specialEvents,
      leaderboard: leaderboard,
      matches2: readMatches2_(spreadsheet, true),
      matches: matches,
      media: media,
      announcements: announcements
    });
  } catch (error) {
    return json_({ ok: false, generatedAt: new Date().toISOString(), error: error.message });
  }
}

/**
 * Authenticated admin operations. Requests are sent as a URL-encoded `payload`
 * field to avoid cross-origin preflight requests from a static dashboard.
 */
function doPost(event) {
  try {
    var request = JSON.parse(text_(event && event.parameter && event.parameter.payload) || '{}');
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    if (request.action === 'login') {
      var adminUser = authenticateAdmin_(request.username, request.password);
      var sessionToken = createAdminSession_(adminUser);
      return json_({
        ok: true,
        sessionToken: sessionToken,
        username: adminUser.username,
        user: publicAdminProfile_(adminUser),
        data: readAdminSnapshot_(spreadsheet)
      });
    }

    var sessionUser = requireAdminSession_(request.sessionToken);

    if (request.action === 'logout') {
      CacheService.getScriptCache().remove('ADMIN_SESSION_' + text_(request.sessionToken));
      return json_({ ok: true });
    }

    if (request.action === 'loadAdmin') {
      return json_({
        ok: true,
        username: sessionUser.username,
        user: publicAdminProfile_(sessionUser),
        data: readAdminSnapshot_(spreadsheet)
      });
    }

    if (request.action === 'listAdmins' || request.action === 'manageAdmin') {
      return json_({ ok: true, users: manageAdministrators_(sessionUser, request.action, request.data || {}) });
    }
    if (request.action === 'exportRecords') {
      var exportLock = LockService.getScriptLock();
      exportLock.waitLock(10000);
      try {
        return json_({ ok: true, data: readAdminData_(spreadsheet), history: readPointsHistory_(spreadsheet, true), exportedAt: new Date().toISOString() });
      } finally { exportLock.releaseLock(); }
    }
    if (request.action === 'loadHistory') {
      return json_({ ok: true, history: readPointsHistory_(spreadsheet) });
    }
    if (request.action === 'saveAll') {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        sessionUser = requireAdminSession_(request.sessionToken);
        var properties = PropertiesService.getScriptProperties();
        var revision = properties.getProperty('DATA_REVISION') || '0';
        if (!request.data || request.data.revision !== revision) {
          return json_({ ok: false, code: 'CONFLICT', error: 'Another administrator updated the dashboard. Review the latest changes before saving.', data: readAdminData_(spreadsheet) });
        }
        var before = readAdminData_(spreadsheet);
        var changes = pointChanges_(before, request.data);
        var updatedAt = new Date().toISOString();
        var updatedBy = sessionUser.displayName || sessionUser.username;
        var nextRevision = Utilities.getUuid();
        // Advance the revision before writes so a partially failed save also invalidates stale forms.
        properties.setProperty('DATA_REVISION', nextRevision);
        commitDashboard_(spreadsheet, request.data, changes, sessionUser, updatedAt, nextRevision);
        properties.setProperties({
          LAST_UPDATED_AT: updatedAt,
          LAST_UPDATED_BY: updatedBy
        });
        SpreadsheetApp.flush();
        return json_({ ok: true, updatedAt: updatedAt, updatedBy: updatedBy, revision: nextRevision });
      } finally {
        lock.releaseLock();
      }
    }

    throw new Error('Unknown admin action.');
  } catch (error) {
    return json_({ ok: false, error: error.message });
  }
}

/**
 * Run this from the Apps Script editor for every committee administrator.
 * Reusing a username updates that profile and password; other accounts remain intact.
 */
function readAdminSnapshot_(spreadsheet) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return readAdminData_(spreadsheet); } finally { lock.releaseLock(); }
}

function setupSystemOwner() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Designate system owner', 'Enter the existing administrator username to grant account-management access:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = getAdminUsers_();
    var user = users.filter(function(item) { return item.username.toLowerCase() === text_(response.getResponseText()).toLowerCase() && item.active !== false; })[0];
    if (!user) throw new Error('Active administrator not found.');
    user.role = 'owner';
    saveAdminUsers_(users);
  } finally { lock.releaseLock(); }
  ui.alert('Owner access granted. Sign in again to see Administrators.');
}

function manageAdministrators_(actor, action, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = getAdminUsers_();
    var owner = users.filter(function(user) { return user.username === actor.username && user.active !== false && user.role === 'owner'; })[0];
    if (!owner) throw new Error('Only a system owner can manage administrators.');
    if (action === 'manageAdmin') {
      var username = text_(data.username);
      var existing = users.filter(function(user) { return user.username.toLowerCase() === username.toLowerCase(); })[0];
      if (data.operation === 'create') {
        if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error('Use 3–40 letters, numbers, dots, underscores or hyphens for the username.');
        if (existing) throw new Error('That username already exists.');
        if (typeof data.password !== 'string' || data.password.length < 8) throw new Error('Use a password with at least 8 characters.');
        var salt = Utilities.getUuid();
        users.push({ username: username, displayName: text_(data.displayName).slice(0,100) || username, photoUrl: '', active: true, role: 'admin', salt: salt, passwordHash: hashAdminPassword_(data.password, salt) });
      } else if (data.operation === 'setActive') {
        if (!existing || typeof data.active !== 'boolean') throw new Error('Invalid administrator.');
        if (existing.username === owner.username || existing.role === 'owner') throw new Error('Owner accounts cannot be deactivated here.');
        existing.active = data.active;
        existing.sessionVersion = (existing.sessionVersion || 0) + 1;
      } else { throw new Error('Invalid account operation.'); }
      saveAdminUsers_(users);
    }
    return users.map(publicAdminProfile_);
  } finally { lock.releaseLock(); }
}

function pointChanges_(before, after) {
  var changes = [];
  ['leaderboard', 'basicEdLeaderboard'].forEach(function(section) {
    if (!Array.isArray(after[section])) return;
    var key = section === 'leaderboard' ? 'dept' : 'teamId';
    after[section].forEach(function(row) {
      var previous = (before[section] || []).filter(function(item) { return item[key] === row[key]; })[0];
      var oldPoints = previous ? Number(previous.points) : 0;
      var newPoints = Number(row.points);
      if (oldPoints !== newPoints) changes.push({ team: row[key], oldPoints: oldPoints, newPoints: newPoints });
    });
  });
  return changes;
}

function commitDashboard_(spreadsheet, data, changes, actor, timestamp, revision) {
  var names = ['Leaderboard', 'BasicEdLeaderboard', 'SpecialEvents', 'DisplaySettings', 'Matches', 'Matches2', 'Announcements', 'Media', 'PointsHistory'];
  var backups = names.map(function(name) {
    var sheet = spreadsheet.getSheetByName(name);
    return { name: name, existed: !!sheet, rows: sheet ? sheet.getDataRange().getValues() : [] };
  });
  try {
    saveAdminData_(spreadsheet, data);
    appendPointsHistory_(spreadsheet, changes, actor, timestamp, revision);
    SpreadsheetApp.flush();
  } catch (error) {
    try {
      backups.forEach(function(backup) {
        var sheet = spreadsheet.getSheetByName(backup.name);
        if (!backup.existed) { if (sheet) spreadsheet.deleteSheet(sheet); return; }
        sheet.clearContents();
        if (backup.rows.length && backup.rows[0].length) sheet.getRange(1, 1, backup.rows.length, backup.rows[0].length).setValues(backup.rows);
      });
      SpreadsheetApp.flush();
    } catch (_) { throw new Error('Save failed and recovery could not finish. Check the Google Sheet before saving again.'); }
    throw new Error('Save failed; previous results were restored. Review the latest data before retrying. ' + error.message);
  }
}

function appendPointsHistory_(spreadsheet, changes, actor, timestamp, revision) {
  if (!changes.length) return;
  var sheet = spreadsheet.getSheetByName('PointsHistory') || spreadsheet.insertSheet('PointsHistory');
  if (!sheet.getLastRow()) sheet.appendRow(['Timestamp', 'Username', 'Administrator', 'Team', 'OldPoints', 'NewPoints', 'Change', 'Revision']);
  var safe = function(value) { return /^[=+@-]/.test(String(value)) ? "'" + value : value; };
  sheet.getRange(sheet.getLastRow() + 1, 1, changes.length, 8).setValues(changes.map(function(change) {
    return [timestamp, safe(actor.username), safe(actor.displayName || actor.username), change.team, change.oldPoints, change.newPoints, change.newPoints - change.oldPoints, revision];
  }));
}

function readPointsHistory_(spreadsheet, fullHistory) {
  var sheet = spreadsheet.getSheetByName('PointsHistory');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var start = fullHistory ? 2 : Math.max(2, sheet.getLastRow() - 199);
  return sheet.getRange(start, 1, sheet.getLastRow() - start + 1, 8).getValues().reverse().map(function(row) {
    return { timestamp: row[0] instanceof Date ? row[0].toISOString() : row[0], username: row[1], administrator: row[2], team: row[3], oldPoints: row[4], newPoints: row[5], change: row[6], revision: row[7] };
  });
}

function setupAdminLogin() {
  var ui = SpreadsheetApp.getUi();
  var usernameResponse = ui.prompt(
    'Sportsfest administrator',
    'Enter the administrator username:',
    ui.ButtonSet.OK_CANCEL
  );
  if (usernameResponse.getSelectedButton() !== ui.Button.OK) return;
  var username = text_(usernameResponse.getResponseText());
  if (username.length < 3) {
    ui.alert('The username must contain at least 3 characters.');
    return;
  }

  var displayNameResponse = ui.prompt(
    'Administrator profile',
    'Enter the name to show in the admin dashboard:',
    ui.ButtonSet.OK_CANCEL
  );
  if (displayNameResponse.getSelectedButton() !== ui.Button.OK) return;
  var displayName = text_(displayNameResponse.getResponseText()) || username;

  var photoResponse = ui.prompt(
    'Administrator profile',
    'Enter a public HTTPS photo URL, or leave this blank to show initials:',
    ui.ButtonSet.OK_CANCEL
  );
  if (photoResponse.getSelectedButton() !== ui.Button.OK) return;
  var photoUrl = normalizeAdminPhotoUrl_(photoResponse.getResponseText());

  var passwordResponse = ui.prompt(
    'Sportsfest administrator',
    'Enter a password with at least 8 characters:',
    ui.ButtonSet.OK_CANCEL
  );
  if (passwordResponse.getSelectedButton() !== ui.Button.OK) return;
  var password = String(passwordResponse.getResponseText() || '');
  if (password.length < 8) {
    ui.alert('The password must contain at least 8 characters.');
    return;
  }

  var salt = Utilities.getUuid();
  var users = getAdminUsers_();
  var normalizedUsername = username.toLowerCase();
  var replacement = {
    username: username,
    displayName: displayName,
    photoUrl: photoUrl,
    salt: salt,
    passwordHash: hashAdminPassword_(password, salt),
    active: true
  };
  var replaced = false;
  users = users.map(function(user) {
    if (text_(user.username).toLowerCase() !== normalizedUsername) return user;
    replaced = true;
    replacement.role = user.role || 'admin';
    replacement.sessionVersion = (user.sessionVersion || 0) + 1;
    return replacement;
  });
  if (!replaced) users.push(replacement);
  saveAdminUsers_(users);
  ui.alert(
    (replaced ? 'Administrator updated: ' : 'Administrator added: ') +
    displayName + ' (' + username + ').\n\nTotal active accounts: ' +
    users.filter(function(user) { return user.active !== false; }).length
  );
}

function authenticateAdmin_(providedUsername, providedPassword) {
  var users = getAdminUsers_();
  if (!users.length) {
    throw new Error('Administrator login is not configured. Run setupAdminLogin in Apps Script.');
  }
  var normalizedUsername = text_(providedUsername).toLowerCase();
  var user = users.filter(function(candidate) {
    return candidate.active !== false && text_(candidate.username).toLowerCase() === normalizedUsername;
  })[0];
  var passwordMatches = user &&
    hashAdminPassword_(String(providedPassword || ''), user.salt) === user.passwordHash;
  if (!user || !passwordMatches) throw new Error('Incorrect username or password.');
  return user;
}

function getAdminUsers_() {
  var properties = PropertiesService.getScriptProperties();
  var storedUsers = properties.getProperty('ADMIN_USERS');
  if (storedUsers) {
    try {
      var parsedUsers = JSON.parse(storedUsers);
      if (Array.isArray(parsedUsers)) return parsedUsers;
    } catch (_) {}
  }

  // Automatically preserve the original single administrator account.
  var legacyUsername = properties.getProperty('ADMIN_USERNAME');
  var legacySalt = properties.getProperty('ADMIN_PASSWORD_SALT');
  var legacyHash = properties.getProperty('ADMIN_PASSWORD_HASH');
  if (!legacyUsername || !legacySalt || !legacyHash) return [];
  var migratedUsers = [{
    username: legacyUsername,
    displayName: legacyUsername,
    photoUrl: '',
    salt: legacySalt,
    passwordHash: legacyHash,
    active: true
  }];
  saveAdminUsers_(migratedUsers);
  return migratedUsers;
}

function saveAdminUsers_(users) {
  PropertiesService.getScriptProperties().setProperty('ADMIN_USERS', JSON.stringify(users));
}

function publicAdminProfile_(user) {
  return {
    username: text_(user.username),
    displayName: text_(user.displayName) || text_(user.username),
    photoUrl: text_(user.photoUrl),
    role: user.role === 'owner' ? 'owner' : 'admin',
    active: user.active !== false
  };
}

function normalizeAdminPhotoUrl_(value) {
  var url = text_(value);
  if (!url) return '';
  if (!/^https:\/\//i.test(url)) return '';
  var driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  return driveMatch
    ? 'https://drive.google.com/uc?export=view&id=' + driveMatch[1]
    : url;
}

/** Run this to see all profiles without exposing password hashes. */
function listAdminProfiles() {
  var profiles = getAdminUsers_().map(publicAdminProfile_);
  Logger.log(JSON.stringify(profiles, null, 2));
  return profiles;
}

/** Run this to remove one administrator by username. */
function removeAdminLogin() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Remove administrator',
    'Enter the exact username to remove:',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var username = text_(response.getResponseText()).toLowerCase();
  var users = getAdminUsers_();
  var remaining = users.filter(function(user) {
    return text_(user.username).toLowerCase() !== username;
  });
  if (remaining.length === users.length) {
    ui.alert('No administrator was found with that username.');
    return;
  }
  if (!remaining.length) {
    ui.alert('The last administrator cannot be removed. Add another account first.');
    return;
  }
  if (users.some(function(user) { return user.role === 'owner' && user.active !== false; }) && !remaining.some(function(user) { return user.role === 'owner' && user.active !== false; })) {
    ui.alert('The last active owner cannot be removed. Designate another system owner first.');
    return;
  }
  saveAdminUsers_(remaining);
  ui.alert('Administrator removed.');
}

function hashAdminPassword_(password, salt) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + password,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest);
}

function createAdminSession_(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var profile = publicAdminProfile_(user);
  profile.sessionVersion = user.sessionVersion || 0;
  CacheService.getScriptCache().put('ADMIN_SESSION_' + token, JSON.stringify(profile), 21600);
  return token;
}

function requireAdminSession_(sessionToken) {
  var token = text_(sessionToken);
  if (!token) throw new Error('Please sign in.');
  var storedSession = CacheService.getScriptCache().get('ADMIN_SESSION_' + token);
  if (!storedSession) throw new Error('Your session has expired. Please sign in again.');
  var user;
  try {
    user = JSON.parse(storedSession);
  } catch (_) {
    user = { username: storedSession, displayName: storedSession, photoUrl: '' };
  }
  var sessionVersion = user.sessionVersion || 0;
  user = getAdminUsers_().filter(function(candidate) {
    return candidate.active !== false && text_(candidate.username).toLowerCase() === text_(user.username).toLowerCase();
  })[0];
  if (!user) throw new Error('Your account is inactive. Please sign in with an active account.');
  if ((user.sessionVersion || 0) !== sessionVersion) throw new Error('Your session has expired. Please sign in again.');
  var profile = publicAdminProfile_(user);
  profile.sessionVersion = sessionVersion;
  CacheService.getScriptCache().put('ADMIN_SESSION_' + token, JSON.stringify(profile), 21600);
  return user;
}

function readAdminData_(spreadsheet) {
  var leaderboard = readObjects_(spreadsheet, 'Leaderboard').map(function(row) {
    return {
      dept: text_(row.dept || row.department).toUpperCase(),
      points: number_(row.points || row.totalpoints)
    };
  });
  var matches = spreadsheet.getSheetByName('Matches')
    ? readObjects_(spreadsheet, 'Matches').map(function(row) {
        return {
          date: dateInputValue_(row.date),
          sport: text_(row.sport),
          teamA: text_(row.teama).toUpperCase(),
          teamB: text_(row.teamb).toUpperCase(),
          time: text_(row.time),
          venue: text_(row.venue),
          status: text_(row.status),
          active: row.active == null || row.active === '' || boolean_(row.active)
        };
      })
    : [];
  var announcements = spreadsheet.getSheetByName('Announcements')
    ? readObjects_(spreadsheet, 'Announcements').map(function(row) {
        return {
          message: text_(row.message || row.announcement || row.title),
          active: row.active == null || row.active === '' || boolean_(row.active)
        };
      })
    : [];
  var media = spreadsheet.getSheetByName('Media')
    ? readObjects_(spreadsheet, 'Media').map(function(row) {
        return {
          type: text_(row.type).toLowerCase(),
          title: text_(row.title),
          message: text_(row.message),
          url: text_(row.url),
          poster: text_(row.poster),
          duration: number_(row.duration),
          active: row.active == null || row.active === '' || boolean_(row.active)
        };
      })
    : [];
  var properties = PropertiesService.getScriptProperties();
  return {
    displaySettings: readDisplaySettings_(spreadsheet),
    revision: properties.getProperty('DATA_REVISION') || '0',
    basicEdLeaderboard: readBasicEd_(spreadsheet).basicEdLeaderboard,
    specialEvents: readBasicEd_(spreadsheet).specialEvents,
    leaderboard: leaderboard,
    matches2: readMatches2_(spreadsheet, false),
    matches: matches,
    announcements: announcements,
    media: media,
    updatedAt: properties.getProperty('LAST_UPDATED_AT') || '',
    updatedBy: properties.getProperty('LAST_UPDATED_BY') || ''
  };
}

function saveAdminData_(spreadsheet, data) {
  // Validate new sections before any sheet is changed. Omitted sections remain untouched.
  var basicEdRows = validateBasicEd_(data);
  var displayRows = null;
  if (data.displaySettings !== undefined) {
    var settings = data.displaySettings;
    if (!settings || !settings.sections) throw new Error('Update the admin page to use section switches.');
    displayRows = Object.keys(DISPLAY_DEFAULTS).map(function(id) {
      if (typeof settings.sections[id] !== 'boolean') throw new Error('Invalid section switch: ' + id);
      return [id, settings.sections[id]];
    });
  }
  var allowedDepartments = ['SECSA', 'SBA', 'STED', 'SHARP', 'SHTM'];
  var leaderboard = Array.isArray(data.leaderboard) ? data.leaderboard : [];
  var matches = Array.isArray(data.matches) ? data.matches : [];
  var announcements = Array.isArray(data.announcements) ? data.announcements : [];
  var media = Array.isArray(data.media) ? data.media : [];

  var leaderboardRows = leaderboard.map(function(row) {
    var dept = text_(row.dept).toUpperCase();
    if (allowedDepartments.indexOf(dept) === -1) throw new Error('Invalid department: ' + dept);
    if (typeof row.points !== 'number' || !Number.isInteger(row.points) || row.points < 0 || row.points > 999999) throw new Error('Points must be whole numbers from 0 to 999999.');
    if (leaderboard.filter(function(item) { return text_(item.dept).toUpperCase() === dept; }).length !== 1) throw new Error('Duplicate department: ' + dept);
    return [dept, row.points];
  });
  var matchRows = matches.map(function(row) {
    return [
      text_(row.date), text_(row.sport), text_(row.teamA).toUpperCase(),
      text_(row.teamB).toUpperCase(), text_(row.time), text_(row.venue),
      text_(row.status) || 'Scheduled', boolean_(row.active)
    ];
  }).filter(function(row) { return row[1] && row[2] && row[3]; });
  var matches2Rows = data.matches2 === undefined ? null : (Array.isArray(data.matches2) ? data.matches2 : []).map(function(row) {
    return [text_(row.date), text_(row.sport), text_(row.teamA).toUpperCase(), text_(row.teamB).toUpperCase(), text_(row.time), text_(row.venue), text_(row.status)||'Scheduled', boolean_(row.active)];
  }).filter(function(row) { return row[1] && row[2] && row[3]; });
  var announcementRows = announcements.map(function(row) {
    return [text_(row.message), boolean_(row.active)];
  }).filter(function(row) { return row[0]; });
  var mediaRows = media.map(function(row) {
    return [
      text_(row.type).toLowerCase(), text_(row.title), text_(row.message),
      text_(row.url), text_(row.poster), Math.max(0, number_(row.duration)),
      boolean_(row.active)
    ];
  }).filter(function(row) { return row[0]; });

  if (basicEdRows.scores) writeSheet_(spreadsheet, 'BasicEdLeaderboard', ['Department', 'TeamID', 'Team', 'Points'], basicEdRows.scores);
  if (displayRows) writeSheet_(spreadsheet, 'DisplaySettings', ['Setting', 'Value'], displayRows);
  if (basicEdRows.awards) writeSheet_(spreadsheet, 'SpecialEvents', ['EventID', 'Event', 'WinnerTeamID'], basicEdRows.awards);
  writeSheet_(spreadsheet, 'Leaderboard', ['Dept', 'Points'], leaderboardRows);
  if (matches2Rows) writeSheet_(spreadsheet, 'Matches2', ['Date', 'Sport', 'TeamA', 'TeamB', 'Time', 'Venue', 'Status', 'Active'], matches2Rows);
  writeSheet_(spreadsheet, 'Matches', ['Date', 'Sport', 'TeamA', 'TeamB', 'Time', 'Venue', 'Status', 'Active'], matchRows);
  writeSheet_(spreadsheet, 'Announcements', ['Message', 'Active'], announcementRows);
  writeSheet_(spreadsheet, 'Media', ['Type', 'Title', 'Message', 'URL', 'Poster', 'Duration', 'Active'], mediaRows);
}

var DISPLAY_DEFAULTS = {senior:true,junior:true,grade:true,college:false,awards:true,matches:true,matches2:false,promo:false,sportsfest:false};
function readDisplaySettings_(spreadsheet) {
  var rows = spreadsheet.getSheetByName('DisplaySettings') ? readObjects_(spreadsheet, 'DisplaySettings') : [];
  var sections = Object.assign({}, DISPLAY_DEFAULTS);
  rows.forEach(function(row) {
    var id = text_(row.setting).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(sections,id)) sections[id] = boolean_(row.value);
  });
  return { sections: sections };
}
// Separate fixture sheet, same editor fields and today/active filtering as Matches.
function readMatches2_(spreadsheet, publicOnly) {
  var rows = spreadsheet.getSheetByName('Matches2') ? readObjects_(spreadsheet,'Matches2') : [];
  return rows.filter(function(row) { return !publicOnly || (isToday_(row.date) && (row.active == null || row.active === '' || boolean_(row.active))); }).map(function(row) {
    return { date:dateInputValue_(row.date), sport:text_(row.sport), teamA:text_(row.teama).toUpperCase(), teamB:text_(row.teamb).toUpperCase(), time:text_(row.time), venue:text_(row.venue), status:text_(row.status)||'Scheduled', active:row.active == null || row.active === '' || boolean_(row.active) };
  });
}

function isAwardTeam_(winner) {
  return ['SECSA', 'SBA', 'STED', 'SHARP', 'SHTM'].indexOf(winner) !== -1 ||
    BASIC_ED_TEAMS.some(function(team) { return team.teamId === winner; });
}

function readBasicEd_(spreadsheet) {
  var scores = spreadsheet.getSheetByName('BasicEdLeaderboard') ? readObjects_(spreadsheet, 'BasicEdLeaderboard') : [];
  var awards = spreadsheet.getSheetByName('SpecialEvents') ? readObjects_(spreadsheet, 'SpecialEvents') : [];
  return {
    basicEdLeaderboard: BASIC_ED_TEAMS.map(function(team) {
      var row = scores.filter(function(row) { return text_(row.teamid) === team.teamId; })[0];
      var score = row ? Number(row.points) : 0;
      return { teamId: team.teamId, points: Number.isInteger(score) && score >= 0 && score <= 999999 ? score : 0 };
    }),
    specialEvents: BASIC_ED_EVENTS.map(function(event) {
      var row = awards.filter(function(row) { return text_(row.eventid) === event.id; })[0];
      var winner = row ? text_(row.winnerteamid) : '';
      return { eventId: event.id, winnerTeamId: isAwardTeam_(winner) ? winner : '' };
    })
  };
}

function validateBasicEd_(data) {
  var result = {};
  if (data.basicEdLeaderboard !== undefined) {
    if (!Array.isArray(data.basicEdLeaderboard) || data.basicEdLeaderboard.length !== BASIC_ED_TEAMS.length) throw new Error('Provide all Basic Education teams.');
    result.scores = BASIC_ED_TEAMS.map(function(team) {
      var matches = data.basicEdLeaderboard.filter(function(row) { return row && row.teamId === team.teamId; });
      if (matches.length !== 1) throw new Error('Missing or duplicate team: ' + team.teamId);
      var points = matches[0].points;
      if (typeof points !== 'number' || !Number.isInteger(points) || points < 0 || points > 999999) throw new Error('Points must be whole numbers from 0 to 999999.');
      return [team.department, team.teamId, team.team, points];
    });
  }
  if (data.specialEvents !== undefined) {
    if (!Array.isArray(data.specialEvents) || data.specialEvents.length !== BASIC_ED_EVENTS.length) throw new Error('Provide all four special events.');
    result.awards = BASIC_ED_EVENTS.map(function(event) {
      var matches = data.specialEvents.filter(function(row) { return row && row.eventId === event.id; });
      if (matches.length !== 1) throw new Error('Missing or duplicate event: ' + event.id);
      var winner = matches[0].winnerTeamId;
      if (winner !== '' && !isAwardTeam_(winner)) throw new Error('Invalid winning team.');
      return [event.id, event.name, winner];
    });
  }
  return result;
}

function writeSheet_(spreadsheet, name, headers, rows) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function readObjects_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing required sheet: ' + sheetName);
  var values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  var headers = values[0].map(key_);
  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return text_(cell) !== ''; });
  }).map(function(row) {
    var object = {};
    headers.forEach(function(header, index) { object[header] = row[index]; });
    return object;
  });
}

function readOptionalMedia_(spreadsheet) {
  if (!spreadsheet.getSheetByName('Media')) return [];
  return readObjects_(spreadsheet, 'Media').filter(function(row) {
    var type = text_(row.type).toLowerCase();
    return type === 'ticker' || type === 'announcement';
  });
}

function key_(value) {
  return text_(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function text_(value) {
  return value == null ? '' : String(value).trim();
}

function number_(value) {
  var number = Number(text_(value).replace(/,/g, ''));
  return isFinite(number) ? number : 0;
}

function boolean_(value) {
  return value === true || ['true', 'yes', 'y', '1'].indexOf(text_(value).toLowerCase()) !== -1;
}

function dateInputValue_(value) {
  if (value == null || text_(value) === '') return '';
  var date = new Date(value);
  if (isNaN(date.getTime())) return text_(value);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function isToday_(value) {
  if (value == null || text_(value) === '') return true;
  var date = new Date(value);
  if (isNaN(date.getTime())) return true;
  var timeZone = Session.getScriptTimeZone();
  return Utilities.formatDate(date, timeZone, 'yyyy-MM-dd') ===
    Utilities.formatDate(new Date(), timeZone, 'yyyy-MM-dd');
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

// Stable IDs match basic-ed-data.js; display names may change without losing results.
var BASIC_ED_TEAMS = [
  {
    "teamId": "harks",
    "department": "Grade School",
    "team": "Mighty Sharks"
  },
  {
    "teamId": "cubs",
    "department": "Grade School",
    "team": "Fearless Cubs"
  },
  {
    "teamId": "greenfinches",
    "department": "Junior High School",
    "team": "Fervid Greenfinches"
  },
  {
    "teamId": "tigers",
    "department": "Junior High School",
    "team": "Roaring Tigers"
  },
  {
    "teamId": "vipers",
    "department": "Junior High School",
    "team": "Grebesha Vipers"
  },
  {
    "teamId": "wolves",
    "department": "Junior High School",
    "team": "Azura Wolves"
  },
  {
    "teamId": "centaurus",
    "department": "Senior High School",
    "team": "Ethereal Centaurus"
  },
  {
    "teamId": "stallion",
    "department": "Senior High School",
    "team": "Ferocious Stallion"
  },
  {
    "teamId": "griffin",
    "department": "Senior High School",
    "team": "Griffin Guardian"
  }
];
var BASIC_ED_EVENTS = [
  {
    "id": "cheerdance",
    "name": "Cheerdance Competition"
  },
  {
    "id": "bench",
    "name": "Bench Cheering Competition"
  },
  {
    "id": "mr",
    "name": "Mr. Sportsfest"
  },
  {
    "id": "ms",
    "name": "Ms. Sportsfest"
  }
];
