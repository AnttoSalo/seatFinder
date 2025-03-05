const xlsx = require('xlsx');

function parseExcelFile(fileBuffer) {
	const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
	let startRow = 0;
	if (data.length > 0 && data[0][0] && data[0][0].toString().toLowerCase().includes('name')) {
		startRow = 1;
	}
	let students = [];
	for (let i = startRow; i < data.length; i++) {
		const row = data[i];
		if (!row || row.length === 0) continue;
		const name = row[0] ? row[0].toString().trim() : null;
		if (!name) continue;
		const wishesRaw = row[1] ? row[1].toString() : '';
		let wishes = wishesRaw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		const weight = row[2] ? parseFloat(row[2]) : 1;
		students.push({ name, wishes, weight });
	}
	return students;
}
exports.parseExcelFile = parseExcelFile;
