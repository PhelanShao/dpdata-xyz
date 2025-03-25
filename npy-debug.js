// Diagnostic script for NPY parsing issues
const fs = require('fs');
const path = require('path');

// Function to dump binary data in a readable format
function dumpBinaryData(buffer, length = 50) {
    const headerDump = [];
    console.log(`Buffer length: ${buffer.length} bytes`);
    
    for (let i = 0; i < Math.min(buffer.length, length); i++) {
        const byte = buffer[i];
        let display = '';
        
        // Try to show printable ASCII
        if (byte >= 32 && byte <= 126) {
            display = String.fromCharCode(byte);
        } else {
            display = '.';
        }
        
        headerDump.push({
            index: i,
            hex: byte.toString(16).padStart(2, '0'),
            decimal: byte,
            ascii: display
        });
    }
    
    // Print as a table
    console.table(headerDump);
}

// Function to examine NPY file
function examineNpyFile(filePath) {
    console.log(`\nExamining NPY file: ${filePath}`);
    
    try {
        const buffer = fs.readFileSync(filePath);
        console.log(`File size: ${buffer.length} bytes`);
        
        // Check for NPY magic string
        if (buffer.length < 10) {
            console.error('File too small to be a valid NPY file');
            return false;
        }
        
        console.log('First 10 bytes (hex):');
        for (let i = 0; i < 10; i++) {
            process.stdout.write(buffer[i].toString(16).padStart(2, '0') + ' ');
        }
        console.log();
        
        // Check magic string
        const firstByte = buffer[0];
        const magicString = buffer.toString('ascii', 1, 6);
        
        console.log(`First byte (hex): 0x${firstByte.toString(16)}`);
        console.log(`Magic string: "${magicString}"`);
        
        if (firstByte !== 0x93) {
            console.error('ERROR: First byte is not 0x93');
        }
        
        if (magicString !== 'NUMPY') {
            console.error(`ERROR: Magic string is not "NUMPY"`);
        }
        
        // Dump header for inspection
        console.log('\nHeader dump (first 50 bytes):');
        dumpBinaryData(buffer, 50);
        
        return firstByte === 0x93 && magicString === 'NUMPY';
    } catch (error) {
        console.error(`Error examining NPY file: ${error.message}`);
        return false;
    }
}

// Test all NPY files in a directory
function testNpyFilesInDirectory(dirPath) {
    console.log(`\nTesting all NPY files in: ${dirPath}`);
    
    try {
        const entries = fs.readdirSync(dirPath);
        const npyFiles = entries.filter(entry => entry.endsWith('.npy'));
        
        if (npyFiles.length === 0) {
            console.log('No NPY files found in the directory');
            return;
        }
        
        console.log(`Found ${npyFiles.length} NPY files`);
        
        const results = {};
        for (const npyFile of npyFiles) {
            const filePath = path.join(dirPath, npyFile);
            results[npyFile] = examineNpyFile(filePath);
        }
        
        console.log('\nSummary:');
        for (const [file, valid] of Object.entries(results)) {
            console.log(`${file}: ${valid ? '✅ Valid' : '❌ Invalid'}`);
        }
        
    } catch (error) {
        console.error(`Error testing directory: ${error.message}`);
    }
}

// Run the test on data_0/set.000 directory
const problematicDir = path.join(__dirname, 'test_data', 'data_0', 'set.000');
testNpyFilesInDirectory(problematicDir);

// Also test a directory that might be working
const workingDir = path.join(__dirname, 'test_data', 'C3H3O4', 'set.000');
testNpyFilesInDirectory(workingDir);

// Test e8000_i2000 directory as well
const anotherDir = path.join(__dirname, 'test_data', 'e8000_i2000', 'set.000');
testNpyFilesInDirectory(anotherDir);
