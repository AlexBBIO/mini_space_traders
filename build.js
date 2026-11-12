// Wraps game.html (the page body: title, styles, markup, script) in a full HTML document, written to index.html.
// game.html is kept body-only because that is the form the Claude artifact publisher takes.
const fs = require('fs'), path = require('path');
const body = fs.readFileSync(path.join(__dirname, 'game.html'), 'utf8');
const head = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}html{box-sizing:border-box}' +
  'body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n';
fs.writeFileSync(path.join(__dirname, 'index.html'), head + body + '\n</body>\n</html>\n');
console.log('index.html written (' + (head.length + body.length) + ' bytes)');
