# DPData XYZ Extension

A VSCode extension for processing DPData .npy and .raw files to generate XYZ and ExtXYZ molecular files.

## Features

- **Parse NPY files to text**: Convert binary NumPy (.npy) files to human-readable text files
- **Generate XYZ files**: Combine atom types, coordinates, and energy data into standard XYZ molecular format
- **Generate ExtXYZ files**: Create extended XYZ files with additional metadata like forces and box parameters
- **Process DPData directories**: Automatically process entire DPData directory structures to produce XYZ files

## Usage

The extension provides several commands:

- **Parse NPY Files to Text**: Right-click on a .npy file and select "Parse NPY Files to Text"
- **Generate XYZ File**: Run command from the command palette to select input files and generate XYZ output
- **Generate ExtXYZ File**: Run command from the command palette to select input files and generate ExtXYZ output
- **Process DPData Directory to XYZ**: Right-click on a folder and select "Process DPData Directory to XYZ"

## File Structure

This extension works with the DPData format, which typically includes:

- `type_map.raw`: Maps atom type indices to element symbols
- `type.raw`: Contains type indices for atoms
- Various .npy files in set.XXX directories, including:
  - `coord.npy`: Atomic coordinates
  - `energy.npy`: Energy data
  - `force.npy`: Force data (optional)
  - `box.npy`: Periodic boundary conditions (optional)

## Requirements

- Visual Studio Code 1.98.0 or higher
