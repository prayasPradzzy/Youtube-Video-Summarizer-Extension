#!/usr/bin/env node

/**
 * Automated Dependency Update Script - Phase 1 (Safe Updates)
 * 
 * This script updates low-risk dependencies that have minor/patch version updates.
 * These updates should not cause breaking changes.
 * 
 * Run with: node scripts/update-dependencies.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
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

function runCommand(command, description) {
    log(`\n► ${description}...`, 'blue');
    try {
        execSync(command, { stdio: 'inherit' });
        log(`✓ ${description} completed`, 'green');
        return true;
    } catch (error) {
        log(`✗ ${description} failed`, 'red');
        return false;
    }
}

function backupPackageJson() {
    const packagePath = path.join(__dirname, '..', 'package.json');
    const backupPath = path.join(__dirname, '..', 'package.json.backup');
    
    try {
        fs.copyFileSync(packagePath, backupPath);
        log('✓ Created backup: package.json.backup', 'green');
        return true;
    } catch (error) {
        log('✗ Failed to create backup', 'red');
        return false;
    }
}

function main() {
    log('\n╔════════════════════════════════════════════════════════════╗', 'bright');
    log('║     Chrome Extension Dependency Update - Phase 1          ║', 'bright');
    log('║                   (Safe Updates Only)                      ║', 'bright');
    log('╚════════════════════════════════════════════════════════════╝\n', 'bright');

    // Step 1: Backup package.json
    log('STEP 1: Creating backup', 'yellow');
    if (!backupPackageJson()) {
        log('\nAborting update process.', 'red');
        process.exit(1);
    }

    // Step 2: Update safe dependencies
    log('\nSTEP 2: Updating safe dependencies', 'yellow');
    
    const safeUpdates = [
        { pkg: 'typescript', version: 'latest', desc: 'TypeScript (5.8.3 → 5.9.3)' },
        { pkg: 'ts-loader', version: 'latest', desc: 'TS Loader (9.5.2 → 9.5.4)' },
        { pkg: 'webpack', version: '^5.105.2', desc: 'Webpack (5.99.9 → 5.105.2)' },
        { pkg: 'copy-webpack-plugin', version: 'latest', desc: 'Copy Webpack Plugin (13.0.0 → 13.0.1)' },
        { pkg: 'canvas', version: 'latest', desc: 'Canvas (3.1.0 → 3.2.1)' }
    ];

    let successCount = 0;
    let failCount = 0;

    for (const { pkg, version, desc } of safeUpdates) {
        const command = `npm install --save-dev ${pkg}@${version}`;
        if (runCommand(command, `Installing ${desc}`)) {
            successCount++;
        } else {
            failCount++;
        }
    }

    // Step 3: Summary
    log('\n╔════════════════════════════════════════════════════════════╗', 'bright');
    log('║                      UPDATE SUMMARY                        ║', 'bright');
    log('╚════════════════════════════════════════════════════════════╝', 'bright');
    log(`\nSuccessful updates: ${successCount}`, 'green');
    if (failCount > 0) {
        log(`Failed updates: ${failCount}`, 'red');
        log('\nTo restore previous state:', 'yellow');
        log('  mv package.json.backup package.json', 'yellow');
        log('  npm install', 'yellow');
    } else {
        log('All updates completed successfully!', 'green');
    }

    // Step 4: Next steps
    log('\n╔════════════════════════════════════════════════════════════╗', 'bright');
    log('║                       NEXT STEPS                           ║', 'bright');
    log('╚════════════════════════════════════════════════════════════╝', 'bright');
    log('\n1. Test the build:', 'yellow');
    log('   npm run build', 'reset');
    log('\n2. Load the extension in Chrome and test functionality', 'yellow');
    log('\n3. If everything works, proceed to Phase 2 updates:', 'yellow');
    log('   - Update @types/chrome', 'reset');
    log('   - Update css-loader and style-loader', 'reset');
    log('\n4. Keep package.json.backup until you verify everything works', 'yellow');

    log('\n✓ Update script completed!\n', 'green');
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { backupPackageJson, runCommand };
