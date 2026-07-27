const fs = require('fs');
let C = fs.readFileSync('src/pages/Stats.tsx', 'utf8');

const regex = /return \([\s\S]*?L<\/div>\s*<\/td>/;

const test = C.match(regex);
if (!test) throw new Error("regex -1");

const frag = fs.readFileSync('src/fix_fragment.txt', 'utf8');

fs.writeFileSync('src/pages/Stats.tsx', C.replace(regex, frag));
console.log("Done");
