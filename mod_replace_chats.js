const fs = require('fs');

const replacement = fs.readFileSync('mod_chats.js', 'utf8').split('const newChatsTab = `')[1].split('`;')[0];

const code = fs.readFileSync('app/panel/page.tsx', 'utf8');
const lines = code.split('\n');

lines.splice(757, 927 - 757 + 1, replacement);

fs.writeFileSync('app/panel/page.tsx', lines.join('\n'));
