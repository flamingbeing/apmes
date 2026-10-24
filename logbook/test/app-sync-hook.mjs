// Unit tests that load app-sync (through js/app-sync.js): import this first, then the modules under test with a
// dynamic import (static imports are all loaded before this runs).
import { register } from 'node:module';
register('./app-sync-loader.mjs', import.meta.url);
