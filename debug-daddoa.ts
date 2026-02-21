
import * as fs from 'fs';
import * as path from 'path';

const storagePath = path.join(process.cwd(), 'data', 'keywords-storage.json');
if (!fs.existsSync(storagePath)) {
    console.log('Storage file not found');
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
const keywords = data.keywords.filter(k => k.keyword.includes('다또아'));

console.log(JSON.stringify(keywords, null, 2));
