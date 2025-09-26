const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#3498db';
    ctx.fillRect(0, 0, size, size);

    // "YT" text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('YT', size/2, size/2);

    // Save the image
    const buffer = canvas.toBuffer('image/png');
    const filePath = path.join(__dirname, '..', 'public', 'icons', `icon${size}.png`);
    fs.writeFileSync(filePath, buffer);
    console.log(`Generated ${filePath}`);
}

// Generate all sizes
[16, 32, 48, 128].forEach(size => generateIcon(size)); 