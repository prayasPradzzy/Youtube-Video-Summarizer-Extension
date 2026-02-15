#!/usr/bin/env node

/**
 * Project Cleanup Script
 * 
 * Removes unnecessary files and organizes the project structure
 * - Removes icon.html from public/icons (use scripts/generate-icons.js instead)
 * - Creates utilities folder for development tools (if needed in future)
 */

const fs = require('fs');
const path = require('path');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function main() {
    log('\n🧹 Project Cleanup Script\n', 'blue');

    const iconHtmlPath = path.join(__dirname, '..', 'public', 'icons', 'icon.html');

    // Check if icon.html exists
    if (fs.existsSync(iconHtmlPath)) {
        log('Found: public/icons/icon.html', 'yellow');
        log('This file is a browser-based icon generator utility.', 'reset');
        log('The proper icon generator is: scripts/generate-icons.js\n', 'reset');

        try {
            // Create backup first
            const backupPath = iconHtmlPath + '.backup';
            fs.copyFileSync(iconHtmlPath, backupPath);
            log('✓ Created backup: icon.html.backup', 'green');

            // Remove the file
            fs.unlinkSync(iconHtmlPath);
            log('✓ Removed: public/icons/icon.html', 'green');
            
            log('\n📝 Note: Backup saved as icon.html.backup', 'yellow');
            log('If you need the browser-based generator, create a utilities/ folder.', 'yellow');
            log('\nTo generate icons properly, use:', 'blue');
            log('  npm run generate-icons\n', 'reset');

        } catch (error) {
            log(`✗ Failed to remove file: ${error.message}`, 'red');
        }
    } else {
        log('✓ No cleanup needed - icon.html not found', 'green');
    }

    // Check for other potential cleanup items
    log('\n🔍 Additional Checks:\n', 'blue');

    const checks = [
        {
            path: path.join(__dirname, '..', 'package.json.backup'),
            message: 'Old package.json.backup exists - can be deleted if updates were successful'
        },
        {
            path: path.join(__dirname, '..', 'dist'),
            message: 'Build directory exists - run "npm run clean" to remove if needed'
        }
    ];

    checks.forEach(({ path: checkPath, message }) => {
        if (fs.existsSync(checkPath)) {
            log(`ℹ ${message}`, 'yellow');
        }
    });

    log('\n✓ Cleanup complete!\n', 'green');
}

if (require.main === module) {
    main();
}

module.exports = { main };
