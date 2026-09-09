const fs = require('node:fs');
const source = fs.readFileSync('admin.html', 'utf8');
fs.writeFileSync('mobile.html', source
  .replace('<title>Sportsfest 2026 Admin</title>', '<title>Sportsfest Mobile Admin</title>')
  .replace("window.open('index.html','_blank')", "window.open('scores.html','_blank')")
  .replace('Southland College Sportsfest 2026 · Authorized access only', 'Southland College Sportsfest 2026 · Authorized access only<br><a href="scores.html">View scores without signing in</a>')
  .replace('</head>', '<link rel="stylesheet" href="mobile.css">\n</head>')
  .replace('</body>', '<script src="mobile.js"></script>\n</body>'));
console.log('Built mobile.html from the shared admin page.');
