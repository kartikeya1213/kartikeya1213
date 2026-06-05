const fs = require('fs');
const path = require('path');

const dir = 'profile-3d-contrib';
if (!fs.existsSync(dir)) {
  console.error(`Directory ${dir} does not exist`);
  process.exit(1);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg'));
console.log(`Processing ${files.length} SVG files...`);

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 1. Hide radar chart
  if (content.includes('<g transform="translate(980, 284.5)">')) {
    content = content.replace(
      '<g transform="translate(980, 284.5)">',
      '<g transform="translate(980, 284.5)" display="none">'
    );
  }
  
  // 2. Hide language stats chart
  if (content.includes('<g transform="translate(40, 520)">')) {
    content = content.replace(
      '<g transform="translate(40, 520)">',
      '<g transform="translate(40, 520)" display="none">'
    );
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`- Updated ${file}`);
}

console.log('Post-processing completed successfully!');
