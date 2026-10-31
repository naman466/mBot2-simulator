import { ZipReader, BlobReader, TextWriter } from '@zip.js/zip.js';

/** Reads the project.json out of an .mblock file (a zip archive), or a bare project.json. */
export async function readProjectFile(file: File): Promise<unknown> {
	const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
	if (!isZip) {
		try {
			return JSON.parse(await file.text());
		} catch {
			throw new Error(`"${file.name}" isn't an mBlock file. In mBlock use File → Save to your computer.`);
		}
	}
	const reader = new ZipReader(new BlobReader(file));
	try {
		const entries = await reader.getEntries();
		const entry = entries.find((e) => e.filename === 'project.json');
		if (!entry || !entry.getData) throw new Error(`"${file.name}" doesn't contain an mBlock project.`);
		return JSON.parse(await entry.getData(new TextWriter()));
	} finally {
		await reader.close();
	}
}
