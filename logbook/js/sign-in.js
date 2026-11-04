// The kit's sign-in screen (app-ui ui/sign-in-screen.js), loaded only while signed out (kit.js loadSignIn), at
// KIT_VERSION. It also imports the kit's labels.js, which the page already has, only for the deploy bundle
// (tools/bundle-logbook.mjs): esbuild puts the core's files that the same lazy imports reach into one file, and the
// screen alone reaches dom.js but not labels.js, which split those two into one more startup file (Checks, "Logbook
// bundle": the Add tab opens from at most 25 scripts).
import 'https://core.anawj.com/ui/1.0.0-rc.90/ui/labels.js';
export { signInScreen } from 'https://core.anawj.com/ui/1.0.0-rc.90/ui/sign-in-screen.js';
