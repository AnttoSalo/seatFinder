function computeStatistics(arrangement, studentsMap, bonusParameter, L, bonusConfig) {
	// arrangement is expected to be an instance of SeatingArrangement (or an object with a "tables" property)
	const tables = arrangement.tables;
	let totalFulfilled = 0;
	let countWithWishes = 0;
	let percentageList = [];
	let noneFulfilled = [];

	function processSeat(studentName, neighbors) {
		if (!studentName) return;
		let student = studentsMap[studentName];
		if (!student) return;
		let fulfilled = 0;
		neighbors.forEach((n) => {
			if (n && student.wishes.includes(n)) fulfilled++;
		});
		if (student.wishes.length > 0) {
			countWithWishes++;
			totalFulfilled += fulfilled;
			let percentage = ((fulfilled / student.wishes.length) * 100).toFixed(1);
			percentageList.push({ name: studentName, percentage });
			if (fulfilled === 0) noneFulfilled.push(studentName);
		} else {
			percentageList.push({ name: studentName, percentage: 'N/A' });
		}
	}
	tables.forEach((table) => {
		// Top row
		table.top.forEach((studentName, i) => {
			let neighbors = [];
			if (i > 0) neighbors.push(table.top[i - 1]);
			if (i < table.top.length - 1) neighbors.push(table.top[i + 1]);
			neighbors.push(table.bottom[i]);
			if (i > 0) neighbors.push(table.bottom[i - 1]);
			if (i < table.bottom.length - 1) neighbors.push(table.bottom[i + 1]);
			processSeat(studentName, neighbors);
		});
		// Bottom row
		table.bottom.forEach((studentName, i) => {
			let neighbors = [];
			if (i > 0) neighbors.push(table.bottom[i - 1]);
			if (i < table.bottom.length - 1) neighbors.push(table.bottom[i + 1]);
			neighbors.push(table.top[i]);
			if (i > 0) neighbors.push(table.top[i - 1]);
			if (i < table.top.length - 1) neighbors.push(table.top[i + 1]);
			processSeat(studentName, neighbors);
		});
		// Bonus seats
		if (bonusConfig === 'left' || bonusConfig === 'both') {
			let studentName = table.bonus_left;
			let neighbors = [table.top[0], table.bottom[0]];
			processSeat(studentName, neighbors);
		}
		if (bonusConfig === 'right' || bonusConfig === 'both') {
			let studentName = table.bonus_right;
			let last = table.top.length - 1;
			let neighbors = [table.top[last], table.bottom[last]];
			processSeat(studentName, neighbors);
		}
	});
	let avgFulfilled = countWithWishes ? (totalFulfilled / countWithWishes).toFixed(1) : 'N/A';
	return { percentageList, noneFulfilled, averageFulfilled: avgFulfilled };
}
exports.computeStatistics = computeStatistics;
