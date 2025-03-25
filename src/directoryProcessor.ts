import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { NpyParser } from './npyParser';
import { XyzGenerator } from './xyzGenerator';

/**
 * Handles processing of dpdata directory structures
 */
export class DirectoryProcessor {
    /**
     * Finds all set.XXX directories within a given directory
     * @param baseDir Base directory to search in
     * @returns Array of paths to set.XXX directories
     */
    public static async findSetDirectories(baseDir: string): Promise<string[]> {
        try {
            const dirEntries = await fs.promises.readdir(baseDir, { withFileTypes: true });
            const setDirs: string[] = [];
            
            for (const entry of dirEntries) {
                if (entry.isDirectory() && entry.name.match(/^set\.\d+$/)) {
                    setDirs.push(path.join(baseDir, entry.name));
                }
            }
            
            return setDirs;
        } catch (error) {
            throw new Error(`Failed to find set directories in ${baseDir}: ${error}`);
        }
    }

    /**
     * Finds .npy files within a directory
     * @param directory Directory to search in
     * @returns Object mapping file types to paths
     */
    public static async findNpyFiles(directory: string): Promise<{ [key: string]: string }> {
        try {
            const fileEntries = await fs.promises.readdir(directory, { withFileTypes: true });
            const result: { [key: string]: string } = {};
            
            for (const entry of fileEntries) {
                if (entry.isFile() && entry.name.endsWith('.npy')) {
                    const baseName = path.basename(entry.name, '.npy');
                    result[baseName] = path.join(directory, entry.name);
                }
            }
            
            return result;
        } catch (error) {
            throw new Error(`Failed to find NPY files in ${directory}: ${error}`);
        }
    }

    /**
     * Finds .raw files within a directory
     * @param directory Directory to search in
     * @returns Object mapping file types to paths
     */
    public static async findRawFiles(directory: string): Promise<{ [key: string]: string }> {
        try {
            const fileEntries = await fs.promises.readdir(directory, { withFileTypes: true });
            const result: { [key: string]: string } = {};
            
            for (const entry of fileEntries) {
                if (entry.isFile() && entry.name.endsWith('.raw')) {
                    const baseName = path.basename(entry.name, '.raw');
                    result[baseName] = path.join(directory, entry.name);
                }
            }
            
            return result;
        } catch (error) {
            throw new Error(`Failed to find RAW files in ${directory}: ${error}`);
        }
    }

    /**
     * Processes a set directory to generate text files from NPY files
     * @param setDir Path to the set directory
     * @param typeMapPath Path to type_map.raw file
     * @param typePath Path to type.raw file
     * @param outputDir Directory to store output text files
     * @returns Object with paths to generated text files
     */
    public static async processSetDirectory(
        setDir: string,
        typeMapPath: string,
        typePath: string,
        outputDir?: string
    ): Promise<{ [key: string]: string }> {
        try {
            // Create output directory
            const finalOutputDir = outputDir || path.join(setDir, 'txt_output');
            await fs.promises.mkdir(finalOutputDir, { recursive: true });
            
            // Find NPY files in the set directory
            const npyFiles = await this.findNpyFiles(setDir);
            const npyFilePaths = Object.values(npyFiles);
            
            if (npyFilePaths.length === 0) {
                throw new Error(`No NPY files found in ${setDir}`);
            }
            
            // Process NPY files
            const processedFiles = await NpyParser.processNpyFiles(
                npyFilePaths,
                typeMapPath,
                typePath,
                finalOutputDir
            );
            
            return processedFiles;
        } catch (error) {
            throw new Error(`Failed to process set directory ${setDir}: ${error}`);
        }
    }

    /**
     * Processes a dpdata directory and generates XYZ files for each set
     * @param baseDir Base directory containing sets and raw files
     * @param outputFormat 'xyz', 'extxyz', or 'extxyz-full'
     * @param pbcOption 'box' or 'fff' for ExtXYZ
     * @returns Object with paths to generated XYZ files
     */
    public static async processDpDataDirectory(
        baseDir: string,
        outputFormat: 'xyz' | 'extxyz' | 'extxyz-full' = 'xyz',
        pbcOption: 'box' | 'fff' = 'fff'
    ): Promise<{ [key: string]: string }> {
        try {
            // Find type and type_map files in base directory
            const rawFiles = await this.findRawFiles(baseDir);
            const typeMapPath = rawFiles['type_map'] || '';
            const typePath = rawFiles['type'] || '';
            
            if (!typeMapPath && !typePath) {
                throw new Error(`No type_map.raw or type.raw files found in ${baseDir}`);
            }
            
            // Find all set directories
            const setDirs = await this.findSetDirectories(baseDir);
            if (setDirs.length === 0) {
                throw new Error(`No set.XXX directories found in ${baseDir}`);
            }
            
            const results: { [key: string]: string } = {};
            
            // Process each set directory
            for (const setDir of setDirs) {
                const setName = path.basename(setDir);
                const txtOutputDir = path.join(baseDir, `${setName}_txt_output`);
                
                // Convert NPY to TXT
                const txtFiles = await this.processSetDirectory(
                    setDir,
                    typeMapPath,
                    typePath,
                    txtOutputDir
                );
                
                // Check for real_atom_types.txt
                let atomTypesPath = '';
                if (txtFiles['real_atom_types']) {
                    atomTypesPath = txtFiles['real_atom_types'];
                } else if (fs.existsSync(path.join(txtOutputDir, 'real_atom_types.txt'))) {
                    atomTypesPath = path.join(txtOutputDir, 'real_atom_types.txt');
                } else {
                    throw new Error(`real_atom_types.txt not found for ${setDir}`);
                }
                
                // Required files for XYZ generation
                const requiredFiles = {
                    atomTypes: atomTypesPath,
                    coordinates: txtFiles['coord.npy'] || '',
                    energies: txtFiles['energy.npy'] || ''
                };
                
                if (!requiredFiles.coordinates || !requiredFiles.energies) {
                    throw new Error(`Missing required files for ${setDir}`);
                }
                
                // Additional files for ExtXYZ
                const optionalFiles = {
                    forces: txtFiles['force.npy'] || '',
                    box: txtFiles['box.npy'] || ''
                };
                
                // Generate XYZ or ExtXYZ
                const outputPath = path.join(baseDir, `${setName}.${outputFormat === 'extxyz-full' ? 'extxyz' : outputFormat}`);
                
                if (outputFormat === 'xyz') {
                    const xyzPath = await XyzGenerator.generateXyz(
                        requiredFiles.atomTypes,
                        requiredFiles.coordinates,
                        requiredFiles.energies,
                        outputPath
                    );
                    results[setName] = xyzPath;
                } else if (outputFormat === 'extxyz') {
                    // 标准ExtXYZ只包含基本属性
                    const extxyzPath = await XyzGenerator.generateExtXyz(
                        requiredFiles.atomTypes,
                        requiredFiles.coordinates,
                        requiredFiles.energies,
                        optionalFiles.forces,
                        optionalFiles.box,
                        pbcOption,
                        outputPath,
                        false // 不包含所有属性
                    );
                    results[setName] = extxyzPath;
                } else if (outputFormat === 'extxyz-full') {
                    // 完整ExtXYZ包含所有发现的属性
                    const extxyzPath = await XyzGenerator.generateExtXyz(
                        requiredFiles.atomTypes,
                        requiredFiles.coordinates,
                        requiredFiles.energies,
                        optionalFiles.forces,
                        optionalFiles.box,
                        pbcOption,
                        outputPath,
                        true // 包含所有属性
                    );
                    results[setName] = extxyzPath;
                }
            }
            
            return results;
        } catch (error) {
            throw new Error(`Failed to process dpdata directory ${baseDir}: ${error}`);
        }
    }
}