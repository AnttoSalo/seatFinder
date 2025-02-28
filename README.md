# SeatFinder

## Overview

SeatFinder is a Node.js application that optimizes student seating arrangements using simulated annealing. It allows manual seat assignments along with automatic optimization and provides interactive visualizations.

It uses a simulated annealing algorithm to find ideal seating configuration (goes through 1,5M iterations). Yet it still doesn't always arrive at perfect arrangement each time, so you'll might have to play around a bit. This problem is surprisingly hard.

## Features

- **Excel Import:**  
  Upload student data via an Excel file (.xlsx) where:
  - **Column 1** contains the student name (e.g., "Firstname Surname").
  - **Column 2** contains zero to four comma-separated names representing seating wishes.
  - **Column 3** (optional) is a float (1–10) representing the student's weight. _(Note: This feature is highly untested; it might work, or might need further adjustments.)_
    Example sheet in this repository, see: seating_wishes_80.xlsx
- **Automatic & Manual Seating Assignment:**  
  You can manually set seats before generating automatic seating arrangement. After generating the arrangement you can then refine it manually if needed.
- **Custom Table Layout Options:**
  - Automatic grid
  - Single row or single column
  - Custom grid with user-defined rows and columns
- **Bonus Seating Configurations:**  
  Option to add bonus seats at the table ends (left, right, or both).
- **Interactive Visualization:**  
  Display the seating arrangement as an interactive SVG with pan and zoom capabilities.
- **Real-Time Swapping:**  
  Interactively swap seats with immediate updates to the seating arrangement, statistics, and charts.
- **Recalculate Seating:**  
  Re-run the optimization for unassigned seats without losing manual assignments.
- **Save & Load Arrangements:**  
  Export the current seating arrangement (with statistics and grid settings) as a JSON file and load it later.
- **Detailed Statistics & Charts:**  
  View real-time seating statistics and advanced charts (using Chart.js).
- **Configurable Optimization:**  
  Adjust optimization parameters (iterations, temperature, cooling rate) and enable/disable an early stop option.

## Setup & Installation

1. Ensure Node.js (v14 or later) is installed.
2. Clone the repository:
   ```
   git clone <repository-url>
   ```
3. Navigate to the project directory
4. Install dependencies:
   ```
   npm install
   ```
5. Start the server:
   ```
   npm start
   ```
6. Open your browser at:
   ```
   http://localhost:5000
   ```

## Usage Instructions

1. On the home (setup) page, configure:
   - Number of tables and seats per table.
   - Bonus seating and table layout options.
2. - **Upload an Excel file (.xlsx)** where:

- **Column 1** contains the student name (e.g., "Firstname Surname").
- **Column 2** contains zero to four comma-separated names representing seating wishes.
- **Column 3** (optional) is a float (1–10) representing the student's weight. (this is highly untested, might work, might not)

3. Alternatively, load a previously saved seating arrangement via JSON.
4. Proceed to manually assign seats if desired using the interactive SVG view.
5. Use available controls to swap seats, recalculate optimal seating, or save the current arrangement.
6. View seating statistics and advanced charts with real-time updates.

## File Structure

- **app.js**: Main Express server and optimization logic.
- **views/**: Pug templates for layout, setup, seating, result visualization, and JSON load.
- **public/css/**: CSS stylesheets.
- **README.md**: Project documentation.

## Customization & Configuration

- Adjust optimization parameters such as iterations, temperature, and cooling rate directly in the code.
- Use the "custom grid" layout option to define rows and columns manually.
- Enable early stop to finish optimization once a perfect seating is found.

## Building the Native Rust Library

The native optimization library is prebuilt and included in the distribution. If you want to build it from source, follow these steps:

1. Ensure you have [Rust and Cargo](https://www.rust-lang.org/tools/install) installed.
2. Open a terminal and navigate to the native library directory:
   ```
   cd /c:/Dev/seatFinder/seat_finder_native
   ```
3. Build the library in release mode:
   ```
   cargo build --release
   ```
4. After a successful build, the compiled library will be located in the `target/release` folder.
5. (Optional) Copy or configure paths as needed so that the Node.js application loads this library.

These instructions are provided for advanced users. By default, the prebuilt library is used.

## License

This project is licensed under the MIT License.

## Acknowledgements

- Panzoom for interactive SVG functionality.
- Chart.js for statistical charts.
- Express and Pug for the web framework and templating.
