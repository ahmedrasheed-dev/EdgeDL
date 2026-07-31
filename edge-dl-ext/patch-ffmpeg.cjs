const fs = require('fs');
const filePath = './public/ffmpeg/ffmpeg-core.js';
let content = fs.readFileSync(filePath, 'utf8');

// Patch 1: Export FS on Module right before the ready promise resolves
const target = 'readyPromiseResolve(Module)';
const replacement = 'Module["FS"]=FS;readyPromiseResolve(Module)';
content = content.replace(target, replacement);

fs.writeFileSync(filePath, content, 'utf8');

// Verify
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Patch applied:', verify.includes('Module["FS"]=FS;readyPromiseResolve(Module)'));
console.log('File size:', verify.length);
