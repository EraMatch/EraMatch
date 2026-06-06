const fs = require('fs');
const path = require('path');
const uiDir = path.join(__dirname, 'src/components/ui');
const files = fs.readdirSync(uiDir).filter(f => f.endsWith('.tsx'));
files.forEach(file => {
    const fullPath = path.join(uiDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    const newContent = content.replace(/from "(@?[^@"]+)@[^"]+"/g, 'from "$1"');
    if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log('Fixed', file);
    }
});
