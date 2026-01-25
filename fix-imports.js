const fs = require('fs');
const path = require('path');

// Directory containing UI components
const uiComponentsDir = path.join(__dirname, 'src', 'components', 'ui');

// Process all files in the directory
fs.readdir(uiComponentsDir, (err, files) => {
  if (err) {
    console.error('Error reading directory:', err);
    return;
  }

  files.forEach(file => {
    if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const filePath = path.join(uiComponentsDir, file);
      
      // Read file content
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          console.error(`Error reading file ${file}:`, err);
          return;
        }

        // Replace versioned imports with regular imports
        const updatedContent = data.replace(
          /(from\s+["'])([^"']+)@\d+\.\d+\.\d+(["'])/g, 
          '$1$2$3'
        );

        // Write the updated content back to the file
        fs.writeFile(filePath, updatedContent, 'utf8', err => {
          if (err) {
            console.error(`Error writing file ${file}:`, err);
            return;
          }
          console.log(`Fixed imports in ${file}`);
        });
      });
    }
  });
});