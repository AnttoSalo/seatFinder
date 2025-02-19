# SeatFinder

## Overview
SeatFinder is a Node.js application that optimizes student seating arrangements using simulated annealing. It allows manual seat assignments along with automatic optimization and provides interactive visualizations.

## Features
- Upload student data via an Excel file.
- Automatic and manual seating assignment.
- Custom table layout options:
  - Automatic grid
  - Single row or column
  - Custom grid with user-defined rows and columns
- Bonus seating configurations (left, right, both).
- Interactive seating visualization with SVG, pan, and zoom.
- Real-time swapping of seats.
- Save and load seating arrangements as JSON.
- Detailed statistics and charts using Chart.js.

## Setup & Installation

1. Ensure Node.js (v14 or later) is installed.
2. Clone the repository:
   ```
   git clone <repository-url>
   ```
3. Navigate to the project directory:
   ```
   cd /c:/Dev/seatFinder
   ```
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
2. Upload an Excel file containing student names and seating preferences.
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

## License
[Include license information if applicable]

## Acknowledgements
- Panzoom for interactive SVG functionality.
- Chart.js for statistical charts.
- Express and Pug for the web framework and templating.
