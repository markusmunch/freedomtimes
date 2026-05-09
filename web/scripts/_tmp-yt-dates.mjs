async function datePublished(id) {
	const r = await fetch(`https://www.youtube.com/watch?v=${id}`);
	const t = await r.text();
	const m = t.match(/"datePublished":"([^"]+)"/);
	return m ? m[1] : null;
}

function toDdMmmYyyy(iso) {
	const d = new Date(iso);
	const day = String(d.getUTCDate()).padStart(2, "0");
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

for (const id of ["kKna5QNcHwE", "iFucU3quDIg"]) {
	const iso = await datePublished(id);
	console.log(id, iso, iso ? toDdMmmYyyy(iso) : "?");
}
