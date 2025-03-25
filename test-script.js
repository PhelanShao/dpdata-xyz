// Test script for the dpdata-xyz extension
const path = require('path');
const { NpyParser } = require('./dist/npyParser');
const { XyzGenerator } = require('./dist/xyzGenerator');
const { DirectoryProcessor } = require('./dist/directoryProcessor');

async function main() {
    try {
        // Choose a test directory
        const testDir = path.join(__dirname, 'test_data', 'C3H3O4');
        console.log(`Processing test directory: ${testDir}`);
        
        // Find raw files
        const typeMapPath = path.join(testDir, 'type_map.raw');
        const typePath = path.join(testDir, 'type.raw');
        
        // Find the set directory
        const setDir = path.join(testDir, 'set.000');
        console.log(`Processing set directory: ${setDir}`);
        
        // Create output directory for text files
        const outputDir = path.join(testDir, 'txt_output');
        
        // Find NPY files in the set directory
        const npyFiles = [
            path.join(setDir, 'coord.npy'),
            path.join(setDir, 'energy.npy'),
            path.join(setDir, 'force.npy'),
        ];
        
        // Process NPY files
        console.log('Converting NPY files to text...');
        const textFiles = await NpyParser.processNpyFiles(
            npyFiles,
            typeMapPath,
            typePath,
            outputDir
        );
        
        console.log('Text files created:');
        for (const [key, value] of Object.entries(textFiles)) {
            console.log(`  ${key} -> ${value}`);
        }
        
        // Generate XYZ file
        console.log('\nGenerating XYZ file...');
        const atomTypesPath = path.join(outputDir, 'real_atom_types.txt');
        const coordPath = path.join(outputDir, 'coord.txt');
        const energyPath = path.join(outputDir, 'energy.txt');
        const outputXyzPath = path.join(testDir, 'output.xyz');
        
        const xyzPath = await XyzGenerator.generateXyz(
            atomTypesPath,
            coordPath,
            energyPath,
            outputXyzPath
        );
        
        console.log(`XYZ file created: ${xyzPath}`);
        
        // Generate ExtXYZ file
        console.log('\nGenerating ExtXYZ file...');
        const forcePath = path.join(outputDir, 'force.txt');
        const outputExtXyzPath = path.join(testDir, 'output.extxyz');
        
        const extXyzPath = await XyzGenerator.generateExtXyz(
            atomTypesPath,
            coordPath,
            energyPath,
            forcePath,
            undefined, // No box data
            'fff',
            outputExtXyzPath
        );
        
        console.log(`ExtXYZ file created: ${extXyzPath}`);
        
        console.log('\nProcessing completed successfully!');
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
