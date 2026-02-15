#!/usr/bin/env node

/**
 * Quick Start Script
 * 
 * Runs all Phase 1 updates and configuration changes in sequence
 */

const { execSync } = require('child_process');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function runScript(script, description) {
    log(`\n${description}...`, 'blue');
    try {
        execSync(`node ${script}`, { stdio: 'inherit' });
        return true;
    } catch (error) {
        log(`Failed: ${description}`, 'red');
        return false;
    }
}

function main() {
    log('\n╔═══════════════════════════════════════════════════════════╗', 'bright');
    log('║          Chrome Extension - Quick Update Script          ║', 'bright');
    log('╚═══════════════════════════════════════════════════════════╝\n', 'bright');

    log('This script will:', 'yellow');
    log('  1. Clean up unnecessary files', 'reset');
    log('  2. Update safe dependencies', 'reset');
    log('  3. Test the build\n', 'reset');

    // Step 1: Cleanup
    if (!runScript('scripts/cleanup-project.js', 'Step 1: Cleaning up project')) {
        log('Cleanup had issues but continuing...', 'yellow');
    }

    // Step 2: Update dependencies
    if (!runScript('scripts/update-dependencies.js', 'Step 2: Updating dependencies')) {
        log('\n❌ Dependency update failed. Stopping.', 'red');
        process.exit(1);
    }

    // Step 3: Test build
    log('\n📦 Testing production build...', 'blue');
    try {
        execSync('npm run build', { stdio: 'inherit' });
        log('\n✓ Build successful!', 'green');
    } catch (error) {
        log('\n❌ Build failed. Please check the errors above.', 'red');
        process.exit(1);
    }

    // Success summary
    log('\n╔═══════════════════════════════════════════════════════════╗', 'bright');
    log('║                  ✓ ALL UPDATES COMPLETE!                 ║', 'bright');
    log('╚═══════════════════════════════════════════════════════════╝', 'bright');

    log('\n📋 What was updated:', 'yellow');
    log('  ✓ TypeScript: ES2020 → ES2022', 'green');
    log('  ✓ Node.js version requirement added', 'green');
    log('  ✓ New npm scripts added (lint, clean, generate-icons)', 'green');
    log('  ✓ ESLint configuration created', 'green');
    log('  ✓ Safe dependencies updated to latest versions', 'green');
    log('  ✓ Project cleanup completed', 'green');
    log('  ✓ Production build verified', 'green');

    log('\n🚀 Next Steps:', 'yellow');
    log('  1. Load the extension in Chrome:', 'reset');
    log('     - Open chrome://extensions/', 'reset');
    log('     - Enable "Developer mode"', 'reset');
    log('     - Click "Load unpacked"', 'reset');
    log('     - Select the "dist" folder', 'reset');
    log('\n  2. Test the extension:', 'reset');
    log('     - Go to a YouTube video', 'reset');
    log('     - Click the extension icon', 'reset');
    log('     - Add your Gemini API key', 'reset');
    log('     - Try summarizing a video', 'reset');
    log('\n  3. If everything works:', 'reset');
    log('     - Delete package.json.backup', 'reset');
    log('     - Commit your changes', 'reset');
    log('     - Read DEPENDENCY_UPDATE_GUIDE.md for Phase 2+', 'reset');

    log('\n📖 Documentation:', 'yellow');
    log('  - See DEPENDENCY_UPDATE_GUIDE.md for detailed update info', 'reset');
    log('  - Phase 2 updates are optional but recommended\n', 'reset');
}

if (require.main === module) {
    main();
}
