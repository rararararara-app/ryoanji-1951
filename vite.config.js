import { defineConfig } from 'vite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));   // paths work from any working directory

// audio/manifest.json lists whatever is in public/audio, so the soundscape only requests files that exist.
// Drop new layers (bird-01.mp3, creak-01.mp3, bell.mp3 …) into public/audio and they are picked up.
const listAudio = () => JSON.stringify(existsSync(here('public/audio'))
  ? readdirSync(here('public/audio')).filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f))
  : []);   // audio isn't in git: a fresh clone simply plays nothing
const audioManifest = {
  name: 'audio-manifest',
  configureServer(server) {
    server.middlewares.use('/audio/manifest.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(listAudio());
    });
    // The Bischof photo is for the POV overlay check only: served by the dev server, never copied into the build.
    server.middlewares.use('/reference/bischof-ryoanji-1951.jpg', (_req, res) => {
      const file = here('dev-reference/bischof-ryoanji-1951.jpg');
      if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'image/jpeg');
      res.end(readFileSync(file));
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'audio/manifest.json', source: listAudio() });
  },
};

// Relative base so the static build runs from any folder or subpath.
export default defineConfig({
  root: here('.'),
  base: './',
  appType: 'mpa',
  plugins: [audioManifest],
  build: { chunkSizeWarningLimit: 800 },
});
