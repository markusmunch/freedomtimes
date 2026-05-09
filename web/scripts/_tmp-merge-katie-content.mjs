/** Reads MCP content_get JSON from stdin or first argv path; prints { mergedContent, _rev } as JSON. */
import { readFileSync } from "node:fs";

const path = process.argv[2];
const raw = readFileSync(path, "utf8");
const j = JSON.parse(raw);

function row(bk, prefix, quotedTitle, href) {
	const linkKey = `lnk-${bk}`;
	return {
		_type: "block",
		_key: bk,
		style: "normal",
		children: [
			{ _type: "span", _key: `${bk}-p`, text: prefix },
			{
				_type: "span",
				_key: `${bk}-t`,
				text: `"${quotedTitle}"`,
				marks: [linkKey],
			},
			{ _type: "span", _key: `${bk}-d`, text: ". " },
			{ _type: "span", _key: `${bk}-u`, text: href },
		],
		markDefs: [{ _type: "link", _key: linkKey, href, blank: true }],
	};
}

function katieSourceTail() {
	const h2 = {
		_type: "block",
		_key: "ks-src-h2",
		style: "h2",
		children: [
			{
				_type: "span",
				_key: "ks-src-h2t",
				text: "Sources and Further Reading",
			},
		],
	};

	const book = {
		_type: "block",
		_key: "ks-s4",
		style: "normal",
		children: [
			{
				_type: "span",
				_key: "ks-s4-p",
				text: "John Duignan & Nicola Tallant, Merlin Publishing, 2008: ",
			},
			{
				_type: "span",
				_key: "ks-s4-t",
				text: '"The Complex: An Insider Exposes the Covert World of the Church of Scientology"',
				marks: ["lnk-ks-s4"],
			},
			{ _type: "span", _key: "ks-s4-d", text: ". " },
			{
				_type: "span",
				_key: "ks-s4-u1",
				text: "https://www.abebooks.co.uk/9781903582848/Complex-Insider-Exposes-Covert-World-1903582849/plp",
			},
			{ _type: "span", _key: "ks-s4-sp", text: " " },
			{
				_type: "span",
				_key: "ks-s4-u2",
				text: "https://en.wikipedia.org/wiki/The_Complex:_An_Insider_Exposes_the_Covert_World_of_the_Church_of_Scientology",
			},
		],
		markDefs: [
			{
				_type: "link",
				_key: "lnk-ks-s4",
				href: "https://www.abebooks.co.uk/9781903582848/Complex-Insider-Exposes-Covert-World-1903582849/plp",
				blank: true,
			},
		],
	};

	return [
		h2,
		row(
			"ks-s1",
			"Department of Justice Northern Ireland, Dr Jan Melia, 27 April 2026: ",
			"The Katie Simpson Review",
			"https://www.justice-ni.gov.uk/publications/katie-simpson-review",
		),
		row(
			"ks-s2",
			"Crime World, Nicola Tallant [0:34:00]: ",
			"Groomed (Part 4) - Building the Cult",
			"https://www.youtube.com/watch?v=kKna5QNcHwE",
		),
		row(
			"ks-s3",
			"Crime World, Jenny Friel & Nuala Lappin: ",
			"Katie Simpson Review",
			"https://www.youtube.com/watch?v=iFucU3quDIg",
		),
		book,
		row(
			"ks-s5",
			"Nicola Tallant, Crime World, 14 May 2023: ",
			"How I Signed Up With Sunday World to Take Down Ireland's Biggest Criminals",
			"https://www.crimeworld.com/ireland/nicola-tallant-how-i-signed-up-with-sunday-world-to-take-down-irelands-biggest-criminals/a/103554694.html",
		),
		row(
			"ks-s6",
			"Nicola Tallant & Padraig O'Reilly, Sunday World, 26 July 2009: ",
			"Boom And Bust",
			"https://educocult.com/press/boom_and_bust_sunday_world_26_july_2009-swzlb9.shtml",
		),
		row(
			"ks-s7",
			"Nicola Tallant, Sunday World, 15 June 2014: ",
			"Look Who's Back Quinn Town",
			"https://educocult.com/press/look_whos_back_quinn_town_sunday_world_june_15-tzt8c3.shtml",
		),
	];
}

const content = j.item.data.content;
const idx = content.findIndex(
	(b) =>
		b.style === "h2" &&
		b.children?.[0]?.text === "Sources and Further Reading",
);
if (idx < 0) throw new Error("Sources h2 not found");
const merged = [...content.slice(0, idx), ...katieSourceTail()];
process.stdout.write(
	JSON.stringify({ mergedContent: merged, _rev: j._rev }, null, 2),
);
