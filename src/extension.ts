import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NpyParser } from './npyParser';
import { XyzGenerator } from './xyzGenerator';
import { DirectoryProcessor } from './directoryProcessor';

export function activate(context: vscode.ExtensionContext) {
    console.log('DPData-XYZ extension is now active!');

    /**
     * Generate XYZ directly from NPY file (right-click menu)
     */
    const generateXyzFromNpyCommand = vscode.commands.registerCommand('dpdata-xyz.generateXyzFromNpy', async (fileUri?: vscode.Uri) => {
        try {
            if (!fileUri) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            // Get the NPY file path
            const npyFilePath = fileUri.fsPath;
            
            // Get the directory containing the NPY file
            const npyDir = path.dirname(npyFilePath);
            
            // Get the parent directory (where RAW files should be)
            const parentDir = path.dirname(npyDir);
            
            // Get the directory name to use for output file naming
            const dirName = path.basename(npyDir);
            
            // Find RAW files in parent directory
            const rawFiles = await DirectoryProcessor.findRawFiles(parentDir);
            const typeMapPath = rawFiles['type_map'] || '';
            const typePath = rawFiles['type'] || '';
            
            if (!typeMapPath && !typePath) {
                vscode.window.showErrorMessage(`No type_map.raw or type.raw files found in ${parentDir}`);
                return;
            }
            
            // Find other NPY files in the same directory
            const npyFiles = await DirectoryProcessor.findNpyFiles(npyDir);
            
            // Output format selection
            const outputFormat = await vscode.window.showQuickPick(['xyz', 'extxyz', 'extxyz-full'], {
                placeHolder: 'Select output format'
            }) as 'xyz' | 'extxyz' | 'extxyz-full';
            
            // PBC option for ExtXYZ
            let pbcOption: 'box' | 'fff' = 'fff';
            if (outputFormat === 'extxyz' || outputFormat === 'extxyz-full') {
                pbcOption = await vscode.window.showQuickPick(['box', 'fff'], {
                    placeHolder: 'Select PBC option for periodic boundary conditions'
                }) as 'box' | 'fff';
            }
            
            // Create output file path in parent directory
            const outputFilePath = path.join(parentDir, `${dirName}.${outputFormat === 'extxyz-full' ? 'extxyz' : outputFormat}`);
            
            // Process files
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Generating ${outputFormat.toUpperCase()} file`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Converting NPY to text...' });
                
                try {
                    // Create temporary output directory
                    const txtOutputDir = path.join(npyDir, 'temp_txt_output');
                    await fs.promises.mkdir(txtOutputDir, { recursive: true });
                    
                    // Convert NPY files to TXT
                    const npyFilePaths = Object.values(npyFiles);
                    const txtFiles = await NpyParser.processNpyFiles(
                        npyFilePaths,
                        typeMapPath,
                        typePath,
                        txtOutputDir
                    );
                    
                    progress.report({ increment: 50, message: 'Generating XYZ file...' });
                    
                    // Required files for XYZ generation
                    const requiredFiles = {
                        atomTypes: txtFiles['real_atom_types'] || path.join(txtOutputDir, 'real_atom_types.txt'),
                        coordinates: txtFiles['coord.npy'] || '',
                        energies: txtFiles['energy.npy'] || ''
                    };
                    
                    if (!requiredFiles.coordinates || !requiredFiles.energies) {
                        throw new Error(`Missing required files in ${npyDir}. Need coord.npy and energy.npy.`);
                    }
                    
                    // Additional files for ExtXYZ
                    const optionalFiles = {
                        forces: txtFiles['force.npy'] || '',
                        box: txtFiles['box.npy'] || ''
                    };
                    
                    let resultPath = '';
                    
                    // Generate XYZ or ExtXYZ
                    if (outputFormat === 'xyz') {
                        resultPath = await XyzGenerator.generateXyz(
                            requiredFiles.atomTypes,
                            requiredFiles.coordinates,
                            requiredFiles.energies,
                            outputFilePath
                        );
                    } else if (outputFormat === 'extxyz') {
                        resultPath = await XyzGenerator.generateExtXyz(
                            requiredFiles.atomTypes,
                            requiredFiles.coordinates,
                            requiredFiles.energies,
                            optionalFiles.forces,
                            optionalFiles.box,
                            pbcOption,
                            outputFilePath,
                            false // 不包含所有属性
                        );
                    } else if (outputFormat === 'extxyz-full') {
                        resultPath = await XyzGenerator.generateExtXyz(
                            requiredFiles.atomTypes,
                            requiredFiles.coordinates,
                            requiredFiles.energies,
                            optionalFiles.forces,
                            optionalFiles.box,
                            pbcOption,
                            outputFilePath,
                            true // 包含所有属性
                        );
                    }
                    
                    progress.report({ increment: 100, message: 'Completed!' });
                    
                    // Clean up temporary files
                    try {
                        await fs.promises.rm(txtOutputDir, { recursive: true, force: true });
                    } catch (cleanupError) {
                        console.error('Error cleaning up temporary files:', cleanupError);
                    }
                    
                    vscode.window.showInformationMessage(`Successfully generated ${path.basename(resultPath)}`);
                    
                    // Open the generated file
                    const openFile = await vscode.window.showQuickPick(['Yes', 'No'], {
                        placeHolder: 'Open the generated file?'
                    });
                    
                    if (openFile === 'Yes') {
                        const doc = await vscode.workspace.openTextDocument(resultPath);
                        await vscode.window.showTextDocument(doc);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error generating ${outputFormat.toUpperCase()}: ${error}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error processing file: ${error}`);
        }
    });

    /**
     * Parse NPY files to text
     */
    const parseNpyCommand = vscode.commands.registerCommand('dpdata-xyz.parseNPY', async (fileUri?: vscode.Uri) => {
        try {
            // Get the NPY file path
            let npyFilePath: string | undefined;
            if (fileUri) {
                npyFilePath = fileUri.fsPath;
            } else {
                const fileUris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: true,
                    filters: { 'NPY Files': ['npy'] },
                    title: 'Select NPY Files'
                });
                
                if (!fileUris || fileUris.length === 0) {
                    return;
                }
                
                // Get type_map.raw file
                const typeMapUris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: { 'RAW Files': ['raw'] },
                    title: 'Select type_map.raw File'
                });
                
                if (!typeMapUris || typeMapUris.length === 0) {
                    vscode.window.showErrorMessage('Type map file is required');
                    return;
                }
                
                const typeMapPath = typeMapUris[0].fsPath;
                
                // Optionally get type.raw file
                const getTypeFile = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Do you want to provide a type.raw file?'
                });
                
                let typePath: string | undefined;
                if (getTypeFile === 'Yes') {
                    const typeUris = await vscode.window.showOpenDialog({
                        canSelectFiles: true,
                        canSelectFolders: false,
                        canSelectMany: false,
                        filters: { 'RAW Files': ['raw'] },
                        title: 'Select type.raw File'
                    });
                    
                    if (typeUris && typeUris.length > 0) {
                        typePath = typeUris[0].fsPath;
                    }
                }
                
                // Get output directory
                const outputDirUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: 'Select Output Directory'
                });
                
                if (!outputDirUri || outputDirUri.length === 0) {
                    vscode.window.showErrorMessage('Output directory is required');
                    return;
                }
                
                const outputDir = outputDirUri[0].fsPath;
                
                // Process the files
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Processing NPY Files',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });
                    
                    const npyFiles = fileUris.map(uri => uri.fsPath);
                    const results = await NpyParser.processNpyFiles(
                        npyFiles,
                        typeMapPath,
                        typePath,
                        outputDir
                    );
                    
                    progress.report({ increment: 100 });
                    
                    vscode.window.showInformationMessage(`Successfully processed ${npyFiles.length} NPY files`);
                    
                    // Open the output directory
                    const openOutputDir = await vscode.window.showQuickPick(['Yes', 'No'], {
                        placeHolder: 'Open output directory?'
                    });
                    
                    if (openOutputDir === 'Yes') {
                        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(outputDir), { forceNewWindow: true });
                    }
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error processing NPY files: ${error}`);
        }
    });

    /**
     * Generate XYZ file
     */
    const generateXyzCommand = vscode.commands.registerCommand('dpdata-xyz.generateXYZ', async () => {
        try {
            // Get atom types file
            const atomTypesUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Text Files': ['txt'] },
                title: 'Select real_atom_types.txt File'
            });
            
            if (!atomTypesUri || atomTypesUri.length === 0) {
                return;
            }
            
            // Get coordinates file
            const coordsUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Text Files': ['txt'] },
                title: 'Select coord.txt File'
            });
            
            if (!coordsUri || coordsUri.length === 0) {
                return;
            }
            
            // Get energy file
            const energyUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Text Files': ['txt'] },
                title: 'Select energy.txt File'
            });
            
            if (!energyUri || energyUri.length === 0) {
                return;
            }
            
            // Save dialog for output file
            const outputUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(path.dirname(atomTypesUri[0].fsPath), 'output.xyz')),
                filters: { 'XYZ Files': ['xyz'] },
                title: 'Save XYZ File As'
            });
            
            if (!outputUri) {
                return;
            }
            
            // Generate XYZ file
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating XYZ File',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                
                const xyzFilePath = await XyzGenerator.generateXyz(
                    atomTypesUri[0].fsPath,
                    coordsUri[0].fsPath,
                    energyUri[0].fsPath,
                    outputUri.fsPath
                );
                
                progress.report({ increment: 100 });
                
                vscode.window.showInformationMessage(`Successfully generated XYZ file: ${path.basename(xyzFilePath)}`);
                
                // Open the generated file
                const openFile = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Open the generated XYZ file?'
                });
                
                if (openFile === 'Yes') {
                    const doc = await vscode.workspace.openTextDocument(xyzFilePath);
                    await vscode.window.showTextDocument(doc);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error generating XYZ file: ${error}`);
        }
    });

    /**
     * Generate ExtXYZ file
     */
    const generateExtXyzCommand = vscode.commands.registerCommand('dpdata-xyz.generateExtXYZ', async () => {
        try {
            // Get atom types file
            const atomTypesUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Text Files': ['txt'] },
                title: 'Select real_atom_types.txt File'
            });
            
            if (!atomTypesUri || atomTypesUri.length === 0) {
                return;
            }
            
            // Get coordinates file
            const coordsUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Text Files': ['txt'] },
                title: 'Select coord.txt File'
            });
            
            if (!coordsUri || coordsUri.length === 0) {
                return;
            }
            
            // Get energy file
            const energyUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Text Files': ['txt'] },
                title: 'Select energy.txt File'
            });
            
            if (!energyUri || energyUri.length === 0) {
                return;
            }
            
            // Optionally get forces file
            const includeForces = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Include forces data?'
            });
            
            let forcesUri: vscode.Uri[] | undefined;
            if (includeForces === 'Yes') {
                forcesUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: { 'Text Files': ['txt'] },
                    title: 'Select force.txt File'
                });
            }
            
            // Optionally get box file
            const includeBox = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Include box data?'
            });
            
            let boxUri: vscode.Uri[] | undefined;
            if (includeBox === 'Yes') {
                boxUri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: { 'Text Files': ['txt'] },
                    title: 'Select box.txt File'
                });
            }
            
            // ExtXYZ format type
            const extxyzType = await vscode.window.showQuickPick(['Standard', 'Full (include all properties)'], {
                placeHolder: 'Select ExtXYZ format type'
            });
            
            const includeAllProperties = extxyzType === 'Full (include all properties)';
            
            // PBC option
            const pbcOption = await vscode.window.showQuickPick(['box', 'fff'], {
                placeHolder: 'Select PBC option'
            }) as 'box' | 'fff';
            
            // Save dialog for output file
            const outputUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(path.dirname(atomTypesUri[0].fsPath), 'output.extxyz')),
                filters: { 'ExtXYZ Files': ['extxyz'] },
                title: 'Save ExtXYZ File As'
            });
            
            if (!outputUri) {
                return;
            }
            
            // Generate ExtXYZ file
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating ExtXYZ File',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                
                const extxyzFilePath = await XyzGenerator.generateExtXyz(
                    atomTypesUri[0].fsPath,
                    coordsUri[0].fsPath,
                    energyUri[0].fsPath,
                    forcesUri ? forcesUri[0].fsPath : undefined,
                    boxUri ? boxUri[0].fsPath : undefined,
                    pbcOption,
                    outputUri.fsPath,
                    includeAllProperties
                );
                
                progress.report({ increment: 100 });
                
                vscode.window.showInformationMessage(`Successfully generated ExtXYZ file: ${path.basename(extxyzFilePath)}`);
                
                // Open the generated file
                const openFile = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Open the generated ExtXYZ file?'
                });
                
                if (openFile === 'Yes') {
                    const doc = await vscode.workspace.openTextDocument(extxyzFilePath);
                    await vscode.window.showTextDocument(doc);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error generating ExtXYZ file: ${error}`);
        }
    });

    /**
     * Process DPData Directory
     */
    const processDirectoryCommand = vscode.commands.registerCommand('dpdata-xyz.processDirectory', async (dirUri?: vscode.Uri) => {
        try {
            // Get the directory path
            let dirPath: string;
            if (dirUri) {
                dirPath = dirUri.fsPath;
            } else {
                const dirUris = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: 'Select DPData Directory'
                });
                
                if (!dirUris || dirUris.length === 0) {
                    return;
                }
                
                dirPath = dirUris[0].fsPath;
            }
            
            // Check if the directory structure is valid
            if (!(await fs.promises.stat(dirPath)).isDirectory()) {
                vscode.window.showErrorMessage('Selected path is not a directory');
                return;
            }
            
            // Look for raw files and set directories
            const rawFiles = await DirectoryProcessor.findRawFiles(dirPath);
            if (!rawFiles['type_map'] && !rawFiles['type']) {
                vscode.window.showErrorMessage('No type_map.raw or type.raw files found in the selected directory');
                return;
            }
            
            const setDirs = await DirectoryProcessor.findSetDirectories(dirPath);
            if (setDirs.length === 0) {
                vscode.window.showErrorMessage('No set.XXX directories found in the selected directory');
                return;
            }
            
            // Choose output format
            const outputFormat = await vscode.window.showQuickPick(['xyz', 'extxyz', 'extxyz-full'], {
                placeHolder: 'Select output format'
            }) as 'xyz' | 'extxyz' | 'extxyz-full';
            
            // Choose PBC option for ExtXYZ
            let pbcOption: 'box' | 'fff' = 'fff';
            if (outputFormat === 'extxyz' || outputFormat === 'extxyz-full') {
                pbcOption = await vscode.window.showQuickPick(['box', 'fff'], {
                    placeHolder: 'Select PBC option'
                }) as 'box' | 'fff';
            }
            
            // Process the directory
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Processing DPData Directory',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Starting processing...' });
                
                try {
                    const results = await DirectoryProcessor.processDpDataDirectory(
                        dirPath,
                        outputFormat,
                        pbcOption
                    );
                    
                    progress.report({ increment: 100, message: 'Processing complete' });
                    
                    const numFiles = Object.keys(results).length;
                    vscode.window.showInformationMessage(`Successfully processed ${numFiles} sets in the DPData directory`);
                    
                    // Show list of generated files
                    const fileList = Object.entries(results).map(([setName, filePath]) => ({
                        label: setName,
                        description: filePath,
                    }));
                    
                    const selectedFile = await vscode.window.showQuickPick(fileList, {
                        placeHolder: 'Select a file to open',
                        title: 'Generated Files'
                    });
                    
                    if (selectedFile) {
                        const doc = await vscode.workspace.openTextDocument(selectedFile.description);
                        await vscode.window.showTextDocument(doc);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Error during processing: ${error}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error processing DPData directory: ${error}`);
        }
    });

    context.subscriptions.push(
        generateXyzFromNpyCommand,
        parseNpyCommand, 
        generateXyzCommand, 
        generateExtXyzCommand, 
        processDirectoryCommand
    );
}

export function deactivate() {}