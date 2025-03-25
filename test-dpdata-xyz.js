// Test script for the dpdata-xyz extension
const fs = require('fs');
const path = require('path');

// Import our built modules from the VSCode extension
const { DirectoryProcessor } = require('./dist/directoryProcessor');

async function main() {
    try {
        // Select a test directory
        const testDir = path.join(__dirname, 'test_data', 'C3H3O4');
        console.log(`Processing test directory: ${testDir}`);
        
        // Set output format
        const outputFormat = 'extxyz'; // Options: 'xyz' or 'extxyz'
        const pbcOption = 'fff'; // Options: 'box' or 'fff'
        
        // Process the directory
        console.log(`Processing with format: ${outputFormat}, PBC option: ${pbcOption}`);
        const results = await DirectoryProcessor.processDpDataDirectory(
            testDir,
            outputFormat,
            pbcOption
        );
        
        // Print results
        console.log('Generated files:');
        for (const [setName, filePath] of Object.entries(results)) {
            console.log(`  ${setName}: ${filePath}`);
            
            // Print contents of the first few lines of the file
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').slice(0, 15);
            console.log(`\nPreview of ${path.basename(filePath)}:`);
            console.log(lines.join('\n'));
            console.log('...');
        }
        
        console.log('\nProcessing completed successfully!');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
