// Import a versioned RHVideo frontend artifact; never copy/rewrite its UI sources.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const destination = fileURLToPath(new URL('../src/vendor/rhvideo/frontend/', import.meta.url));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export function verify(root = destination) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    if (manifest.format !== 'rhvideo-frontend' || manifest.version !== 1 || manifest.hostProtocol !== 1) throw Error('Unsupported RHVideo frontend protocol');
    if (hash(JSON.stringify(manifest.files)) !== manifest.id || manifest.entry !== 'static/index.html') throw Error('Invalid frontend identity');
    for (const [file, spec] of Object.entries(manifest.files)) {
        if (!/^static\/(?:[a-z0-9-]+\.(html|css|js|json)|vendor\/pinyin-pro\/(?:pinyin-pro-3\.29\.5\.js|LICENSE))$/.test(file)) throw Error('Invalid frontend asset: ' + file);
        const bytes = fs.readFileSync(path.join(root, file));
        if (hash(bytes) !== spec.sha256 || bytes.length !== spec.bytes) throw Error('Frontend asset does not match manifest: ' + file);
    }
    return manifest;
}
export function install(source) {
    const manifest = verify(source);
    fs.mkdirSync(destination, {recursive: true});
    for (const file of ['manifest.json', ...Object.keys(manifest.files)]) {
        const target = path.join(destination, file); fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.copyFileSync(path.join(source, file), target);
    }
    // Only the entry wrapper is generated. Every shared source remains byte-identical.
    const entry = fs.readFileSync(path.join(destination, manifest.entry), 'utf8')
        .replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:*; media-src 'none'; connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost http://127.0.0.1:*; worker-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'">\n<script src="js/automation-core.js"></script>\n<script src="js/rhvideo-shared-host.js"></script>`)
        .replaceAll('href="/static/', 'href="vendor/rhvideo/frontend/static/')
        .replaceAll('src="/static/', 'src="vendor/rhvideo/frontend/static/');
    fs.writeFileSync(path.resolve(destination, '../../../rhvideo-shared.html'), entry);
    return verify();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const at = process.argv.indexOf('--import');
    console.log(JSON.stringify(at < 0 ? verify() : install(path.resolve(process.argv[at + 1])), null, 2));
}
