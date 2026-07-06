const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<div id="page-archived-debts" class="page" style="display:none;">', '<div id="page-archived-debts" class="page">');
fs.writeFileSync('index.html', html);
console.log('Removed display:none');
