

// SeatingArrangement class encapsulating the seating data and helper methods.
class SeatingArrangement {
	constructor(tables = []) {
		this.tables = tables;
	}
	// Factory method to create an empty seating arrangement.
	static createEmpty(numTables, L, bonusConfig) {
		let tables = [];
		for (let t = 0; t < numTables; t++) {
			let table = {
				top: new Array(L).fill(''),
				bottom: new Array(L).fill(''),
				bonus_left: bonusConfig === 'left' || bonusConfig === 'both' ? '' : null,
				bonus_right: bonusConfig === 'right' || bonusConfig === 'both' ? '' : null
			};
			tables.push(table);
		}
		return new SeatingArrangement(tables);
	}
	// Returns the value in the seat given the coordinate.
	getSeat(coord) {
		let table = this.tables[coord.table];
		if (!table) return undefined;
		if (coord.section === 'top' || coord.section === 'bottom') {
			return table[coord.section][coord.index];
		} else if (coord.section === 'bonus_left') {
			return table.bonus_left;
		} else if (coord.section === 'bonus_right') {
			return table.bonus_right;
		}
	}
	// Sets a seat value at the given coordinate.
	setSeat(coord, value) {
		let table = this.tables[coord.table];
		if (!table) return;
		if (coord.section === 'top' || coord.section === 'bottom') {
			table[coord.section][coord.index] = value;
		} else if (coord.section === 'bonus_left') {
			table.bonus_left = value;
		} else if (coord.section === 'bonus_right') {
			table.bonus_right = value;
		}
	}
	// Swaps seats between two coordinates.
	swapSeats(coord1, coord2) {
		let temp = this.getSeat(coord1);
		this.setSeat(coord1, this.getSeat(coord2));
		this.setSeat(coord2, temp);
	}
	// Ensure JSON.stringify returns an object with tables.
	toJSON() {
		return { tables: this.tables };
	}
}
exports.SeatingArrangement = SeatingArrangement;
