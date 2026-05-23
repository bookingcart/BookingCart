const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'pages');

const replacements = [
  { regex: /\bbg-white(?!\s+dark:bg-)\b/g, replacement: 'bg-white dark:bg-slate-800' },
  { regex: /\bbg-slate-50(?!\s+dark:bg-)\b/g, replacement: 'bg-slate-50 dark:bg-slate-900' },
  { regex: /\bbg-slate-100(?!\s+dark:bg-)\b/g, replacement: 'bg-slate-100 dark:bg-slate-800' },
  { regex: /\bbg-slate-200(?!\s+dark:bg-)\b/g, replacement: 'bg-slate-200 dark:bg-slate-700' },
  { regex: /\btext-slate-900(?!\s+dark:text-)\b/g, replacement: 'text-slate-900 dark:text-slate-100' },
  { regex: /\btext-slate-800(?!\s+dark:text-)\b/g, replacement: 'text-slate-800 dark:text-slate-200' },
  { regex: /\btext-slate-700(?!\s+dark:text-)\b/g, replacement: 'text-slate-700 dark:text-slate-300' },
  { regex: /\btext-slate-600(?!\s+dark:text-)\b/g, replacement: 'text-slate-600 dark:text-slate-400' },
  { regex: /\btext-slate-500(?!\s+dark:text-)\b/g, replacement: 'text-slate-500 dark:text-slate-400' },
  { regex: /\border-slate-100(?!\s+dark:border-)\b/g, replacement: 'border-slate-100 dark:border-slate-700' },
  { regex: /\border-slate-200(?!\s+dark:border-)\b/g, replacement: 'border-slate-200 dark:border-slate-700' },
  { regex: /\border-slate-300(?!\s+dark:border-)\b/g, replacement: 'border-slate-300 dark:border-slate-600' }
];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;

      for (const { regex, replacement } of replacements) {
        content = content.replace(regex, replacement);
      }

      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDirectory(srcDir);
console.log('Dark mode classes added to src/pages.');
